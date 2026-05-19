const mongoose = require("mongoose");

const InteriorDecoratorProjectSchema = new mongoose.Schema({
  designerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InteriorDesigner", // 🆕 Updated to match the unified model name
    required: true,
  },

  projectId: {
    type: String,
    unique: true,
    default: () => `PRJ-${Math.floor(1000 + Math.random() * 9000)}`,
  },

  projectName: {
    type: String,
    required: true,
  },

  projectType: {
    type: String,
    required: true,
  },

  startDate: {
    type: Date,
    default: Date.now,
  },

  completionDate: {
    type: Date,
  },

  deliveryStatus: {
    type: String,
    enum: ["pending", "in-production", "completed", "delivered"],
    default: "pending",
  },

  deliveryCity: {
    type: String,
    required: true,
  },

  // PROJECT DETAIL (CLICK VIEW)
  referenceImages: [
    {
      type: String,
    },
  ],

  finalSpecifications: {
    type: String,
  },

  productionStartDate: {
    type: Date,
  },

  deliveryConfirmation: [
    {
      type: String,
    },
  ],

  assetVault: {
    productPhotos: [{ type: String }],
    productionVideos: [{ type: String }],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "InteriorDecoratorProject",
  InteriorDecoratorProjectSchema
);
