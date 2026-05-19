const mongoose = require("mongoose");

const ProgressUpdateSchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      required: true,
      enum: [
        "pending",
        "in_progress",
        "design",
        "cutting",
        "assembly",
        "finishing",
        "ready_for_delivery",
        "completed",
        "cancelled",
      ],
    },
    comment: { type: String }, // Optional notes about this stage
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Who updated
    date: { type: Date, default: Date.now }, // When updated
  },
  { _id: false }
);

const ProductionOrderProgressSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionOrder",
      required: true,
    },
    updates: { type: [ProgressUpdateSchema], default: [] }, // Array of progress updates
  },
  { timestamps: true } // createdAt, updatedAt
);

module.exports = mongoose.model(
  "ProductionOrderProgress",
  ProductionOrderProgressSchema
);
