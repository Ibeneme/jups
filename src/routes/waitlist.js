const express = require("express");
const Waitlist = require("../models/Waitlist"); // Path to your schema

const router = express.Router();

// ─────────────────────────────────────────────
// JOIN WAITLIST
// ─────────────────────────────────────────────
router.post("/join", async (req, res) => {
  try {
    console.log("📥 Incoming waitlist request:", req.body);

    const { name, email, interests } = req.body;

    // 1. Basic Validation
    if (!name || !email) {
      console.log("❌ Missing name or email");
      return res.status(400).json({
        message: "Name and email are required",
      });
    }

    const newEntry = new Waitlist({
      name,
      email,
      interests,
    });

    console.log("🧱 New waitlist entry (before save):", newEntry);

    await newEntry.save();

    console.log(`✅ New Waitlist Entry saved: ${email}`);

    return res.status(201).json({
      success: true,
      message: "Successfully joined the waitlist",
    });
  } catch (error) {
    if (error.code === 11000) {
      console.log(`⚠️ Duplicate waitlist attempt: ${req.body.email}`);
      return res.status(409).json({
        code: 11000,
        message: "Email already exists in our waitlist",
      });
    }

    console.error("❌ Waitlist Server Error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ─────────────────────────────────────────────
// GET ALL WAITLIST ENTRIES
// ─────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    console.log("📤 Fetching all waitlist entries");

    const waitlist = await Waitlist.find().sort({ createdAt: -1 });

    console.log(`📊 Total waitlist entries: ${waitlist.length}`);

    return res.status(200).json({
      success: true,
      count: waitlist.length,
      data: waitlist,
    });
  } catch (error) {
    console.error("❌ Error fetching waitlist:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

router.post("/bulk-upload", async (req, res) => {
  try {
    const users = req.body;

    if (!Array.isArray(users)) {
      return res.status(400).json({ message: "Expected an array" });
    }

    const emailSet = new Set();
    const formattedUsers = [];

    for (const user of users) {
      // 1. Local Duplicate Check (prevents duplicates within the same file)
      const cleanEmail = user.email ? user.email.toLowerCase().trim() : null;
      if (!cleanEmail || emailSet.has(cleanEmail)) continue;

      emailSet.add(cleanEmail);

      let interestsObj = {};
      try {
        interestsObj = typeof user.interests === "string" 
          ? JSON.parse(user.interests) 
          : (user.interests || {});
      } catch (e) {
        interestsObj = {}; // Fallback if JSON string is malformed
      }

      formattedUsers.push({
        name: user.name,
        email: cleanEmail,
        interests: {
          updates: interestsObj.updates ?? true,
          earlyAccess: interestsObj.earlyAccess ?? true,
          exclusivePerks: interestsObj.exclusivePerks ?? true,
        },
      });
    }

    // 2. Database Insertion with { ordered: false }
    // This allows valid users to be saved even if others are duplicates.
    const result = await Waitlist.insertMany(formattedUsers, { ordered: false });

    res.status(201).json({
      message: "Waitlist uploaded successfully",
      received: users.length,
      inserted: result.length,
    });

  } catch (error) {
    // 3. Handle Duplicate Key Errors specifically
    if (error.code === 11000 || error.name === "BulkWriteError") {
      return res.status(201).json({
        message: "Upload completed with some duplicates skipped",
        inserted: error.result ? error.result.nInserted : "Partial",
        note: "Some emails already existed in the database."
      });
    }

    console.error("Upload Error:", error);
    res.status(500).json({
      message: "Bulk upload failed",
      error: error.message,
    });
  }
});

module.exports = router;
