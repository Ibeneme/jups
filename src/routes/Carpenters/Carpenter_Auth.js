const express = require("express");
const nodemailer = require("nodemailer");
const Carpenter = require("../../models/Carpenters/Carpenter");
const OTP = require("../../models/OTP");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const ProductionOrder = require("../../models/ProductionOrder");

const JWT_SECRET = process.env.JWT_SECRET || "clonekraft_super_secret_2026";
const carpenterAuthRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- TRANSPORTER ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// --- EMAIL TEMPLATE ---
const getCarpenterEmailTemplate = (otp) => {
  const accentColor = "#C1A170";
  return {
    subject: `[CloneKraft] Carpenter Access Code - ${otp}`,
    html: `
      <body style="font-family: sans-serif; background-color: #000; color: #fff; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #111; padding: 40px; border-radius: 24px; border: 1px solid #C1A17033;">
          <h2 style="margin: 0;">Clone<span style="color: ${accentColor};">Kraft</span> <span style="font-size: 12px; opacity: 0.5;">CARPENTER PORTAL</span></h2>
          <hr style="border: 0; border-top: 1px solid #ffffff11; margin: 20px 0;" />
          <p style="color: #aaa;">Your secure login code is below:</p>
          <div style="background: #ffffff05; padding: 30px; text-align: center; border-radius: 16px; margin: 20px 0;">
            <h1 style="letter-spacing: 12px; color: ${accentColor}; margin: 0;">${otp}</h1>
          </div>
          <p style="color: #555; font-size: 11px;">If you did not request this, please contact the workshop manager.</p>
        </div>
      </body>
    `,
  };
};

// 1. REQUEST OTP (CARPENTER)
carpenterAuthRouter.post("/login/request-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const userEmail = email.toLowerCase().trim();

  try {
    const carpenter = await Carpenter.findOne({ email: userEmail });

    if (!carpenter)
      return res.status(404).json({ message: "Carpenter account not found." });

    if (carpenter.status !== "approved" || !carpenter.isWhitelisted) {
      return res.status(403).json({
        message:
          "Access Denied. Your account must be approved and whitelisted by Admin.",
      });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    await OTP.findOneAndUpdate(
      { type: "CARPENTER_LOGIN", value: userEmail },
      { code: generatedOtp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    const template = getCarpenterEmailTemplate(generatedOtp);
    await transporter.sendMail({
      from: `"CloneKraft" <clonekraft@gmail.com>`,
      to: userEmail,
      ...template,
    });

    res
      .status(200)
      .json({ success: true, message: "OTP sent to registered email." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. VERIFY OTP & LOGIN
carpenterAuthRouter.post("/login/verify-otp", async (req, res) => {
  const { email, code } = req.body;
  const userEmail = email.toLowerCase().trim();

  console.log("--------------------------------------------------");
  console.log(`🔐 [AUTH START] Carpenter Login Attempt`);

  try {
    const otpRecord = await OTP.findOne({
      type: "CARPENTER_LOGIN",
      value: userEmail,
      code,
    });

    if (!otpRecord) {
      return res.status(401).json({ message: "Invalid or expired code." });
    }

    const carpenter = await Carpenter.findOne({ email: userEmail });

    if (!carpenter) {
      return res.status(404).json({ message: "Carpenter profile not found." });
    }

    // Update login telemetry - Fixed "next is not a function" by making sure save hook is called correctly
    carpenter.lastLogin = new Date();
    await carpenter.save();

    const token = jwt.sign(
      {
        id: carpenter._id,
        role: "CARPENTER",
        carpenterId: carpenter.carpenterId,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    await OTP.deleteOne({ _id: otpRecord._id });

    res.json({
      success: true,
      token,
      carpenter: {
        id: carpenter._id,
        fullName: carpenter.fullName,
        carpenterId: carpenter.carpenterId,
        status: carpenter.status,
        availability: carpenter.availability,
      },
    });
  } catch (err) {
    console.error(`☢️ [CRITICAL SYSTEM ERROR]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 3. UPDATE CARPENTER PROFILE & AVAILABILITY
carpenterAuthRouter.patch(
  "/profile/update/:id",
  upload.array("portfolio", 5),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const carpenter = await Carpenter.findById(id);
      if (!carpenter)
        return res.status(404).json({ message: "Carpenter not found." });

      let newPhotos = [...carpenter.portfolioPhotos];
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToBackblaze(
            file.buffer,
            file.originalname,
            "carpenter-portfolio"
          )
        );
        const uploadedUrls = await Promise.all(uploadPromises);
        newPhotos = [...newPhotos, ...uploadedUrls];
      }

      const updatePayload = {
        fullName: updates.fullName || carpenter.fullName,
        whatsappNumber: updates.whatsappNumber || carpenter.whatsappNumber,
        availability: updates.availability || carpenter.availability,
        portfolioPhotos: newPhotos,
        "location.area": updates.area || carpenter.location.area,
        "location.city": updates.city || carpenter.location.city,
      };

      const updated = await Carpenter.findByIdAndUpdate(
        id,
        { $set: updatePayload },
        { new: true }
      );

      res.status(200).json({ success: true, carpenter: updated });
    } catch (error) {
      res.status(500).json({ error: "Profile update failed." });
    }
  }
);

/**
 * 🆕 4. FETCH SINGLE CARPENTER PROFILE BY ID
 * Essential for profile page and session refreshes
 */
carpenterAuthRouter.get("/profile/:id", async (req, res) => {
  console.log("🚀 [GET /profile/:id] Request received");

  const { id } = req.params;
  const { productionOrderId } = req.query;

  console.log("📥 Params:", req.params);
  console.log("📥 Query:", req.query);

  try {
    // ---------------------------
    // 1️⃣ Fetch Carpenter
    // ---------------------------
    console.log("🗄️ Fetching carpenter...");

    const carpenter = await Carpenter.findById(id)
      .select("-otp")
      .populate("productionOrders");

    if (!carpenter) {
      console.warn("⚠️ Carpenter not found:", id);
      return res.status(404).json({
        success: false,
        message: "Carpenter profile not found",
      });
    }

    console.log("✅ Carpenter found:", carpenter.fullName);

    // ---------------------------
    // 2️⃣ If NO productionOrderId
    // ---------------------------
    if (!productionOrderId) {
      console.log("ℹ️ No productionOrderId supplied");

      return res.status(200).json({
        success: true,
        carpenter,
        productionOrder: null,
      });
    }

    // ---------------------------
    // 3️⃣ Fetch Production Order
    // ---------------------------
    console.log("🗄️ Fetching production order:", productionOrderId);

    const productionOrder = await ProductionOrder.findById(productionOrderId)
      .populate("user")
      .populate("assignedCarpenters")
      .populate("assignedDrivers")
      .populate("assignedSuppliers")
      .populate("assignedDesigners");

    if (!productionOrder) {
      console.warn("⚠️ Production order not found");
      return res.status(404).json({
        success: false,
        message: "Production order not found",
      });
    }

    // ---------------------------
    // 4️⃣ Verify Carpenter Assigned
    // ---------------------------
    const isAssigned = productionOrder.assignedCarpenters.some(
      (c) => c._id.toString() === id
    );

    if (!isAssigned) {
      console.warn("⛔ Carpenter not assigned to this order");

      return res.status(403).json({
        success: false,
        message: "Carpenter not assigned to this production order",
      });
    }

    console.log("✅ Carpenter assigned to order");

    // ---------------------------
    // 5️⃣ Success Response
    // ---------------------------
    return res.status(200).json({
      success: true,
      carpenter,
      productionOrder,
    });
  } catch (err) {
    console.error("🔥 ERROR:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// 5. FETCH FULL DASHBOARD DATA (Earnings + Jobs + Ratings)
carpenterAuthRouter.get("/dashboard/:id", async (req, res) => {
  try {
    // 1. Fetch and populate orders
    const carpenter = await Carpenter.findById(req.params.id)
      .select("-otp")
      .populate({
        path: "productionOrders",
        select: "orderId items status createdAt totalAmount carpenterShare",
      });

    if (!carpenter) {
      return res.status(404).json({
        success: false,
        message: "Carpenter workshop not found.",
      });
    }

    const carpenterData = carpenter.toObject();

    // 2. Calculate Financial Summary dynamically if needed
    // Assuming 'pending' status orders count toward pendingEarnings
    // and 'completed' orders count toward totalEarned (Wallet)
    const pendingAmount = carpenterData.productionOrders
      .filter(
        (order) => order.status !== "completed" && order.status !== "delivered"
      )
      .reduce((acc, order) => acc + (order.carpenterShare || 0), 0);

    const withdrawableAmount = carpenterData.earnings?.totalEarned || 0;
    const responseData = {
      ...carpenterData,
      assignedJobs: carpenterData.productionOrders || [],
      earnings: {
        ...carpenterData.earnings,
        pendingEarnings:
          pendingAmount || carpenterData.earnings?.pendingEarnings || 0,
        totalEarned: withdrawableAmount,
        withdrawable: withdrawableAmount, 
      },
    };

    console.log(
      `💰 Financial Sync for ${carpenter.carpenterId}: Wallet(₦${withdrawableAmount}) | Pending(₦${pendingAmount})`
    );

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    console.error("🔥 Dashboard Fetch Error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = carpenterAuthRouter;
