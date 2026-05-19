const express = require("express");
const { OpenAI } = require("openai");
const axios = require("axios");
const verifyToken = require("../utils/verifyToken");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const User = require("../models/User"); // Ensure User model is imported
const multer = require("multer");
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.get("/my-images", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find user and select only the generatedImages field
    const user = await User.findById(userId).select("generatedImages");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User protocol not found.",
      });
    }

    // Sort images by date (Newest First)
    const history = user.generatedImages.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({
      success: true,
      count: history.length,
      images: history,
    });
  } catch (error) {
    console.error("🔥 Fetch History Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve your design history.",
    });
  }
});

router.post("/generate-image", verifyToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    const user = req.user;

    if (!prompt || prompt.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Prompt is required.",
      });
    }

    console.log("🎨 Initiating AI Render for:", prompt);

    /* ───────────────────────────────
       1. Generate Image from OpenAI
    ─────────────────────────────── */
    const imageResponse = await openai.images.generate({
      model: "dall-e-3", // Changed from "gpt-image-1" to valid DALL-E 3
      prompt: `Ultra realistic photography of ${prompt}. High detail, cinematic lighting, 4k resolution, furniture catalog style.`,
      size: "1024x1024",
      quality: "hd",
      n: 1,
    });

    // Defensive check: Ensure the URL exists
    const openAIImageUrl = imageResponse.data?.[0]?.url;

    if (!openAIImageUrl) {
      console.error("❌ OpenAI failed to return a URL:", imageResponse);
      return res.status(500).json({
        success: false,
        error: "OpenAI did not generate a valid image URL.",
      });
    }

    /* ───────────────────────────────
       2. Download Image Buffer
    ─────────────────────────────── */
    const imgBufferResponse = await axios.get(openAIImageUrl, {
      responseType: "arraybuffer",
    });

    const imageBuffer = Buffer.from(imgBufferResponse.data);

    /* ───────────────────────────────
       3. Upload to Backblaze
    ─────────────────────────────── */
    const fileName = `gen_${user._id}_${Date.now()}.png`;

    const b2Url = await uploadToBackblaze(
      imageBuffer,
      fileName,
      "ai-generated-images"
    );

    /* ───────────────────────────────
       4. SAVE TO USER HISTORY
    ─────────────────────────────── */
    // Using findById to ensure we target the correct document
    await User.findByIdAndUpdate(user._id, {
      $push: {
        generatedImages: {
          prompt,
          imageUrl: b2Url,
          createdAt: new Date(),
        },
      },
    });

    return res.status(200).json({
      success: true,
      prompt,
      imageUrl: b2Url,
    });
  } catch (error) {
    // Better error logging for debugging
    console.error(
      "🔥 Image Generation Error:",
      error?.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to generate image.",
    });
  }
});

router.post("/chat", verifyToken, upload.single("file"), async (req, res) => {
  console.log("--- 🚀 ARTISAN OMNI-REQUEST START ---");

  try {
    const { message, history } = req.body;
    const userFile = req.file;
    const userId = req.user._id;

    if (!message && !userFile) {
      return res.status(400).json({ success: false, error: "Input required." });
    }

    let mediaUrl = null;
    let mediaType = userFile?.mimetype.startsWith("video") ? "video" : "image";

    if (userFile) {
      console.log(`📤 Uploading User ${mediaType} to Cloud...`);
      const fileName = `chat_${userId}_${Date.now()}`;
      mediaUrl = await uploadToBackblaze(
        userFile.buffer,
        fileName,
        "chat-uploads"
      );
    }

    // 2. Enhanced System Prompt for detailed Costing & Duration
    const messages = [
      {
        role: "system",
        content: `You are the CloneKraft Artisan Bot, a world-class furniture expert.
        If the user asks to "cost", "price", or build an item, you MUST provide a structured JSON at the end of your response inside [DATA_BLOCK] tags.
        
        JSON Structure:
        {
          "explanation": "Human-friendly summary for the chat bubble",
          "generateImage": boolean,
          "refinedPrompt": "Detailed DALL-E prompt for furniture visualization",
          "costing": true,
          "totalCostNGN": number,
          "duration": "Estimated time to build, e.g., 2 weeks",
          "items": [{ "name": "string", "quantity": number, "subtotalNGN": number }],
          "analysis": "Internal material/craftsmanship breakdown"
        }
        
        If not costing, set "costing": false and omit pricing fields. Always use [DATA_BLOCK]{...}[DATA_BLOCK].`,
      },
    ];

    if (history) messages.push(...JSON.parse(history));

    const userContent = [
      { type: "text", text: message || "Analyze this furniture piece." },
    ];
    if (mediaUrl) {
      if (mediaType === "image") {
        userContent.push({ type: "image_url", image_url: { url: mediaUrl } });
      } else {
        userContent.push({
          type: "text",
          text: `[Context: User attached a video for analysis: ${mediaUrl}]`,
        });
      }
    }
    messages.push({ role: "user", content: userContent });

    console.log("📡 Querying GPT-4o Omni Layer...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 1200,
    });

    const aiRawResponse = response.choices[0].message.content;
    let costingData = null;

    // 4. Extract and Parse JSON Data Block
    const dataMatch = aiRawResponse.match(
      /\[DATA_BLOCK\]([\s\S]*?)\[DATA_BLOCK\]/
    );
    if (dataMatch) {
      try {
        costingData = JSON.parse(dataMatch[1].trim());
        console.log("📊 Structured Costing Data Extracted:", costingData);
      } catch (e) {
        console.error("❌ JSON Parse Error:", e.message);
      }
    }

    const cleanReply = aiRawResponse
      .replace(/\[DATA_BLOCK\][\s\S]*?\[DATA_BLOCK\]/g, "")
      .trim();
    let finalImageUrl = mediaUrl;
    let isAutoGenerated = false;

    // 5. AI Image Generation Logic
    if (costingData?.generateImage && costingData?.refinedPrompt) {
      const imageGen = await openai.images.generate({
        model: "dall-e-3",
        prompt: `Hyper-realistic furniture photography: ${costingData.refinedPrompt}`,
        size: "1024x1024",
        quality: "hd",
      });

      const dallEUrl = imageGen.data[0].url;
      const imgRes = await axios.get(dallEUrl, { responseType: "arraybuffer" });
      finalImageUrl = await uploadToBackblaze(
        Buffer.from(imgRes.data),
        `gen_${userId}_${Date.now()}.png`,
        "ai-generated-images"
      );
      isAutoGenerated = true;

      await User.findByIdAndUpdate(userId, {
        $push: {
          generatedImages: {
            prompt: costingData.refinedPrompt,
            imageUrl: finalImageUrl,
            createdAt: new Date(),
          },
        },
      });
    }

    return res.status(200).json({
      success: true,
      reply: cleanReply || costingData?.explanation,
      isCosted: costingData?.costing || false,
      costingData: costingData, // This contains duration, items, etc.
      imageUrl: finalImageUrl,
      isGenerated: isAutoGenerated,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("🔥 CRITICAL ROUTER ERROR:", error.message);
    return res
      .status(500)
      .json({ success: false, error: "Artisan Protocol Error." });
  }
});
module.exports = router;
