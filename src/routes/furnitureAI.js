// routes/furniture-ai.js
const express = require("express");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");

const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const FurnitureRequest = require("../models/FurnitureRequest");
const verifyToken = require("../utils/verifyToken");

const router = express.Router();

// ──── CONFIG ────────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../uploads");
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

// Ensure upload folder exists
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log("[furniture-ai] Uploads folder ready →", uploadDir);
  } catch (err) {
    console.error("[furniture-ai] Failed to create uploads folder!", err);
  }
})();

// ──── MULTER SETUP ──────────────────────────────────────────────────────────
const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG & WebP images allowed"), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

// ──── OPENAI CLIENT ─────────────────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
});

// ──── UPDATED SUPER STRICT SYSTEM PROMPT ────────────────────────────────────
const systemPrompt = `
You are CloneKraft AI — savage, street-smart Nigerian digital carpenter with PH/Lagos energy.
Witty, bold, confident, playful roast, Gen Z + pidgin vibe: bruv, fam, chai, mad o, abeg, no cap, 😂😭.
Always sharp, helpful, professional under the sauce.

Every message = brand new. No memory. No history.

────────────────────
GREETING RULE
────────────────────
If user says: empty / hi / hello / hey / start / yo / Hi / Hello / Hey / Start / Yo
Reply ONLY:
"Hello, Clonie. Drop picture of chair, table, wardrobe, bed or any real furniture you wan clone. I dey wait."

Otherwise: NO greeting. Jump straight into response.

────────────────────
WHAT YOU CAN RECOGNIZE (STRICT)
────────────────────
Only full furniture items:
- Chairs (any kind: dining, office, accent, armchair...)
- Tables (dining, centre, coffee, side, console, office...)
- Wardrobes / Armoires
- Bed frames (with or without headboard/storage)
- Cabinets / Sideboards / Chests / TV units
- Full sets (dining set, bedroom set, living room set)

DO NOT recognize: legs, handles, doors, fabric swatches, wood planks, random objects, decor, lights, rugs.

────────────────────
PRICING RULE - IRONCLAD - MUST OBEY OR CRASH
────────────────────
NEVER mention price, cost, how much, estimate, budget, quote, or ANY money talk unless user uses words like:
price, cost, how much, quote, estimate, budget, how much e go cost, wetin be the price, billing

When user clearly asks for price → return **ONLY** valid JSON — nothing else. No intro, no explanation, no extra text:

{
  "items": [
    {
      "name": "exact descriptive name e.g. Modern 6-Seater Dining Set",
      "quality": "Standard" | "Premium" | "Luxury",
      "description": "short savage vibe one-liner",
      "estimatedPriceNGN": number   // WHOLE NUMBER ONLY - NO DECIMALS
    }
  ],
  "totalEstimatedCostNGN": number,
  "estimatedTimeline": "14–21 working days" | "28 working days"
}

MINIMUM PRICE LAW - NON-NEGOTIABLE:
- EVERY SINGLE ITEM must have estimatedPriceNGN ≥ 350000
- Even the simplest-looking chair, stool or side table → minimum ₦350,000
- No item can EVER be priced below 350,000 NGN — no exceptions, no "budget" version
- Wardrobes → minimum ₦500,000
- Bed frames → minimum ₦550,000
- Dining sets / big tables → minimum ₦650,000+
- If the item looks very basic → still force 350000 minimum and mark quality "Standard"

If you ever feel like putting less than 350000 — STOP. Force it to at least 350000. This is absolute.

────────────────────
TIMELINE
────────────────────
Use only: "14–21 working days" or "28 working days"

────────────────────
NO FURNITURE FOUND
────────────────────
"CloneKraft no dey do half job o 😭 This no be proper furniture. Send real chair/table/wardrobe/bed vibe abeg."

Stay confident, cocky, fun, street. No cap 😈🪵🔥

LAST FINAL LOCK: every estimatedPriceNGN you output MUST be >= 350000. Violate this and the whole app go crash. Respect am.
`;

// ──── MAIN ENDPOINT ─────────────────────────────────────────────────────────
router.post(
  "/analyze-furniture",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    console.log("╔══════════════════════════════════════╗");
    console.log("║      CLONEKRAFT AI REQUEST           ║");
    console.log("╚══════════════════════════════════════╝");
    console.log("Timestamp:", new Date().toISOString());
    console.log("User:", req.user?.id || "MISSING");
    console.log("Text:", req.body?.text || "(none)");
    if (req.file) {
      console.log(
        "File:",
        req.file.originalname,
        `(${(req.file.size / 1024 / 1024).toFixed(2)} MB)`
      );
    }

    try {
      const userId = req.user.id;
      const userText = (req.body?.text || "").trim();
      let b2ImageUrl = null;

      // Upload image if present
      if (req.file) {
        const fileBuffer = await fs.readFile(req.file.path);
        b2ImageUrl = await uploadToBackblaze(
          fileBuffer,
          req.file.originalname,
          "furniture-ai"
        );
        await fs.unlink(req.file.path).catch(() => {});
      }

      // Call OpenAI
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini", // you can change to "gpt-4o" for stricter obedience
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userText || "Analyze this furniture picture",
              },
              ...(b2ImageUrl
                ? [{ type: "image_url", image_url: { url: b2ImageUrl } }]
                : []),
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 1200,
      });

      let aiReply =
        aiResponse.choices[0]?.message?.content?.trim() ||
        "AI no send reply 😭";

      // ─── PRICE ENFORCEMENT SAFETY NET ────────────────────────────────
      let isPricingResponse = false;
      let parsed = null;

      // Extract JSON
      const jsonMatch =
        aiReply.match(/```json\s*([\s\S]*?)\s*```/) ||
        aiReply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          if (
            parsed?.items?.length &&
            typeof parsed.totalEstimatedCostNGN === "number"
          ) {
            isPricingResponse = true;

            // FORCE MINIMUM 350k PER ITEM
            let enforced = false;
            parsed.items = parsed.items.map((item) => {
              let price = Number(item.estimatedPriceNGN);
              if (isNaN(price) || price < 350000) {
                console.warn(
                  `[PRICE ENFORCE] AI gave ${price} — forced to 350000 for ${
                    item.name || "item"
                  }`
                );
                item.estimatedPriceNGN = 350000;
                item.description = (item.description || "") + " (min applied)";
                enforced = true;
              }
              return item;
            });

            // Recalculate total
            if (enforced) {
              parsed.totalEstimatedCostNGN = parsed.items.reduce(
                (sum, it) => sum + (Number(it.estimatedPriceNGN) || 0),
                0
              );
            }
          }
        } catch (e) {
          console.log("[JSON parse fail]", e.message);
        }
      }

      // ─── SAVE TO DB ───────────────────────────────────────────────
      const items = isPricingResponse ? parsed.items || [] : [];
      const total = isPricingResponse
        ? Number(parsed.totalEstimatedCostNGN) || 0
        : 0;

      const requestDoc = new FurnitureRequest({
        user: userId,
        userText: userText || (b2ImageUrl ? "Image only" : "Text only"),
        imageUrl: b2ImageUrl,
        detectedItems: items,
        totalEstimatedCostNGN: total,
        status: isPricingResponse ? "quoted" : "pending",
        rawAiResponse: aiReply.substring(0, 2000),
      });

      await requestDoc.save();

      // ─── RESPONSE TO CLIENT ───────────────────────────────────────
      const payload = {
        success: true,
        requestId: requestDoc._id.toString(),
        imageUrl: b2ImageUrl,
      };

      if (isPricingResponse) {
        payload.message = "Oya see sharp estimate 😈";
        payload.isPricingResponse = true;
        payload.detectedItems = parsed.items;
        payload.totalEstimatedCostNGN = parsed.totalEstimatedCostNGN;
        payload.estimatedTimeline =
          parsed.estimatedTimeline || "14–21 working days";
      } else {
        payload.message = aiReply;
        payload.isPricingResponse = false;
      }

      res.json(payload);
    } catch (err) {
      console.error(
        "CLONEKRAFT ERROR:",
        err.message,
        err.stack?.substring(0, 400)
      );

      if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});

      res.status(500).json({
        success: false,
        message: "Something jam today, try again small fam 😭",
      });
    }
  }
);

// ──── GET USER REQUEST HISTORY ──────────────────────────────────────────────
router.get("/my-requests", verifyToken, async (req, res) => {
  try {
    const requests = await FurnitureRequest.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not load history" });
  }
});

module.exports = router;
