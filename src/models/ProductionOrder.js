const mongoose = require("mongoose");

const ProductionItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    images: [{ type: String }],
    videoUri: { type: String, default: null },
    description: { type: String },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const ProductionOrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    items: [ProductionItemSchema],
    totalCostNGN: { type: Number, required: false, min: 0 },
    duration: { type: String },

    status: {
      type: String,
      enum: [
        "pending",
        "in_progress",
        "completed",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "partial", "failed"],
      default: "pending",
    },

    deliveryAddress: { type: String, required: false },
    explanation: { type: String },

    assignedCarpenters: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Carpenter" },
    ],
    assignedDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Driver" }],
    assignedSuppliers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
    ],
    assignedDesigners: [
      { type: mongoose.Schema.Types.ObjectId, ref: "InteriorDesigner" },
    ],

    isInstalment: { type: Boolean, default: false },
    amountPaid: { type: Number, default: 0 },
    balanceRemaining: { type: Number, default: 0 },
    daysToGetReady: { type: String },

    paidAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductionOrder", ProductionOrderSchema);
