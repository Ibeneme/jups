const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Can hold a User or Admin ID depending on the recipient
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        "ORDER_PLACED",
        "ORDER_PAID",
        "ORDER_UPDATE",
        "PRODUCTION_UPDATE",
        "COMMENT_ADDED",
        "UPDATE_COMMENT",
        "ADMIN_COMMENT_ALERT", // 📣 NEW: Notifies admin when a user comments
        "INTERACTION",
        "UPDATE_LIKE",
        "ADMIN_LIKE_ALERT", // 📣 NEW: Notifies admin when a user likes
        "SECURITY_ALERT",
        "ORDER_DISPATCHED",
        "ORDER_DELIVERED",
        "ORDER_COMPLETED",
        "ADMIN_PAYMENT_ALERT",
      ],
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionOrder",
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

// Performance optimization
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
