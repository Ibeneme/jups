const express = require("express");
const verifyToken = require("../utils/verifyToken");
const ProductionOrder = require("../models/ProductionOrder");
const Notification = require("../models/Notification");
const notifyUser = require("../utils/notifyUser");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const router = express.Router();
const fs = require("fs").promises;
const multer = require("multer");
const Admin = require("../models/Admin/Admin");
const ProductionUpdate = require("../models/ProductionUpdate");

// Configure multer to store files temporarily in memory as buffers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit example (adjust as needed)
});

router.post("/", verifyToken, upload.array("files"), async (req, res) => {
  console.log(
    "\n[POST /production-order] ==================== NEW REQUEST ===================="
  );

  try {
    if (!req.body.metadata) {
      console.log("❌ Missing metadata");
      return res
        .status(400)
        .json({ success: false, error: "Missing metadata" });
    }

    const metadata = JSON.parse(req.body.metadata);
    const { items, timeline, isInstalment } = metadata;
    const uploadedFiles = req.files || [];

    console.log("📦 Metadata Items Count:", items?.length);
    console.log("📂 Uploaded Files Count:", uploadedFiles.length);
    console.log(
      "🔍 Full req.files structure:",
      JSON.stringify(
        uploadedFiles.map((f) => ({
          originalname: f.originalname,
          mimetype: f.mimetype,
          fieldname: f.fieldname,
          itemIndex: f.itemIndex,
          size: f.size,
        })),
        null,
        2
      )
    );

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "At least one item is required." });
    }

    const processedItems = await Promise.all(
      items.map(async (item, index) => {
        let images = [];
        let videoUri = null;

        console.log(
          `\n🔄 PROCESSING ITEM ${index + 1}/${items.length}: ${
            item.name || item.category || "Unnamed"
          }`
        );

        // ───── FILTER FILES FOR THIS ITEM ─────
        const itemFiles = uploadedFiles.filter((file) => {
          const possibleIndexes = [
            file.itemIndex,
            file.fieldname?.match(/itemIndex[_-](\d+)/)?.[1],
            file.originalname?.match(/item[_-](\d+)/i)?.[1],
          ].filter(Boolean);

          const match = possibleIndexes.some(
            (idx) => String(idx) === String(index)
          );
          console.log(
            `   File: ${file.originalname} → Possible Indexes:`,
            possibleIndexes,
            "→ Match:",
            match
          );
          return match;
        });

        console.log(`   → Found ${itemFiles.length} files for this item`);

        // ───── PROCESS FILES ─────
        for (const file of itemFiles) {
          try {
            const isVideo = file.mimetype && file.mimetype.startsWith("video/");

            console.log(
              `   Uploading ${isVideo ? "VIDEO" : "IMAGE"}: ${
                file.originalname
              }`
            );

            const uploadedUrl = await uploadToBackblaze(
              file.buffer,
              file.originalname,
              "production-orders"
            );

            if (isVideo) {
              videoUri = uploadedUrl;
              console.log(`   ✅ VIDEO SAVED: ${uploadedUrl}`);
            } else {
              images.push(uploadedUrl);
              console.log(`   ✅ IMAGE SAVED: ${uploadedUrl}`);
            }
          } catch (uploadErr) {
            console.error(`   ❌ Upload failed:`, uploadErr.message);
          }
        }

        const resultItem = {
          name: item.name || item.category || "Unnamed Item",
          description: item.description || "",
          quantity: item.quantity || 1,
          images: images,
          videoUri: videoUri,
        };

        console.log(
          `✅ ITEM ${index + 1} FINAL:`,
          JSON.stringify(resultItem, null, 2)
        );
        return resultItem;
      })
    );

    console.log("\n📝 SAVING TO DATABASE...");

    const newOrder = await ProductionOrder.create({
      user: req.user._id,
      items: processedItems,
      duration: timeline || "extended",
      status: "pending",
      paymentStatus: "pending",
      isInstalment: !!isInstalment,
      amountPaid: 0,
      balanceRemaining: 0,
      totalCostNGN: 0,
    });

    console.log(`🎉 ORDER SAVED SUCCESSFULLY! ID: ${newOrder._id}`);
    console.log(
      "📋 FINAL ITEMS SAVED TO SCHEMA:",
      JSON.stringify(newOrder.items, null, 2)
    );

    // 👑 ADMIN NOTIFICATION LOGIC (NEW)
    try {
      console.log(
        "[Notification] Fetching verified administrators for new order alert..."
      );
      // Make sure const Admin = require("../models/Admin"); is imported at the top of your file
      const admins = await Admin.find({ isVerified: true });

      if (admins && admins.length > 0) {
        const customerName =
          [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
          "A customer";
        const adminTitle = "📦 New Production Order Created";

        const adminBody = `${customerName} submitted a new order containing ${
          newOrder.items.length
        } item${newOrder.items.length > 1 ? "s" : ""}.\n\nOrder ID: ${
          newOrder._id
        }`;

        const adminPromises = admins.map((admin) =>
          notifyUser({
            userId: admin._id,
            title: adminTitle,
            description: adminBody,
            orderId: newOrder._id,
            type: "ADMIN_NEW_ORDER_ALERT",
          })
        );
        await Promise.all(adminPromises);
        console.log(
          `[Notification] Successfully alerted ${admins.length} administrators about Order #${newOrder._id}.`
        );
      } else {
        console.log(
          "[Notification] No verified administrators found to alert for this new order."
        );
      }
    } catch (adminErr) {
      console.error(
        "[Notification] Non-fatal admin alert error on order creation:",
        adminErr.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Production order created successfully",
      data: newOrder,
    });
  } catch (error) {
    console.error("💥 FATAL ERROR:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create production order",
      details: error.message,
    });
  }
});

/* =====================================
   GET /production-order - All User Orders
   ===================================== */
router.get("/", verifyToken, async (req, res) => {
  console.log("\n========================================");
  console.log("[GET /production-order] Incoming request initialized");
  console.log("[GET /production-order] Authenticated User ID:", req.user?._id);
  console.log("========================================\n");

  try {
    console.log(
      `[GET /production-order] Querying database for user: ${req.user?._id}...`
    );

    const orders = await ProductionOrder.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    console.log(
      `[GET /production-order] DB Query success! Records found: ${
        orders ? orders.length : 0
      }`
    );

    // ⚡ Calculate unread comment metrics for all returned orders concurrently
    const ordersWithCounts = await Promise.all(
      orders.map(async (order) => {
        // Find all progress updates associated with this specific order
        const updates = await ProductionUpdate.find({ orderId: order._id });

        // Sum up the comments where 'isReadByUser' is explicitly false
        let unreadCommentsCount = 0;
        updates.forEach((update) => {
          if (update.comments && update.comments.length > 0) {
            const unread = update.comments.filter(
              (c) => c.isReadByUser === false
            );
            unreadCommentsCount += unread.length;
          }
        });

        // Convert the Mongoose document to a plain object to bind the custom counter safely
        return {
          ...order.toObject(),
          unreadCommentsCount,
        };
      })
    );

    if (orders && orders.length > 0) {
      console.log(
        "[GET /production-order] Sample tracking ID from newest record:",
        orders[0]._id || orders[0].orderId
      );
    } else {
      console.log(
        "[GET /production-order] Notice: No records matched this user query."
      );
    }

    return res.status(200).json({
      success: true,
      data: ordersWithCounts, // 👈 Returns payload injected with unread counts
    });
  } catch (error) {
    console.error(
      "\n❌ [GET /production-order] Fatal execution block error encountered!"
    );
    console.error("[GET /production-order] Error message:", error.message);
    console.error("[GET /production-order] Full Error context stack:", error);
    console.error("========================================\n");

    return res.status(500).json({
      success: false,
      error: "Failed to fetch production orders",
    });
  }
});

/* =====================================
     GET /production-order/:id
     ===================================== */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const order = await ProductionOrder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // ⚡ Compute unread count for this individual document view
    const updates = await ProductionUpdate.find({ orderId: order._id });
    let unreadCommentsCount = 0;
    updates.forEach((update) => {
      if (update.comments && update.comments.length > 0) {
        const unread = update.comments.filter((c) => c.isReadByUser === false);
        unreadCommentsCount += unread.length;
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        ...order.toObject(),
        unreadCommentsCount, // 👈 Added here too
      },
    });
  } catch (error) {
    console.error("[GET /:id] Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch order" });
  }
});

/* =====================================
   PUT /production-order/:id  → Admin & User Updates
   ===================================== */
router.put("/:id", verifyToken, async (req, res) => {
  console.log(`[PUT /:id] Update request for ID: ${req.params.id}`);

  try {
    const user = req.user;
    const updateData = req.body;

    const oldOrder = await ProductionOrder.findOne({
      _id: req.params.id,
      user: user._id,
    });

    if (!oldOrder) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const updatedOrder = await ProductionOrder.findOneAndUpdate(
      { _id: req.params.id, user: user._id },
      { $set: updateData },
      { new: true }
    );

    // Status Change Notification
    if (updateData.status && updateData.status !== oldOrder.status) {
      let statusMsg = `Your order status has been updated to: ${updatedOrder.status}.`;

      if (updatedOrder.status === "in_progress")
        statusMsg = "Your order is now in production.";
      if (updatedOrder.status === "completed")
        statusMsg = "Production completed! Your items are ready.";
      if (updatedOrder.status === "dispatched")
        statusMsg = "Great news! Your order has been dispatched.";
      if (updatedOrder.status === "delivered")
        statusMsg = "Your order has been delivered successfully.";

      await Notification.create({
        user: user._id,
        title: "Order Status Update 🔄",
        description: statusMsg,
        orderId: updatedOrder._id,
        type: "ORDER_UPDATE",
      });

      await notifyUser({
        userId: user._id,
        title: "Order Status Update 🔄",
        description: statusMsg,
        orderId: updatedOrder._id,
        type: "ORDER_UPDATE",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Production order updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("[PUT /:id] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update production order",
    });
  }
});

module.exports = router;
