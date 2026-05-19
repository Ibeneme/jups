const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController"); // Path to your controller

/**
 * 🔐 CLONEKRAFT AUTHENTICATION ROUTES
 */

// 1. Initial OTP Request (Sign up / Login)
// POST /api/auth/send-otp
console.log("🔗 [Route Config] Mapping POST /send-otp");
router.post("/send-otp", authController.sendOTP);

// 2. Resend OTP Request
// POST /api/auth/resend-otp
console.log("🔗 [Route Config] Mapping POST /resend-otp");
router.post("/resend-otp", authController.resendOTP);

// 3. Verify OTP
// POST /api/auth/verify-otp
console.log("🔗 [Route Config] Mapping POST /verify-otp");
router.post("/verify-otp", authController.verifyOTP);


console.log("🔗 [Route Config] Mapping POST update-profile");
router.post("/update-profile", authController.updateProfile);

console.log("🔗 [Route Config] Mapping GET /profile/:id");
router.get("/profile/:id", authController.updateProfileNew);



console.log("🔗 [Route Config] Mapping GET /profile/:id");
router.get("/profile/:id", authController.getProfile);


//update-profile
module.exports = router;
