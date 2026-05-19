const mongoose = require("mongoose");

const InteriorDesignerSchema = new mongoose.Schema(
  {
    // --- 🔑 AUTH & ACCOUNT FIELDS ---
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    role: { type: String, default: "INTERIOR_DESIGNER" },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },

    // --- 🎨 BRAND IDENTITY ---
    brandIdentity: {
      contactName: { type: String, required: true },
      brandName: { type: String, required: true },
      isRegistered: { type: Boolean, default: false },
      registrationNumber: { type: String },
      logoUrl: { type: String },
    },

    // --- 📞 COMMUNICATION & SUPPORT ---
    contact: {
      phone: { type: String, required: true },
      assistant: {
        name: { type: String },
        phone: { type: String },
        email: { type: String, lowercase: true },
      },
    },

    // --- 📍 LOGISTICS ---
    logistics: {
      hasPhysicalOffice: { type: Boolean, default: false },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String, default: "Nigeria" },
      operatingCity: { type: String, required: true },
    },

    // --- 🌐 ONLINE PRESENCE ---
    onlinePresence: {
      portfolioUrl: { type: String },
      instagram: { type: String, required: true },
      linkedin: { type: String },
    },

    // --- 📊 PROFESSIONAL METRICS ---
    professionalMetrics: {
      experienceYears: { type: String, enum: ["0–2", "3–5", "6–10", "10+"] },
      budgetRange: { type: String },
      projectVolume: { type: String, enum: ["1–2", "3–5", "6–10", "10+"] },
    },

    // --- ⚙️ SYSTEM STATUS ---
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true, // Replaces appliedAt with createdAt and adds updatedAt
  }
);

module.exports = mongoose.model("InteriorDesigner", InteriorDesignerSchema);
