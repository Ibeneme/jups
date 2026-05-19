const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const verifyToken = require("../utils/verifyToken");

/**
 * 📥 GET: Fetch all notifications for the logged-in user
 * Returns newest first, populated with Order details if applicable.
 */
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({ user: userId })
      .populate({
        path: "orderId",
        select: "status items totalCostNGN", // Only pull necessary fields
      })
      .sort({ createdAt: -1 }); // Newest first

    // Count unread notifications for the badge icon
    const unreadCount = await Notification.countDocuments({
      user: userId,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load notifications" });
  }
});

/**
 * ✅ PATCH: Mark a specific notification as read
 */
router.patch("/:id/read", verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, error: "Notification not found" });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: "Update failed" });
  }
});

/**
 * 🧹 PATCH: Mark all notifications as read
 */
router.patch("/read-all", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { user: userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update all" });
  }
});

/**
 * 🗑️ DELETE: Clear all notifications for a user
 */
router.delete("/clear-all", verifyToken, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res
      .status(200)
      .json({ success: true, message: "Notification history cleared" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to clear history" });
  }
});

module.exports = router;
