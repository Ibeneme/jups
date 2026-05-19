const express = require("express");
const router = express.Router();
const multer = require("multer");
const Carpenter = require("../../models/Carpenters/Carpenter");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const jwt = require("jsonwebtoken");
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 1. PUBLIC: SUBMIT APPLICATION
 * POST /api/v1/carpenters/apply
 */
router.post("/apply", upload.array("portfolio", 10), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data);
    const photoUrls = [];

    if (req.files) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "carpenters/portfolio"
        );
        photoUrls.push(url);
      }
    }

    const newApplication = new Carpenter({
      ...data,
      portfolioPhotos: photoUrls,
      status: "pending",
      isWhitelisted: false,
    });

    await newApplication.save();
    res.status(201).json({
      success: true,
      message: "Application submitted. Our team will review your portfolio.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. ADMIN: APPROVE & WHITELIST
 * PATCH /api/v1/carpenters/approve/:id
 */
router.patch("/approve/:id", async (req, res) => {
  try {
    const carpenter = await Carpenter.findByIdAndUpdate(
      req.params.id,
      {
        status: "approved",
        isWhitelisted: true,
      },
      { new: true }
    );

    if (!carpenter)
      return res.status(404).json({ message: "Carpenter not found" });

    // Logic to send "Welcome/Whitelisted" Email would go here
    res.json({
      success: true,
      message: "Carpenter approved and account whitelisted.",
      carpenter,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/verify-access", async (req, res) => {
    try {
      const { email } = req.body;
      const carpenter = await Carpenter.findOne({ email });
  
      if (!carpenter) {
        return res.status(404).json({ message: "No application found with this email." });
      }
  
      if (carpenter.status !== "approved" || !carpenter.isWhitelisted) {
        return res.status(403).json({
          message: "Access denied. Your account is still pending approval or not whitelisted.",
        });
      }
  
      // Generate JWT Token
      const token = jwt.sign(
        { id: carpenter._id, email: carpenter.email, role: "carpenter" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
  
      res.json({ 
        success: true, 
        token, 
        carpenter // Returns the whole user object
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
module.exports = router;
