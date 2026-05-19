const express = require("express");
const router = express.Router();
const multer = require("multer");
const ProductionUpdate = require("../models/ProductionUpdate");
const ProductionOrder = require("../models/ProductionOrder");
const Notification = require("../models/Notification");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const verifyToken = require("../utils/verifyToken");
const notifyUser = require("../utils/notifyUser");
const mongoose = require("mongoose");

const upload = multer({ storage: multer.memoryStorage() });

// 1. ADMIN: Upload Progress (Multiple Images)
router.post(
  "/upload-progress/:orderId",
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { title, text, adminName } = req.body;
      let imageUrls = [];

      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToBackblaze(file.buffer, file.originalname, "progress")
        );
        imageUrls = await Promise.all(uploadPromises);
      }

      const newUpdate = await ProductionUpdate.create({
        orderId: req.params.orderId,
        title,
        text,
        adminName: adminName || "Senior Craftsman",
        images: imageUrls,
      });

      const order = await ProductionOrder.findById(req.params.orderId);
      if (order) {
        await Notification.create({
          user: order.user,
          title: "New Workshop Update!",
          description: `Progress update: "${title}". View latest photos.`,
          orderId: order._id,
          type: "PRODUCTION_UPDATE",
          metadata: { updateId: newUpdate._id, images: imageUrls },
        });

        await notifyUser({
          userId: order.user,
          title: "New Workshop Update!",
          description: `Progress update: "${title}". View latest photos.`,
          orderId: order._id,
          type: "PRODUCTION_UPDATE",
        });
      }

      res.status(201).json({ success: true, data: newUpdate });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 2. GET: Fetch updates for an order
router.get("/:orderId", async (req, res) => {
  try {
    const updates = await ProductionUpdate.find({
      orderId: req.params.orderId,
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: updates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:updateId/like", async (req, res) => {
  try {
    const { updateId } = req.params;
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ error: "userName is required in body." });
    }

    const update = await ProductionUpdate.findById(updateId);
    if (!update) return res.status(404).json({ error: "Update not found" });

    // Check if the name is already in the likes array
    const existingLikeIndex = update.likes.indexOf(userName);

    let isLikedNow = false;
    if (existingLikeIndex > -1) {
      // Remove name (Unlike)
      update.likes.splice(existingLikeIndex, 1);
    } else {
      // Add name (Like)
      update.likes.push(userName);
      isLikedNow = true;
    }

    await update.save();
    res.json({
      success: true,
      likesCount: update.likes.length,
      isLiked: isLikedNow,
      likes: update.likes,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. SIMPLIFIED COMMENT: Add by UserName
// Expects: { "userName": "Name", "text": "Comment Content" }
router.post("/:updateId/comment", async (req, res) => {
  try {
    const { updateId } = req.params;
    const { text, userName } = req.body;

    if (!userName || !text) {
      return res.status(400).json({ error: "userName and text are required." });
    }

    const update = await ProductionUpdate.findById(updateId);
    if (!update) return res.status(404).json({ error: "Update not found" });

    // Push new comment object
    update.comments.push({
      userName: userName,
      text: text,
    });

    await update.save();

    res.json({ success: true, data: update.comments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
