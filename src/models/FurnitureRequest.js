const mongoose = require("mongoose");

const FurnitureRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // Optional: if you want to group multiple AI interactions into one "order"
  // orderId: { type: String, sparse: true },    ← you can add later if needed

  userText: {
    type: String,
    trim: true,
  },

  imageUrl: {
    type: String,
  },

  detectedItems: [
    {
      name: { type: String, required: true },
      quality: { type: String },
      description: { type: String },
      estimatedPriceNGN: { type: Number, required: true },
    },
  ],

  totalEstimatedCostNGN: {
    type: Number,
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  // Optional: status field if you want to track progress
  status: {
    type: String,
    enum: ["pending", "quoted", "confirmed", "in_production", "completed", "cancelled"],
    default: "pending",
  },
});

module.exports = mongoose.model("FurnitureRequest", FurnitureRequestSchema);