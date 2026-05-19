const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  interests: {
    earlyAccess: { type: Boolean, default: true },
    exclusivePerks: { type: Boolean, default: true },
    updates: { type: Boolean, default: true }
  },
  joinedAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Waitlist', waitlistSchema);