const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, default: "Nigeria", trim: true },
  landmark: { type: String, trim: true }, // Added Landmark
});

const notificationPreferencesSchema = new mongoose.Schema(
  {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
  },
  { _id: false }
);

const preferencesSchema = new mongoose.Schema(
  {
    notifications: notificationPreferencesSchema,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    generatedImages: [
      {
        prompt: { type: String, required: true },
        imageUrl: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    verified: { type: Boolean, default: false },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: { type: String, unique: true, sparse: true, trim: true }, // Required for delivery
    profilePicture: { type: String, trim: true },

    // Delivery Specifics
    address: addressSchema,
    contactMethod: {
      type: String,
      enum: ["WhatsApp", "Call", "SMS"],
      default: "WhatsApp",
    },
    deliveryNotes: { type: String, trim: true },

    expoPushToken: { type: String },
    preferences: {
      type: preferencesSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
