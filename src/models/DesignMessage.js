const mongoose = require("mongoose");

const DesignMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  role: { type: String, enum: ["user", "admin", "system"], required: true },
  content: { type: String, default: "" },
  imageUrls: { type: [String], default: [] },
  status: {
    type: String,
    enum: ["pending", "reviewed", "completed"],
    default: "pending",
  },
  isCosting: { type: Boolean, default: false },

  // --- UPDATED COSTING DATA STRUCTURE ---
  costingData: {
    totalCostNGN: Number,
    items: [
      {
        name: String,
        quantity: Number,
        unitPriceNGN: Number, // Added field
        subtotalNGN: Number,
      },
    ],
  },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DesignMessage", DesignMessageSchema);
