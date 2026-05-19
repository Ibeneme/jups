const User = require("../models/User");
const OTP = require("../models/OTP");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const notifyUser = require("../utils/notifyUser");

// ── Helpers ──
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

const generateToken = (user) => {
  console.log(`🔑 [Auth] Generating JWT for User: ${user._id}`);
  return jwt.sign(
    { id: user._id, email: user.email, phoneNumber: user.phoneNumber },
    process.env.JWT_SECRET || "supersecretkey",
    { expiresIn: "7d" }
  );
};

// ── Send OTP (FIXED USER LOGIC) ──
exports.sendOTP = async (req, res) => {
  try {
    const { type, value } = req.body; // Logic refined to ignore names on first hit
    console.log(`📩 [OTP Request] Type: ${type}, Value: ${value}`);

    if (!value || !type || !["email", "phone"].includes(type)) {
      console.warn("⚠️ [OTP Request] Rejected: Missing or invalid fields");
      return res.status(400).json({ message: "Invalid input" });
    }

    // 1. Cleanup existing OTPs
    await OTP.deleteMany({ type, value });

    // 2. Generate and Store OTP
    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await OTP.create({ type, value, code: otpCode, expiresAt: otpExpiry });

    console.log(`🎲 [Generated] Code: ${otpCode} (Expires: 5 mins)`);

    // 3. Send via Email
    if (type === "email") {
      console.log(`📧 [Email] Dispatching to ${value}...`);
      await sendEmail({ to: value, otp: otpCode, purpose: "verification" });
    }

    // 4. Ensure User Placeholder exists (CRITICAL FOR NAVIGATION)
    let user = await User.findOne(
      type === "email" ? { email: value } : { phoneNumber: value }
    );

    if (!user) {
      console.log(`👤 [User] Creating temporary record for: ${value}`);
      const userData =
        type === "email" ? { email: value } : { phoneNumber: value };
      await User.create(userData);
    } else {
      console.log(`👤 [User] Existing user found: ${user._id}`);
    }

    res.json({ message: `OTP sent successfully to ${value}`, otpCode });
  } catch (err) {
    console.error("🔥 [Critical Error] sendOTP:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── Resend OTP ──
exports.resendOTP = async (req, res) => {
  try {
    const { type, value } = req.body;
    if (!value || !type)
      return res.status(400).json({ message: "Missing required fields" });

    await OTP.deleteMany({ type, value });
    const otpCode = generateOTP();
    await OTP.create({
      type,
      value,
      code: otpCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    if (type === "email") {
      await sendEmail({ to: value, otp: otpCode, purpose: "verification" });
    }

    res.json({ message: "New OTP sent successfully", otpCode });
  } catch (err) {
    res.status(500).json({ message: "Failed to resend OTP" });
  }
};

// ── Verify OTP (FIXED RESPONSE) ──
// ── Verify OTP (WITH MASTER BYPASS) ──
exports.verifyOTP = async (req, res) => {
  try {
    const { type, value, otp } = req.body;
    console.log(`🧪 [Verification] Attempting: ${value} with code: ${otp}`);

    if (!value || !otp)
      return res.status(400).json({ message: "Invalid input" });

    // 1. MASTER BYPASS LOGIC
    // If credentials match your specific email and code, bypass DB checks
    const isMasterLogin =
      value === "ikennaibenemee@gmail.com" && otp === "1234";

    let otpRecord = null;
    if (!isMasterLogin) {
      // Standard flow: Check database for OTP
      otpRecord = await OTP.findOne({ type, value, code: otp });

      if (!otpRecord) return res.status(400).json({ message: "Invalid OTP" });
      if (otpRecord.expiresAt < new Date())
        return res.status(400).json({ message: "OTP expired" });

      // Clean up OTP if it was a real DB record
      await OTP.deleteMany({ type, value });
    } else {
      console.log("🌟 [Master Login] Bypass activated for developer account.");
    }

    // 2. USER RESOLUTION
    const user = await User.findOne(
      type === "email" ? { email: value } : { phoneNumber: value }
    );

    if (!user) return res.status(400).json({ message: "User not found" });

    const token = generateToken(user);

    // 3. SECURITY NOTIFICATION
    if (user.firstName) {
      const loginTime = new Date().toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
      });

      await notifyUser({
        userId: user._id,
        title: "New Login Detected 🛡️",
        description: `Your CloneKraft account was accessed on ${loginTime}. If this wasn't you, please contact support immediately.`,
        type: "INTERACTION",
      });
    }

    console.log(
      `🏁 [Flow Complete] ${user.firstName || "New User"} is verified.`
    );

    res.json({
      message: "OTP verified successfully",
      user: {
        id: user._id,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      token,
    });
  } catch (err) {
    console.error("🔥 [Critical Error] verifyOTP:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ── Update Profile (NEW) ──
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, userId } = req.body;

    if (!firstName || !lastName) {
      return res
        .status(400)
        .json({ message: "First and Last names are required" });
    }

    console.log(`👤 [Profile Update] Updating user: ${userId}`);

    const user = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName },
      { new: true } // Returns the updated document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (err) {
    console.error("🔥 [Critical Error] updateProfile:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateProfileNew = async (req, res) => {
  try {
    const userId = req.params.id; // usually from JWT auth middleware
    const {
      firstName,
      lastName,
      username,
      bio,
      gender,
      dateOfBirth,
      address,
      website,
      profilePicture,
    } = req.body;

    if (!userId)
      return res.status(400).json({ message: "User ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update only the fields provided
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (username !== undefined) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (gender !== undefined) user.gender = gender;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (address !== undefined) user.address = address;
    if (website !== undefined) user.website = website;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        bio: user.bio,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        website: user.website,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ message: "User ID is required" });

    const user = await User.findById(id);

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        bio: user.bio,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        website: user.website,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
