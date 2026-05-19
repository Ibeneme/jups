const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI); // no options needed
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;