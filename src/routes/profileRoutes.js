const express = require("express");
const router = express.Router();
const verifyToken = require("../utils/verifyToken");
const profileController = require("../controllers/profileController");
const upload = require("../middlewares/upload");
const User = require("../models/User");

/**
 * 👤 PROFILE ROUTES
 */

// Get current user's profile
// GET /api/v1/profile
router.get("/", verifyToken, profileController.getProfile);

// Update profile details
// PUT /api/v1/profile
router.put("/", verifyToken, profileController.updateProfile);

// 🔔 Update preferences (notifications, etc)
// PUT /api/v1/profile/preferences
router.put("/preferences", verifyToken, profileController.updatePreferences);

// 📧 Request email change OTP
// POST /api/v1/profile/change-email/request
router.post(
  "/change-email/request",
  verifyToken,
  profileController.requestEmailChangeOTP
);

// ✅ Verify email change OTP
// POST /api/v1/profile/change-email/verify
router.post(
  "/change-email/verify",
  verifyToken,
  profileController.verifyEmailChangeOTP
);

// 📱 Request phone number change OTP
// POST /api/v1/profile/change-phone/request
router.post(
  "/change-phone/request",
  verifyToken,
  profileController.requestPhoneChangeOTP
);

// ✅ Verify phone number change OTP
// POST /api/v1/profile/change-phone/verify
router.post(
  "/change-phone/verify",
  verifyToken,
  profileController.verifyPhoneChangeOTP
);

router.put(
  "/profile-picture",
  verifyToken,
  upload.single("file"),
  profileController.updateProfilePicture
);

router.post("/expo-push-token", verifyToken, async (req, res) => {
  try {
    console.log("=== Expo Push Token Route Hit ===");
    console.log("User ID:", req.user._id);
    console.log("Request Body:", req.body);

    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      console.log("❌ Missing expoPushToken");
      return res.status(400).json({
        success: false,
        message: "expoPushToken is required",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { expoPushToken },
      { new: true }
    );

    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("✅ Expo push token saved:", user.expoPushToken);

    res.status(200).json({
      success: true,
      message: "Expo push token saved successfully",
      expoPushToken: user.expoPushToken,
    });
  } catch (error) {
    console.error("🔥 Expo Push Token Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
