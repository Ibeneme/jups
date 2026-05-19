const jwt = require("jsonwebtoken");
const User = require("../models/User");

const verifyToken = async (req, res, next) => {
  console.log("--------------------------------------------------");
  console.log("🔍 [Auth Middleware] Verification Started");

  try {
    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.warn("⚠️ [Auth Middleware] Missing Authorization Header");
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      console.warn("⚠️ [Auth Middleware] Header does not start with 'Bearer'");
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid token format" });
    }

    const token = authHeader.split(" ")[1];
    console.log(`📡 [Auth Middleware] Token Extract: ${token.substring(0, 15)}...`);

    // 2. Verify token
    console.log("🔐 [Auth Middleware] Verifying JWT Signature...");
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "supersecretkey"
    );
    
    console.log(`✅ [Auth Middleware] JWT Decoded. User ID: ${decoded.id}`);

    // 3. Find user in DB
    console.log("🗄️ [Auth Middleware] Searching Database for User...");
    const user = await User.findById(decoded.id);
    
    if (!user) {
      console.error(`❌ [Auth Middleware] User ID ${decoded.id} not found in DB`);
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // 4. Attach user to request
    console.log(`👤 [Auth Middleware] Authenticated: ${user.email}`);
    req.user = user;
    
    console.log("🚀 [Auth Middleware] Passing to next route...");
    console.log("--------------------------------------------------");
    next();
  } catch (err) {
    console.error("🔥 [Auth Middleware] verifyToken FATAL Error:");
    console.error(`Error Name: ${err.name}`);
    console.error(`Error Message: ${err.message}`);
    
    if (err.name === 'TokenExpiredError') {
      console.error("⏰ [Auth Middleware] Token has EXPIRED");
    } else if (err.name === 'JsonWebTokenError') {
      console.error("🚫 [Auth Middleware] Token Signature is INVALID");
    }

    console.log("--------------------------------------------------");
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

module.exports = verifyToken;
