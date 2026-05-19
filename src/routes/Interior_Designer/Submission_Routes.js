const express = require("express");
const router = express.Router();
const multer = require("multer");
const InteriorDesigner = require("../../models/Interior_Designer/InteriorDesigner"); // Unified Model
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Using memoryStorage to pipe directly to Backblaze
const upload = multer({ storage: multer.memoryStorage() });

router.post("/submit-application", upload.single("logo"), async (req, res) => {
  try {
    const b = req.body;
    console.log("📝 Processing new application for:", b.email);

    // Upload logo to Backblaze if provided
    let logoUrl = null;
    if (req.file) {
      logoUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        "designer-logos"
      );
    }

    // Map flat form fields to the unified nested schema
    const structuredData = {
      email: b.email.toLowerCase().trim(),
      brandIdentity: {
        contactName: b.contactName,
        brandName: b.brandName,
        isRegistered: b.registered === "Yes",
        registrationNumber: b.registrationNumber,
        logoUrl: logoUrl,
      },
      contact: {
        phone: b.phone,
        assistant: {
          name: b.assistantName,
          phone: b.assistantPhone,
          email: b.assistantEmail ? b.assistantEmail.toLowerCase() : undefined,
        },
      },
      logistics: {
        hasPhysicalOffice: b.hasPhysicalOffice === "Yes",
        address: b.officeAddress,
        city: b.officeCity,
        state: b.officeState,
        operatingCity: b.operatingCity,
      },
      onlinePresence: {
        portfolioUrl: b.portfolio,
        instagram: b.instagram,
        linkedin: b.linkedin,
      },
      professionalMetrics: {
        experienceYears: b.experience,
        budgetRange: b.budgetRange,
        projectVolume: b.projectVolume,
      },
      status: "pending", // Default status for new applicants
    };

    const designer = await InteriorDesigner.create(structuredData);

    res.status(201).json({
      success: true,
      message:
        "Application received. Our team will review your profile shortly.",
      data: designer,
    });
  } catch (err) {
    console.error("❌ Submission Error:", err.message);
    // Handle duplicate email error (MongoDB code 11000)
    if (err.code === 11000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "An application with this email already exists.",
        });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 2. ADMIN: EVALUATE APPLICATION
 * Simply updates the status of the unified document.
 */
router.patch("/admin/evaluate/:id", async (req, res) => {
  const { decision } = req.body; // "approved" or "rejected"
  const designerId = req.params.id;

  try {
    const designer = await InteriorDesigner.findById(designerId);

    if (!designer) {
      return res
        .status(404)
        .json({ success: false, message: "Designer record not found" });
    }

    // Update status
    designer.status = decision;

    // If approved, ensure account is active
    if (decision === "approved") {
      designer.isActive = true;
    }

    await designer.save();
    console.log(`✅ Designer ${designer.email} set to: ${decision}`);

    res.json({
      success: true,
      message: `Application has been ${decision}`,
      data: { status: designer.status },
    });
  } catch (err) {
    console.error("❌ Evaluation Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
