const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
        "ORDER_PLACED", // Initial order creation
        "ORDER_PAID", // Payment/Installment confirmation
        "ORDER_UPDATE", // General status change
        "PRODUCTION_UPDATE", // Workshop photos/progress
        "COMMENT_ADDED", // User/Admin comments
        "INTERACTION", // Likes/Reactions
        "SECURITY_ALERT", // 🛡️ NEW: Login alerts and security changes
        "ORDER_DISPATCHED",
        "ORDER_DELIVERED",
        "ORDER_COMPLETED",
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
