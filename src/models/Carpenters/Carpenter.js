const mongoose = require("mongoose");

const CarpenterSchema = new mongoose.Schema({
  // --- IDENTIFICATION & AUTH ---
  carpenterId: {
    type: String,
    unique: true,
    default: () => `CRP-${Math.floor(1000 + Math.random() * 9000)}`,
  },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  whatsappNumber: { type: String, required: true },

  otp: {
    code: String,
    expiresAt: Date,
  },

  // --- ACCOUNT STATUS & VISIBILITY ---
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "inactive"],
    default: "pending",
  },
  isWhitelisted: { type: Boolean, default: false },
  availability: {
    type: String,
    enum: ["ON", "OFF"],
    default: "OFF",
  },
  lastLogin: Date,

  // --- PROFESSIONAL PROFILE ---
  location: {
    area: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: "Nigeria" },
  },
  expertise: [
    {
      type: String,
      enum: [
        "Upholstery",
        "Cabinet Making",
        "Woodworking (Solid wood)",
        "MDF / Board work",
        "Finishing / Polishing",
      ],
    },
  ],
  experienceYears: {
    type: String,
    enum: ["0-2", "3-5", "6-10", "10+"],
  },
  portfolioPhotos: [{ type: String }],

  // --- JOB MANAGEMENT ---
  // 🆕 Direct References to Production Orders for easy .populate()
  productionOrders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionOrder",
    },
  ],

  // --- FINANCIALS ---
  earnings: {
    totalEarned: { type: Number, default: 0 },
    pendingEarnings: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    history: [],
  },

  // --- RATING SYSTEM ---
  rating: {
    currentRating: { type: Number, default: 5.0, min: 0, max: 5 },
    skillScore: { type: Number, default: 5 },
    reliabilityScore: { type: Number, default: 5 },
    timelinessScore: { type: Number, default: 5 },
    metrics: {
      onTimeCompletionRate: { type: Number, default: 100 },
      jobPriority: { type: Number, default: 1 },
    },
  },

  // --- REWARD SYSTEM ---
  rewards: {
    totalCompletedJobs: { type: Number, default: 0 },
    nextMilestone: { type: Number, default: 10 },
    milestoneStatus: { type: String, default: "In Progress" },
    earnedRewards: [
      {
        title: String,
        dateAwarded: Date,
        milestoneReached: Number,
      },
    ],
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

CarpenterSchema.pre("save", async function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model("Carpenter", CarpenterSchema);
