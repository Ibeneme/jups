const router = require("express").Router();
const Admin = require("../../models/Admin/Admin");
const jwt = require("jsonwebtoken");
const sendEmail = require("../../utils/sendEmail");
const ProductionOrder = require("../../models/ProductionOrder");
const Carpenter = require("../../models/Carpenters/Carpenter");
const sendEmailTransporter = require("../../utils/sendEmailTransporter");
const { Driver, Supplier } = require("../../models/Partners/Partners");
const {
  DesignerUser,
} = require("../../models/Interior_Designer/InteriorDesigner");
const InteriorDesigner = require("../../models/Interior_Designer/InteriorDesigner");

// --- MIDDLEWARE: PROTECT ADMIN ROUTES ---
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("🔐 Authorization Header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ No token provided");
    return res
      .status(401)
      .json({ success: false, message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  console.log("🔑 Token extracted:", token);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_secret_key"
    );
    console.log("✅ Token decoded:", decoded);

    // Check if the role is admin
    if (decoded.role !== "admin") {
      console.log("❌ Access forbidden: Not an admin");
      return res
        .status(403)
        .json({ success: false, message: "Access forbidden. Admin only." });
    }

    req.admin = decoded; // Store admin data in request
    next();
  } catch (err) {
    console.log("❌ Invalid or expired token:", err.message);
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

// Helper function to format Full Name
const formatFullName = (name) => {
  if (!name) return "";
  const formatted = name
    .toLowerCase()
    .replace(/(^|[\s-])\S/g, (match) => match.toUpperCase());
  console.log("📝 Fullname formatted:", formatted);
  return formatted;
};
router.post("/send-otp", async (req, res) => {
  const { fullname, email } = req.body;
  console.log("📨 Sending OTP to:", email, "Name:", fullname);

  const sanitizedEmail = email.toLowerCase().trim();
  const sanitizedName = formatFullName(fullname);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // 1. Remove { upsert: true }.
    // This will now return null if the email is not found.
    const updatedAdmin = await Admin.findOneAndUpdate(
      { email: sanitizedEmail },
      { fullname: sanitizedName, otp, otpExpires: Date.now() + 600000 },
      { new: true }
    );

    // 2. Check if the admin exists
    if (!updatedAdmin) {
      console.log(
        "🚫 Login Blocked: Email not found in Admin list:",
        sanitizedEmail
      );
      return res.status(403).json({
        success: false,
        message: "Access denied. This email is not authorized as an admin.",
      });
    }

    console.log("✅ Admin found, OTP stored:", updatedAdmin.email);

    // 3. Only send the email if the user is authorized
    await sendEmail({ to: sanitizedEmail, otp, purpose: "verification" });

    res.status(200).json({ success: true, message: "OTP sent to email!" });
  } catch (err) {
    console.error("❌ Error sending OTP:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- PUBLIC AUTH: SEND OTP ---
// router.post("/send-otp", async (req, res) => {
//   const { fullname, email } = req.body;
//   console.log("📨 Sending OTP to:", email, "Name:", fullname);

//   const sanitizedEmail = email.toLowerCase().trim();
//   const sanitizedName = formatFullName(fullname);
//   const otp = Math.floor(100000 + Math.random() * 900000).toString();
//   console.log("🔢 Generated OTP:", otp);

//   try {
//     const updatedAdmin = await Admin.findOneAndUpdate(
//       { email: sanitizedEmail },
//       { fullname: sanitizedName, otp, otpExpires: Date.now() + 600000 },
//       { upsert: true, new: true }
//     );
//     console.log("✅ Admin record updated/created:", updatedAdmin);

//     await sendEmail({ to: sanitizedEmail, otp, purpose: "verification" });
//     console.log("✉️ OTP sent via email");

//     res.status(200).json({ success: true, message: "OTP sent to email!" });
//   } catch (err) {
//     console.error("❌ Error sending OTP:", err.message);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// --- PUBLIC AUTH: VERIFY OTP ---
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  console.log("📨 Verifying OTP for:", email, "OTP:", otp);

  const sanitizedEmail = email.toLowerCase().trim();

  try {
    const admin = await Admin.findOne({ email: sanitizedEmail });
    console.log("👀 Admin found:", admin);

    if (!admin || admin.otp !== otp || admin.otpExpires < Date.now()) {
      console.log("❌ Invalid or expired OTP");
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    admin.otp = undefined;
    admin.otpExpires = undefined;
    admin.isVerified = true;
    await admin.save();
    console.log("✅ Admin verified and OTP cleared");

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: "24h" }
    );
    console.log("🔑 JWT generated:", token);

    res.status(200).json({
      success: true,
      message: "Admin authenticated",
      token,
      admin: { fullname: admin.fullname, email: admin.email },
    });
  } catch (err) {
    console.error("❌ Error verifying OTP:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/partners/active", async (req, res) => {
  try {
    const [carpenters, drivers, suppliers, designers] = await Promise.all([
      Carpenter.find({ status: "approved" }).select("fullName carpenterId"),
      Driver.find({ status: "Active" }).select("fullName driverId"),
      Supplier.find({ status: "approved" }).select("businessName contactName"),
      InteriorDesigner.find({ status: "approved" }).select(
        "brandIdentity.brandName brandIdentity.contactName"
      ),
    ]);

    res.status(200).json({
      success: true,
      data: { carpenters, drivers, suppliers, designers },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/update-status/:id", async (req, res) => {
  const { id } = req.params;
  // Extract status, amount, and estimatedDays from the request body
  const { status, amount, estimatedDays } = req.body;

  const validStatuses = [
    "pending",
    "in_progress",
    "dispatched",
    "delivered",
    "completed",
    "cancelled",
  ];

  if (!validStatuses.includes(status)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid status value" });
  }

  try {
    // 1. Fetch the order
    const order = await ProductionOrder.findById(id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Initialize update object with the status
    let updateFields = { status };

    // --- PENDING PAYMENT & TIMELINE LOGIC ---
    if (status === "pending" || order.status === "pending") {
      // Handle financial valuation updates
      if (amount !== undefined) {
        const parsedAmount = Number(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
          return res.status(400).json({
            success: false,
            message: "Amount must be a valid positive number",
          });
        }

        updateFields.totalCostNGN = parsedAmount;
        updateFields.balanceRemaining = parsedAmount;
      }

      // Handle raw string days calculation with your requested 2-day buffer addition
      if (estimatedDays !== undefined) {
        const parsedDays = Number(estimatedDays);
        if (isNaN(parsedDays) || parsedDays < 0) {
          return res.status(400).json({
            success: false,
            message: "Estimated days must be a valid positive number",
          });
        }

        // Add the extra two buffer days to the admin's count
        const totalDays = parsedDays + 2;

        // Save cleanly as a string format to fit: daysToGetReady: { type: String }
        updateFields.daysToGetReady = `${totalDays} days`;
      }
    }

    // --- COMPLETION METADATA LOGIC ---
    if (status === "completed") {
      updateFields.completedAt = new Date();
    }

    // 2. Perform the update write operation
    const updatedOrder = await ProductionOrder.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    ).populate(
      "user assignedCarpenters assignedDrivers assignedSuppliers assignedDesigners"
    );

    res.status(200).json({
      success: true,
      message:
        status === "completed"
          ? "Order finalized and completed successfully"
          : `Order status updated to ${status.replace("_", " ")}`,
      data: updatedOrder,
    });
  } catch (err) {
    console.error("Status Update Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/status/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  const { status } = req.body; // "approved" or "rejected"

  const modelMap = {
    carpenters: Carpenter,
    drivers: Driver,
    suppliers: Supplier,
    designers: DesignerUser,
  };

  const Model = modelMap[collection];
  if (!Model)
    return res
      .status(404)
      .json({ success: false, message: "Collection not found" });

  try {
    const updateFields = { status };
    if (collection === "carpenters")
      updateFields.isWhitelisted = status === "approved";

    const updatedDoc = await Model.findByIdAndUpdate(id, updateFields, {
      new: true,
    });
    if (!updatedDoc)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    // ─── EMAIL LOGIC ───
    const recipientEmail = updatedDoc.email;
    const recipientName =
      updatedDoc.fullName ||
      updatedDoc.contactName ||
      updatedDoc.brandIdentity?.contactName ||
      "Partner";

    // Determine the user-friendly role name
    const roleName = collection.slice(0, -1).toUpperCase(); // e.g., CARPENTER, DRIVER

    const emailContent =
      status === "approved"
        ? `
          <h1 style="color: #C1A170; font-family: sans-serif;">Congratulations!</h1>
          <p style="font-size: 16px; color: #333;">Hello <strong>${recipientName}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">
            Your application as a <strong>${roleName}</strong> on CloneKraft has been <strong>Approved</strong>. 
            You now have full access to our project hub and can begin receiving production orders.
          </p>
          <div style="margin-top: 30px; padding: 20px; background: #f9f9f9; border-left: 4px solid #C1A170;">
            <p style="margin: 0; font-weight: bold;">What's next?</p>
            <p style="margin: 5px 0 0 0; font-size: 12px;">Log in to your dashboard to complete your profile and view active projects.</p>
          </div>
        `
        : `
          <h1 style="color: #ff4d4d; font-family: sans-serif;">Application Update</h1>
          <p style="font-size: 16px; color: #333;">Hello <strong>${recipientName}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #555;">
            Thank you for your interest in joining the CloneKraft network. At this time, we are unable to proceed with your application for the <strong>${roleName}</strong> role.
          </p>
          <p style="font-size: 12px; color: #888; margin-top: 20px;">
            If you have questions regarding this decision, please contact our support team.
          </p>
        `;

    await sendEmailTransporter({
      to: recipientEmail,
      subject: `CloneKraft Partnership: ${status.toUpperCase()}`,
      html: emailContent,
    });

    console.log(`✉️ Notification sent to ${recipientEmail} for ${status}`);

    res.status(200).json({
      success: true,
      message: `${collection} status updated and email sent.`,
      data: updatedDoc,
    });
  } catch (err) {
    console.error("🔥 Status Update Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/sync-order-team", async (req, res) => {
  const { orderId, carpenterIds, driverIds, supplierIds, designerIds } =
    req.body;

  console.log("🚀 [Incoming Request] Sync Team:", { orderId, carpenterIds });

  try {
    const order = await ProductionOrder.findById(orderId);
    if (!order) {
      console.log("❌ Order not found:", orderId);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Financial Calculation
    const totalCarpenterPool = (order.totalCostNGN || 0) * 0.3;
    const perCarpenterPay =
      carpenterIds && carpenterIds.length > 0
        ? totalCarpenterPool / carpenterIds.length
        : 0;

    // 1. Update the Production Order Record
    const updatedOrder = await ProductionOrder.findByIdAndUpdate(
      orderId,
      {
        $set: {
          assignedCarpenters: carpenterIds,
          assignedDrivers: driverIds,
          assignedSuppliers: supplierIds,
          assignedDesigners: designerIds,
          status: "in_progress",
        },
      },
      { new: true }
    ).populate(
      "user assignedCarpenters assignedDrivers assignedSuppliers assignedDesigners"
    );

    // 2. Add Order ID to ALL currently assigned carpenters
    if (carpenterIds && carpenterIds.length > 0) {
      const addResult = await Carpenter.updateMany(
        { _id: { $in: carpenterIds } },
        {
          // Only adds the productionOrder Object ID to the array
          $addToSet: { productionOrders: order._id },
          // Resets/Sets the earnings for the current team split
          $set: { "earnings.pendingEarnings": perCarpenterPay },
        }
      );
      console.log("✅ Sync (Add/Set) Result:", addResult);
    }

    // 3. Remove Order ID from carpenters no longer on this team
    const removalResult = await Carpenter.updateMany(
      {
        _id: { $nin: carpenterIds },
        productionOrders: order._id,
      },
      {
        $pull: { productionOrders: order._id },
        // Deduct the pay since they are no longer on the job
        $inc: { "earnings.pendingEarnings": -perCarpenterPay },
      }
    );

    if (removalResult.modifiedCount > 0) {
      console.log("🧹 Cleanup (Removed Carpenters):", removalResult);
    }

    res.status(200).json({
      success: true,
      message: "Carpenter productionOrder IDs synchronized.",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("🔥 Sync Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
module.exports = router;
