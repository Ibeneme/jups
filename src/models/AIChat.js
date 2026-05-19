const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "ai"], 
      required: true,
    },

    content: { 
      type: String,
      trim: true,
    },

    // CHANGED: Array of strings to store multiple B2 links
    imageUrls: [{
      type: String, 
    }],

    isCosting: {
      type: Boolean,
      default: false
    },

    costingData: { 
      type: Object, 
    },

    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const aiChatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    messages: [chatMessageSchema],
    lastCostingRequest: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIChat", aiChatSchema);