const express = require("express");
const router = express.Router();
const multer = require("multer");
const ProductionUpdate = require("../models/ProductionUpdate");
const ProductionOrder = require("../models/ProductionOrder");
const Notification = require("../models/Notification");
const Admin = require("../models/Admin/Admin"); // 👈 Updated to target your Admin model file
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const verifyToken = require("../utils/verifyToken");
const notifyUser = require("../utils/notifyUser");
const mongoose = require("mongoose");

const upload = multer({ storage: multer.memoryStorage() });

// Updated helper targeting the Admin collection
const findAdminUser = async (adminName) => {
  try {
    if (adminName) {
      // Searches the Admin schema using the 'fullname' property
      const specificAdmin = await Admin.findOne({ fullname: adminName });
      if (specificAdmin) return specificAdmin._id;
    }

    // Fallback: Grabs the first admin in the collection if names don't match
    const defaultAdmin = await Admin.findOne();
    return defaultAdmin ? defaultAdmin._id : null;
  } catch (error) {
    console.error("Error finding admin user:", error);
    return null;
  }
};

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
// 2. GET: Fetch updates for an order
router.get("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1. Instantly mark all comments on this order's updates as read by the user
    // Using Mongoose positional filter array syntax ($[]) to hit every element in the comments array
    await ProductionUpdate.updateMany(
      { orderId: orderId, "comments.isReadByUser": false },
      { $set: { "comments.$[].isReadByUser": true } }
    );

    // 2. Fetch the newly updated list to pass back down to the app
    const updates = await ProductionUpdate.find({ orderId }).sort({
      createdAt: -1,
    });

    // 3. Since we just read them all, the current unread count for this order drops to 0
    res.json({
      success: true,
      data: updates,
      unreadCommentsCount: 0,
    });
  } catch (error) {
    console.error(
      "[GET /production-update/:orderId] Reset-on-read execution failed:",
      error
    );
    res.status(500).json({ error: error.message });
  }
});

// 3. POST: Like / Unlike an update (Notifies Customer and Admin)
router.post("/:updateId/like", async (req, res) => {
  try {
    const { updateId } = req.params;
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ error: "userName is required in body." });
    }

    const update = await ProductionUpdate.findById(updateId);
    if (!update) return res.status(404).json({ error: "Update not found" });

    const existingLikeIndex = update.likes.indexOf(userName);
    let isLikedNow = false;

    if (existingLikeIndex > -1) {
      update.likes.splice(existingLikeIndex, 1);
    } else {
      update.likes.push(userName);
      isLikedNow = true;

      const order = await ProductionOrder.findById(update.orderId);
      const adminUserId = await findAdminUser(update.adminName);

      // A. Notify Customer
      if (order) {
        const userTitle = "Someone liked your update!";
        const userDesc = `${userName} liked the update: "${
          update.title || "Workshop Progress"
        }"`;

        await Notification.create({
          user: order.user,
          title: userTitle,
          description: userDesc,
          orderId: order._id,
          type: "UPDATE_LIKE",
          metadata: { updateId: update._id, likedBy: userName },
        });

        await notifyUser({
          userId: order.user,
          title: userTitle,
          description: userDesc,
          orderId: order._id,
          type: "UPDATE_LIKE",
        });
      }

      // B. Notify Admin
      if (adminUserId && adminUserId.toString() !== req.body.adminId) {
        await Notification.create({
          user: adminUserId, // Passing Admin Object ID directly
          title: "Admin Alert: Post Liked",
          description: `${userName} liked your progress update details.`,
          orderId: order ? order._id : null,
          type: "ADMIN_LIKE_ALERT",
          metadata: { updateId: update._id, likedBy: userName },
        });

        await notifyUser({
          userId: adminUserId,
          title: "Admin Alert: Post Liked",
          description: `${userName} liked your progress update details.`,
          orderId: order ? order._id : null,
          type: "ADMIN_LIKE_ALERT",
        });
      }
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

// 4. POST: Add a Comment (Notifies Customer and Admin)
router.post("/:updateId/comment", async (req, res) => {
  try {
    const { updateId } = req.params;
    const { text, userName } = req.body;

    if (!userName || !text) {
      return res.status(400).json({ error: "userName and text are required." });
    }

    const update = await ProductionUpdate.findById(updateId);
    if (!update) return res.status(404).json({ error: "Update not found" });

    update.comments.push({ userName, text });
    await update.save();

    const order = await ProductionOrder.findById(update.orderId);
    const adminUserId = await findAdminUser(update.adminName);

    const shortText = `${text.substring(0, 40)}${
      text.length > 40 ? "..." : ""
    }`;

    // A. Notify Customer
    if (order) {
      const userTitle = "New Comment on your update!";
      const userDesc = `${userName} commented: "${shortText}"`;

      await Notification.create({
        user: order.user,
        title: userTitle,
        description: userDesc,
        orderId: order._id,
        type: "UPDATE_COMMENT",
        metadata: { updateId: update._id, commentedBy: userName, text },
      });

      await notifyUser({
        userId: order.user,
        title: userTitle,
        description: userDesc,
        orderId: order._id,
        type: "UPDATE_COMMENT",
      });
    }

    // B. Notify Admin
    if (adminUserId && adminUserId.toString() !== req.body.adminId) {
      await Notification.create({
        user: adminUserId,
        title: "Admin Alert: New Comment",
        description: `${userName} left a comment: "${shortText}"`,
        orderId: order ? order._id : null,
        type: "ADMIN_COMMENT_ALERT",
        metadata: { updateId: update._id, commentedBy: userName, text },
      });

      await notifyUser({
        userId: adminUserId,
        title: "Admin Alert: New Comment",
        description: `${userName} left a comment: "${shortText}"`,
        orderId: order ? order._id : null,
        type: "ADMIN_COMMENT_ALERT",
      });
    }

    res.json({ success: true, data: update.comments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. PATCH: Mark all production updates for an order as read by the user
router.patch("/:orderId/read", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Invalid orderId format." });
    }

    // Update all updates linked to this order where isReadByUser is currently false
    const result = await ProductionUpdate.updateMany(
      { orderId: orderId, isReadByUser: false },
      { $set: { isReadByUser: true } }
    );

    res.json({
      success: true,
      message: "Production updates successfully marked as read.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("[PATCH /production-update/:orderId/read] Failed:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
