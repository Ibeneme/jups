const express = require("express");
const multer = require("multer");
const { OpenAI } = require("openai");
const B2 = require("backblaze-b2");
const verifyToken = require("../utils/verifyToken");
const AIChat = require("../models/AIChat");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const router = express.Router();
const axios = require("axios");
/* ───────────────────────────────
   Multer setup
──────────────────────────────── */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

/* ───────────────────────────────
   OpenAI client
──────────────────────────────── */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HYBRID_SYSTEM_PROMPT = `
You are Clonekraft AI — a Nigerian Master Carpenter and Sharp Analyst. 
CRITICAL: You must always respond in valid JSON format.

MODE 1: SALES CLOSER (Furniture)
- If furniture is involved, follow the flow: Identify -> 3-5 preferences -> Build Summary -> Quote.
- Quote Rule: 70% deposit via Paystack, 10-14 days timeline.
- Tone: Humorous and direct ("looks like money without shouting").

MODE 2: GPT ANALYST & WEB SEARCH
- You can now browse the live web for URLs using your search tool.
- You can analyze text provided from uploaded PDF or Word documents.
- Answer any question regardless of category.

JSON OUTPUT STRUCTURE:
{
  "explanation": "Text response for the user",
  "generateImage": true/false,
  "refinedPrompt": "Detailed DALL-E prompt if generating",
  "costing": true/false,
  "totalCostNGN": number,
  "items": [{ "name": "string", "quantity": 1, "subtotalNGN": 0 }],
  "analysis": "Analytical details for GPT mode"
}
`;

router.post(
  "/chat",
  verifyToken,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { message = "" } = req.body;
      const user = req.user;
      const files = req.files || [];
      let extractedText = "";
      const b2Urls = [];
      const openAIImageContent = [];

      // --- DOCUMENT & IMAGE PROCESSING ---
      for (const file of files) {
        // 1. Upload to Backblaze
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "chat-files"
        );
        b2Urls.push(url);

        // 2. Extract content from Documents
        if (file.mimetype === "application/pdf") {
          const data = await pdf(file.buffer);
          extractedText += `\n[PDF content]: ${data.text}`;
        } else if (file.mimetype.includes("wordprocessingml")) {
          const data = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText += `\n[Docx content]: ${data.value}`;
        } else if (file.mimetype.startsWith("image/")) {
          openAIImageContent.push({
            type: "image_url",
            image_url: {
              url: `data:${file.mimetype};base64,${file.buffer.toString(
                "base64"
              )}`,
            },
          });
        }
      }

      let chatHistory = await AIChat.findOne({ user: user._id });
      const previousMessages = chatHistory
        ? chatHistory.messages.slice(-8).map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.content || "[Context]",
          }))
        : [];

      // --- CALL SEARCH-ENABLED MODEL ---
      // Using the Responses API with web_search_preview for live links
      const completion = await openai.responses.create({
        model: "gpt-4o-search-preview", // Updated for real-time web access
        tools: [{ type: "web_search_preview" }],
        instructions: HYBRID_SYSTEM_PROMPT,
        input: `${message}\n${extractedText}`,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(completion.output_text);

      // --- IMAGE GENERATION ---
      if (parsed.generateImage) {
        const imgGen = await openai.images.generate({
          model: "dall-e-3",
          prompt: parsed.refinedPrompt,
        });
        const imgRes = await axios.get(imgGen.data[0].url, {
          responseType: "arraybuffer",
        });
        const genUrl = await uploadToBackblaze(
          Buffer.from(imgRes.data),
          `gen_${Date.now()}.png`,
          "gen-designs"
        );
        b2Urls.push(genUrl);
      }

      // --- DATABASE SAVE ---
      if (!chatHistory)
        chatHistory = await AIChat.create({ user: user._id, messages: [] });
      chatHistory.messages.push({
        role: "user",
        content: message,
        imageUrls: b2Urls,
        timestamp: new Date(),
      });
      chatHistory.messages.push({
        role: "ai",
        content: parsed.explanation || parsed.analysis,
        imageUrls: b2Urls,
        isCosting: !!parsed.totalCostNGN,
        costingData: parsed,
        timestamp: new Date(),
      });
      await chatHistory.save();

      return res
        .status(200)
        .json({ success: true, data: { ...parsed, imageUrls: b2Urls } });
    } catch (error) {
      console.error("AI Error:", error);
      res
        .status(500)
        .json({
          success: false,
          error: "The Master Carpenter is analyzing. Try again.",
        });
    }
  }
);

router.post(
  "/chats",
  verifyToken,
  upload.array("images", 5),
  async (req, res) => {
    console.log("🚀 [CHAT START] Analyzing Request & Images...");

    try {
      const { message = "" } = req.body;
      const user = req.user;
      const files = req.files || [];
      const imageAttached = files.length > 0;

      // 1. FETCH & CLEAN HISTORY (OpenAI-safe strings)
      let chatHistory = await AIChat.findOne({ user: user._id });
      const previousMessages = chatHistory
        ? chatHistory.messages.slice(-6).map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content:
              m.content && m.content.trim() !== ""
                ? m.content
                : "[Visual context provided]",
          }))
        : [];

      const b2ImageUrls = [];
      const openAIImageContent = [];
      if (imageAttached) {
        console.log(`📸 Uploading ${files.length} images to Backblaze...`);
        for (const file of files) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            "profile-pictures"
          );
          b2ImageUrls.push(url);

          const base64 = file.buffer.toString("base64");
          openAIImageContent.push({
            type: "image_url",
            image_url: {
              url: `data:${file.mimetype};base64,${base64}`,
              detail: "high", // Essential for identifying wood grain and joinery
            },
          });
        }
      }

      /* ───────────────────────────────
             3. SYSTEM PROMPT (Master Carpenter)
        ─────────────────────────────── */
      const systemInstruction = `
          You are CloneKraft AI — a Nigerian Master Carpenter (30+ years experience).
          
          VISION INSTRUCTIONS:
          - Analyze attached images for wood species (Teak, Mahogany, MDF), joinery quality, and style.
          - If an image is present, ALWAYS perform a costing analysis.
          
          JSON STRUCTURE:
          {
            "explanation": "Start by describing the specific details you see in the uploaded image.",
            "costing": true,
            "items": [{ "name": string, "quantity": number, "unitPriceNGN": number, "subtotalNGN": number }],
            "totalCostNGN": number,
            "thoughtProcess": "Mention specific materials or techniques seen."
          }
        `;

      // 4. CONSTRUCT TURN (Ensures Vision sees the images)
      const currentPromptText =
        message.trim() ||
        (imageAttached
          ? "Master, please analyze this furniture image and give me a price."
          : "Hello!");

      const currentUserMessage = {
        role: "user",
        content: [
          { type: "text", text: currentPromptText },
          ...openAIImageContent, // Images MUST be in this content array
        ],
      };

      // 5. CALL GPT-4o
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemInstruction },
          ...previousMessages,
          currentUserMessage,
        ],
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(completion.choices[0].message.content);

      /* ───────────────────────────────
             6. SAVE TO DB & RESPOND
        ─────────────────────────────── */
      if (!chatHistory)
        chatHistory = await AIChat.create({ user: user._id, messages: [] });

      // Save User Message
      chatHistory.messages.push({
        role: "user",
        content: currentPromptText,
        imageUrls: b2ImageUrls,
        timestamp: new Date(),
      });

      // Save AI Message (Linking remote B2 images for retrieval later)
      chatHistory.messages.push({
        role: "ai",
        content: parsed.explanation,
        imageUrls: b2ImageUrls, // The AI response is about these images
        isCosting: !!parsed.costing,
        costingData: parsed,
        timestamp: new Date(),
      });

      await chatHistory.save();

      // Return unified payload for the frontend
      return res.status(200).json({
        success: true,
        imageUpload: imageAttached, // Requested flag
        data: {
          ...parsed,
          imageUrls: b2ImageUrls, // Return B2 links for UI gallery
        },
      });
    } catch (error) {
      console.error("🔥 Server Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);
/* ───────────────────────────────
   DELETE /chat/:userId
──────────────────────────────── */
router.delete("/chats/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user._id.toString() !== userId && !req.user.isAdmin) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }
    await AIChat.deleteOne({ user: userId });
    return res
      .status(200)
      .json({ success: true, message: "Chat history cleared successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete chat" });
  }
});

/* ───────────────────────────────
   GET /chat/history
──────────────────────────────── */
router.get("/chat/history", verifyToken, async (req, res) => {
  try {
    console.warn(req.user._id, "req.user._id");
    const chat = await AIChat.findOne({ user: req.user._id }).lean();
    if (!chat) return res.status(200).json({ success: true, messages: [] });
    return res.status(200).json({
      success: true,
      messages: chat.messages,
      updatedAt: chat.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch history" });
  }
});

module.exports = router;
