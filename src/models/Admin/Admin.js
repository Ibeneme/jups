const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  otp: { type: String },
  otpExpires: { type: Date },
  isVerified: { type: Boolean, default: false },
});

module.exports = mongoose.model("Admin", AdminSchema);
