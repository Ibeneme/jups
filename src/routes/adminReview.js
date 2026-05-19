const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs").promises;
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const verifyToken = require("../utils/verifyToken");
const DesignMessage = require("../models/DesignMessage");

const upload = multer({ dest: "uploads/" });

router.get("/design-messages", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;

    let userHistory = await DesignMessage.find({ userId }).sort({
      timestamp: 1,
    });

    // CHANGE: Check if userHistory.length === 0 to trigger dummy data for new users
    if (userHistory.length > 0) {
      // Message 1: The Initial Greeting
      const greetingMsg = await DesignMessage.create({
        userId: userId,
        role: "admin",
        content:
          "Hello! 👋 Welcome to our design studio. Please upload your project photos so we can begin the review process.",
        status: "pending",
        timestamp: new Date(Date.now() - 10000),
      });

      // Message 2: The Costing Sample
      const costingMsg = await DesignMessage.create({
        userId: userId,
        role: "admin",
        content:
          "✅ REVIEW COMPLETE: Based on the reference files provided, here is your production quote for the custom mold.",
        isCosting: true,
        status: "reviewed",
        // ADDED IMAGE URLS HERE FOR TESTING
        imageUrls: [
          "https://f005.backblazeb2.com/file/production-development/chat-images/1769068185782_Screenshot%25202026-01-18%2520at%252006.44.46-B883FBF5-3806-44BD-8E3A-993F892E71A0.png",
          "https://f005.backblazeb2.com/file/production-development/chat-images/1769068185782_Screenshot%25202026-01-18%2520at%252006.44.46-B883FBF5-3806-44BD-8E3A-993F892E71A0.png",
        ],
        // --- In your POST or GET Route ---
        costingData: {
          totalCostNGN: 68500,
          items: [
            {
              name: "3D Rendering & Optimization",
              quantity: 1,
              unitPriceNGN: 15000, // Added
              subtotalNGN: 15000,
            },
            {
              name: "High-Density Resin Material",
              quantity: 2,
              unitPriceNGN: 19000, // Added
              subtotalNGN: 38000,
            },
            {
              name: "Post-Processing & Finishing",
              quantity: 1,
              unitPriceNGN: 15500, // Added
              subtotalNGN: 15500,
            },
          ],
        },
        timestamp: new Date(),
      });

      userHistory = [greetingMsg, costingMsg];
    }

    res.status(200).json(userHistory);
  } catch (error) {
    console.error("Fetch History Error:", error);
    res.status(500).json({ error: "Failed to fetch design history" });
  }
});

router.post(
  "/submit-design",
  verifyToken,
  upload.array("images", 6),
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { content, isCosting } = req.body; // Capture the costing flag
      const files = req.files;
      let uploadedUrls = [];

      if (files && files.length > 0) {
        const uploadPromises = files.map(async (file) => {
          const fileBuffer = await fs.readFile(file.path);
          const url = await uploadToBackblaze(
            fileBuffer,
            file.originalname,
            `users/${userId}/designs`
          );
          await fs.unlink(file.path);
          return url;
        });
        uploadedUrls = await Promise.all(uploadPromises);
      }

      // 1. Save User Message
      await DesignMessage.create({
        userId,
        role: "user",
        content: content || "",
        imageUrls: uploadedUrls,
      });

      // 2. Determine Admin Response based on isCosting flag
      let adminPayload = {
        userId,
        role: "admin",
        timestamp: new Date(),
      };

      if (isCosting === "true" || isCosting === true) {
        adminPayload.content =
          "✅ We have calculated your production order based on the design provided:";
        adminPayload.isCosting = true;
        adminPayload.status = "reviewed";
        adminPayload.costingData = {
          totalCostNGN: 55000,
          items: [
            { name: "Custom 3D Print / Mold", quantity: 1, subtotalNGN: 35000 },
            { name: "Finishing & Logistics", quantity: 1, subtotalNGN: 20000 },
          ],
        };
      } else {
        adminPayload.content =
          "We've received your design! Our team is reviewing it now. You'll get a quote soon.";
        adminPayload.isCosting = false;
        adminPayload.status = "pending";
      }

      const adminResponse = await DesignMessage.create(adminPayload);
      res.status(200).json(adminResponse);
    } catch (error) {
      console.error("Submission Error:", error);
      res.status(500).json({ error: "Failed to process submission" });
    }
  }
);

module.exports = router;
