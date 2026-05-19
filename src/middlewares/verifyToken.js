const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Middleware to protect routes
 * Adds `req.user` with user info if token is valid
 */
const verifyToken = async (req, res, next) => {
  try {
    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // 2. Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "supersecretkey"
    );

    // 3. Find user in DB
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(401).json({ message: "Unauthorized: User not found" });

    // 4. Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error("🔥 [Auth Middleware] verifyToken Error:", err);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};



module.exports = verifyToken;
