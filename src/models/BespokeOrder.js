const mongoose = require("mongoose");

// Sub-schema for Media objects (images/videos) within an item
const MediaPathSchema = new mongoose.Schema({
  type: { type: String, enum: ["image", "video"], required: true },
  uri: { type: String, required: true },
});

// Sub-schema for Custom Dimensions matching your structure
const CustomDimensionSchema = new mongoose.Schema({
  label: { type: String, required: true },
  value: { type: String, required: true },
  unit: { type: String, enum: ["ft", "inches"], required: true },
});

// Sub-schema for individual Bespoke / Production Items
const BespokeItemSchema = new mongoose.Schema({
  id: { type: String, required: true }, // e.g., "Sofa set-0"
  category: { type: String, required: true }, // e.g., "Sofa set"
  itemIndex: { type: Number, required: true },
  useStandardDimensions: { type: Boolean, default: false },
  customDimensions: [CustomDimensionSchema],
  description: { type: String, default: "" }, // Keeps it flexible if empty string sent
  mediaPaths: [MediaPathSchema],
});

// Main Order Schema
const BespokeOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [BespokeItemSchema],
  quantities: {
    type: Map,
    of: Number,
    default: {}, // Maps key-value pairs smoothly e.g., {"Bench": 1, "Sofa set": 1}
  },
  deliveryMode: {
    type: String,
    enum: ["BUNDLE", "INDIVIDUAL", null],
    default: "BUNDLE",
  },
  bundleTimeline: { type: String },
  timeline: { type: String }, // Mapped directly from payload "extended", "standard", etc.
  timestamp: { type: Date, default: Date.now }, // Tracks client side event timestamp
  status: {
    type: String,
    enum: ["pending", "priced", "approved", "rejected"],
    default: "pending",
  },
  adminPanel: {
    feedback: { type: String, default: "" },
    estimatedCost: { type: Number, default: 0 },
    currency: { type: String, default: "NGN" },
    internalNotes: { type: String, default: "" },
    reviewedAt: { type: Date },
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BespokeOrder", BespokeOrderSchema);
