const mongoose = require("mongoose");

const OnsiteMeasurementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  customerName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, default: 20000 },

  // 🆕 NEW: Scheduling Preferences
  preferredSchedule: {
    date: { type: Date, required: true },
    time: { type: String, required: true }, // e.g., "10:00 AM"
  },
  alternativeSchedule: {
    date: { type: Date, required: true },
    time: { type: String, required: true }, // e.g., "02:00 PM"
  },

  status: {
    type: String,
    enum: ["pending_payment", "scheduled", "completed", "cancelled"],
    default: "pending_payment",
  },

  paymentReference: { type: String },
  paidAt: { type: Date },

  // Admin fields for final confirmation
  scheduledDate: { type: Date }, // The actual date the admin confirms
  scheduledTime: { type: String }, // The actual time the admin confirms
  artisanAssigned: { type: String },
  adminNotes: { type: String },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("OnsiteMeasurement", OnsiteMeasurementSchema);
