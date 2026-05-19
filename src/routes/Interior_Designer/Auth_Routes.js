const express = require("express");
const nodemailer = require("nodemailer");
const InteriorDesigner = require("../../models/Interior_Designer/InteriorDesigner"); // Unified Model
const OTP = require("../../models/OTP");
const jwt = require("jsonwebtoken");
const multer = require("multer"); // 🆕 Added
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze"); // 🆕 Added
const JWT_SECRET = process.env.JWT_SECRET || "clonekraft_super_secret_2026";
const authRouter = express.Router();

// --- TRANSPORTER CONFIGURATION ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// --- EMAIL TEMPLATES ---
const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const isReset = purpose === "reset";
  const title = isReset ? "Reset Password" : "Login Verification";
  const accentColor = "#C1A170"; // Bronze
  const leadText = isReset
    ? "A password reset was requested for your account."
    : "Use the code below to log into your CloneKraft Designer portal.";

  return {
    subject: `[CloneKraft] ${title} - ${otp}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; background-color: #000; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #111; padding: 40px; border-radius: 24px; border: 1px solid #C1A17033; color: #fff;">
          <h2 style="color: #fff; margin: 0;">Clone<span style="color: ${accentColor};">Kraft</span></h2>
          <hr style="border: 0; border-top: 1px solid #ffffff11; margin: 20px 0;" />
          <h3 style="color: ${accentColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">${title}</h3>
          <p style="color: #aaa; font-size: 16px;">${leadText}</p>
          <div style="background: #ffffff05; padding: 30px; text-align: center; border-radius: 16px; margin: 30px 0; border: 1px solid #ffffff05;">
            <h1 style="letter-spacing: 12px; font-size: 40px; margin: 0; color: ${accentColor}; font-weight: 900;">${otp}</h1>
          </div>
          <p style="color: #555; font-size: 11px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      </body>
      </html>
    `,
  };
};

const sendEmail = async ({ to, otp, purpose }) => {
  try {
    const template = getOtpEmailTemplate(otp, purpose);
    await transporter.sendMail({
      from: `"CloneKraft" <clonekraft@gmail.com>`,
      to,
      subject: template.subject,
      html: template.html,
    });
    console.log(`✨ [Email Sent] Target: ${to}`);
  } catch (error) {
    console.error("🔥 [Email Error]:", error.message);
    throw new Error("Could not deliver OTP email.");
  }
};

// --- ROUTES ---

// 1. Request OTP (Initial Login)
authRouter.post("/login/request-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const userEmail = email.toLowerCase().trim();

  try {
    // Check unified model for the designer
    const designer = await InteriorDesigner.findOne({ email: userEmail });

    if (!designer) {
      return res
        .status(404)
        .json({ message: "No account found for this email." });
    }

    if (designer.status !== "approved") {
      return res.status(403).json({
        message: `Your application is currently ${designer.status}. Login is only for approved designers.`,
      });
    }

    if (!designer.isActive) {
      return res
        .status(403)
        .json({ message: "Your account has been deactivated." });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP
    await OTP.findOneAndUpdate(
      { type: "DESIGNER_LOGIN", value: userEmail },
      { code: generatedOtp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendEmail({ to: userEmail, otp: generatedOtp, purpose: "login" });

    res.status(200).json({ success: true, message: "OTP sent successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Resend OTP
authRouter.post("/login/resend-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const userEmail = email.toLowerCase().trim();

  try {
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.findOneAndUpdate(
      { type: "DESIGNER_LOGIN", value: userEmail },
      { code: newOtp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendEmail({ to: userEmail, otp: newOtp, purpose: "login" });
    res
      .status(200)
      .json({ success: true, message: "A new OTP has been sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Verify OTP & Final Login
authRouter.post("/login/verify-otp", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ message: "Email and code are required." });

  const userEmail = email.toLowerCase().trim();

  try {
    const otpRecord = await OTP.findOne({
      type: "DESIGNER_LOGIN",
      value: userEmail,
      code,
    });

    if (!otpRecord) {
      return res
        .status(401)
        .json({ message: "Invalid or expired login code." });
    }

    // Fetch unified profile
    const designer = await InteriorDesigner.findOne({ email: userEmail });

    if (!designer || designer.status !== "approved") {
      return res.status(404).json({ message: "Access denied." });
    }

    // Update login timestamp
    designer.lastLogin = new Date();
    await designer.save();

    // Generate JWT
    const token = jwt.sign(
      {
        id: designer._id,
        email: designer.email,
        role: "DESIGNER",
        brandName: designer.brandIdentity.brandName,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Cleanup OTP record
    await OTP.deleteOne({ _id: otpRecord._id });

    // Prepare response data
    const designerData = designer.toObject();
    delete designerData.__v;

    res.json({
      success: true,
      message: "Login successful",
      token,
      designer: designerData,
    });
  } catch (err) {
    console.error("🔥 [Verify Error]:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const upload = multer({ storage: multer.memoryStorage() }); // 🆕 Added

// --- EXISTING AUTH ROUTES (Request OTP, Verify OTP, etc.) ---
// ... (Your existing code here)

// --- 🆕 4. UPDATE DESIGNER PROFILE ---
/**
 * PATCH: Update designer details and profile media
 * Handles 'logo' and 'profilePicture' fields
 */


authRouter.patch(
  "/profile/update/:id",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "profilePicture", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // 1. Find existing designer
      const designer = await InteriorDesigner.findById(id);
      if (!designer) {
        return res.status(404).json({ message: "Designer not found." });
      }

      // 2. Handle Image Uploads to Backblaze
      let logoUrl = designer.brandIdentity.logoUrl;
      let profilePictureUrl = designer.brandIdentity.profilePicture;

      if (req.files) {
        if (req.files["logo"]) {
          logoUrl = await uploadToBackblaze(
            req.files["logo"][0].buffer,
            req.files["logo"][0].originalname,
            "designer-logos"
          );
        }
        if (req.files["profilePicture"]) {
          profilePictureUrl = await uploadToBackblaze(
            req.files["profilePicture"][0].buffer,
            req.files["profilePicture"][0].originalname,
            "designer-profiles"
          );
        }
      }

      // 3. Construct Update Object using dot notation for nested fields
      const updatePayload = {
        "brandIdentity.contactName":
          updates.contactName || designer.brandIdentity.contactName,
        "brandIdentity.brandName":
          updates.brandName || designer.brandIdentity.brandName,
        "brandIdentity.logoUrl": logoUrl,
        "brandIdentity.profilePicture": profilePictureUrl,
        "contact.phone": updates.phone || designer.contact.phone,
        "logistics.operatingCity":
          updates.operatingCity || designer.logistics.operatingCity,
        "logistics.address": updates.address || designer.logistics.address,
        "onlinePresence.instagram":
          updates.instagram || designer.onlinePresence.instagram,
        "onlinePresence.linkedin":
          updates.linkedin || designer.onlinePresence.linkedin,
      };

      // 4. Save Updates
      const updatedDesigner = await InteriorDesigner.findByIdAndUpdate(
        id,
        { $set: updatePayload },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        designer: updatedDesigner,
      });
    } catch (error) {
      console.error("🔥 [Profile Update Error]:", error.message);
      res.status(500).json({ error: "Failed to update profile." });
    }
  }
);

/**
 * GET: Fetch a single designer's full profile details
 */
authRouter.get("/profile/:id", async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔍 [Fetch Profile]: Requesting profile for ID: ${id}`);

  try {
    const designer = await InteriorDesigner.findById(id).select("-__v");

    if (!designer) {
      console.warn(`⚠️ [Fetch Profile]: No designer found in unified collection for ID: ${id}`);
      return res.status(404).json({ 
        success: false, 
        message: "Designer profile not found." 
      });
    }

    console.log(`✅ [Fetch Profile Success]: Found ${designer.brandIdentity?.brandName} (${designer.email})`);
    
    // Optional: Log the full object to see nested data
    // console.log("📦 Designer Data:", JSON.stringify(designer, null, 2));

    res.status(200).json({
      success: true,
      data: designer
    });
  } catch (err) {
    console.error("🔥 [Fetch Profile Error]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = authRouter;
