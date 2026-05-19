const mongoose = require("mongoose");

// --- SUPPLIER SCHEMA ---
const SupplierSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  contactName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  businessLocation: { type: String, required: true },

  // Material Categories
  suppliedMaterials: [
    {
      type: String,
      enum: [
        "Wood/Boards",
        "Upholstery",
        "Foam/Fabrics",
        "Hardware/Fittings",
        "Finishing",
        "Other",
      ],
    },
  ],

  capacityNotes: String,
  deliveryTimelines: String,

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  onboardedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

// --- DRIVER SCHEMA ---
const DriverSchema = new mongoose.Schema({
  driverId: {
    type: String,
    unique: true,
    default: () => `DRV-${Math.floor(1000 + Math.random() * 9000)}`,
  },
  fullName: { type: String, required: true },
  primaryPhone: { type: String, required: true },
  whatsappNumber: String,
  email: String,

  vehicleDetails: {
    vehicleType: { type: String, enum: ["Van", "Pickup", "Truck", "Other"] },
    plateNumber: String,
    hasMultipleVehicles: { type: Boolean, default: false },
    vehiclePhoto: String, // Backblaze URL
  },

  licenseAndExperience: {
    licensePhoto: String, // Backblaze URL
    experienceYears: { type: String},
    furnitureExperience: { type: Boolean, default: false },
  },

  coverage: {
    primaryArea: String,
    citiesCovered: [String], // Abuja, Kaduna, etc.
    availability: { type: String, enum: ["Weekdays", "Weekends", "Anytime"] },
  },

  // Internal Admin Tracking
  status: {
    type: String,
    enum: ["Active", "Inactive", "Pending"],
    default: "Pending",
  },
  deliveryHistory: [
    {
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
      date: Date,
      notes: String,
    },
  ],
  paymentHistory: [
    {
      amount: Number,
      date: Date,
      reference: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

const Supplier = mongoose.model("Supplier", SupplierSchema);
const Driver = mongoose.model("Driver", DriverSchema);

module.exports = { Supplier, Driver };
