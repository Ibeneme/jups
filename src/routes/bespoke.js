const express = require("express");
const router = express.Router();
const multer = require("multer");
const BespokeOrder = require("../models/BespokeOrder");
const User = require("../models/User"); // Added missing import
const ProductionOrder = require("../models/ProductionOrder"); // Added missing import
const verifyToken = require("../utils/verifyToken");
// const verifyAdmin = require("../utils/verifyAdmin"); // Highly recommended
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ==========================================
// ADMIN ROUTES (New)
// ==========================================

/**
 * @route   GET /api/v1/bespoke/admin/all
 * @desc    Fetch ALL bespoke requests for dashboard (Admin Only)
 */
router.get("/admin-all", async (req, res) => {
  try {
    // Basic Admin Check (If you don't use a separate middleware)
    // if (req.user.role !== "admin" && !req.user.isAdmin) {
    //   return res.status(403).json({ message: "Access denied. Admins only." });
    // }

    // Fetch orders and populate user details (name/email) for the table
    const orders = await BespokeOrder.find()
      .populate("userId", "firstName lastName email phoneNumber")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch admin data", error: error.message });
  }
});

/**
 * @route   DELETE /api/v1/bespoke/admin/:id
 * @desc    Delete a bespoke request (Admin Only)
 */
router.delete("/admin/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin" && !req.user.isAdmin)
      return res.status(403).json({ message: "Unauthorized" });

    await BespokeOrder.findByIdAndDelete(req.params.id);
    // Also cleanup any linked production order if necessary
    await ProductionOrder.findOneAndDelete({ BespokeOrder: req.params.id });

    res
      .status(200)
      .json({ success: true, message: "Request purged successfully" });
  } catch (error) {
    res.status(500).json({ message: "Purge failed" });
  }
});

// ==========================================
// USER ROUTES (Existing)
// ==========================================

/**
 * @route   POST /api/v1/bespoke/create
 */
router.post("/create", verifyToken, upload.any(), async (req, res) => {
  try {
    const userId = req.user._id;
    // Extract fields from body
    let { items, } = req.body;

    if (typeof items === "string") items = JSON.parse(items);


    const processedItems = await Promise.all(
      items.map(async (item, index) => {
        const itemImages = [];
        let itemVideo = null;
        const relatedFiles = req.files.filter((f) =>
          f.fieldname.startsWith(`item_${index}_`)
        );

        for (const file of relatedFiles) {
          const folder = file.mimetype.startsWith("video")
            ? "bespoke/videos"
            : "bespoke/images";
          const uploadedUrl = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            folder
          );
          if (file.mimetype.startsWith("video")) itemVideo = uploadedUrl;
          else itemImages.push(uploadedUrl);
        }
        return {
          ...item,
          images: itemImages,
          videoUri: itemVideo,
          measurements: item.measurements || [],
        };
      })
    );

    const newOrder = new BespokeOrder({
      userId,
      items: processedItems,
      status: "pending",
    });

    await newOrder.save();
    res.status(201).json({ success: true, data: newOrder });
  } catch (error) {
    console.error("Error creating bespoke order:", error);
    res
      .status(500)
      .json({ message: "Failed to process request", error: error.message });
  }
});


router.get("/my-orders", verifyToken, async (req, res) => {
  try {
    const orders = await BespokeOrder.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ message: "Could not retrieve orders." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    // 1. Fetch the Bespoke Request
    const order = await BespokeOrder.findById(req.params.id).populate(
      "userId",
      "firstName lastName email phoneNumber address"
    );

    if (!order) {
      return res.status(404).json({ message: "Bespoke Request not found" });
    }

    // 2. Find the associated Production Order
    // We search by the field 'BespokeOrder' which stores the reference ID
    const productionInfo = await ProductionOrder.findOne({
      BespokeOrder: order._id,
    }).select("_id orderId status totalCostNGN");

    // 3. Combine the data
    // We convert the mongoose document to a plain object to add the extra field
    const responseData = {
      ...order.toObject(),
      linkedProductionOrderId: productionInfo ? productionInfo._id : null,
      productionReference: productionInfo
        ? productionInfo.orderId
        : "NOT_GENERATED",
      productionStatus: productionInfo ? productionInfo.status : "pending",
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching bespoke details",
      error: error.message,
    });
  }
});

router.patch("/update/:id", verifyToken, async (req, res) => {
  try {
    const updatedOrder = await BespokeOrder.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: req.body },
      { new: true }
    );
    res.status(200).json({ success: true, data: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Update failed" });
  }
});

router.patch("/admin/price-update/:id", async (req, res) => {
  try {
    const { estimatedCost, currency, feedback, status } = req.body;

    const bespokeOrder = await BespokeOrder.findById(req.params.id);
    if (!bespokeOrder)
      return res.status(404).json({ message: "Bespoke Order not found" });

    const userData = await User.findById(bespokeOrder.userId);

    // 1. Format Address
    let formattedAddress = "Address not provided on profile";
    if (userData?.address) {
      const { street, city, state, landmark } = userData.address;
      formattedAddress = `${street || ""}${
        landmark ? ` (Near ${landmark}),` : ""
      } ${city || ""}, ${state || ""}`.trim();
      formattedAddress =
        formattedAddress.replace(/^,|,$/g, "").trim() || "Address on Profile";
    }

    // 2. Update Bespoke Order Admin State
    bespokeOrder.adminPanel.estimatedCost = estimatedCost;
    bespokeOrder.adminPanel.currency = currency || "NGN";
    bespokeOrder.adminPanel.feedback = feedback;
    bespokeOrder.adminPanel.reviewedAt = new Date();
    bespokeOrder.status = status || "priced";
    await bespokeOrder.save();

    // 3. Map Items with Descriptions
    const mappedItems = bespokeOrder.items.map((item) => ({
      name: item.name,
      quantity: item.quantity || 1,
      description: item.description, // Added description mapping
      unitPriceNGN: estimatedCost / (bespokeOrder.items.length || 1),
      subtotalNGN: estimatedCost / (bespokeOrder.items.length || 1),
      selectedColor: "As Per Description",
      images: item.images,
      videoUri: item.videoUri,
    }));

    // 4. Collect ALL media (Images + Videos) for the ProductionOrder imageUrls array
    const allMedia = bespokeOrder.items.flatMap((item) => {
      const media = [...(item.images || [])];
      if (item.videoUri) media.push(item.videoUri);
      return media;
    });

    // 5. Find or Create Production Order
    let productionOrder = await ProductionOrder.findOne({
      BespokeOrder: bespokeOrder._id,
    });

    if (!productionOrder) {
      productionOrder = new ProductionOrder({
        user: bespokeOrder.userId,
        BespokeOrder: bespokeOrder._id,
        orderId: `CK-B-${Math.random()
          .toString(36)
          .substr(2, 6)
          .toUpperCase()}`,
        deliveryAddress: formattedAddress,
        items: mappedItems,
        totalCostNGN: estimatedCost,
        balanceRemaining: estimatedCost, // Initialize balance
        currency: currency || "NGN",
        explanation: feedback,
        status: "pending",
        duration: bespokeOrder.bundleTimeline || "3-4 Weeks",
        imageUrls: allMedia, // Combined images and videos
      });
    } else {
      // Update existing
      productionOrder.totalCostNGN = estimatedCost;
      productionOrder.balanceRemaining =
        estimatedCost - (productionOrder.amountPaid || 0);
      productionOrder.items = mappedItems;
      productionOrder.explanation = feedback;
      productionOrder.deliveryAddress = formattedAddress;
      productionOrder.imageUrls = allMedia;
    }

    await productionOrder.save();

    res.status(200).json({
      success: true,
      message: "Quote sent and Production Order synced",
      data: productionOrder,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Admin update failed", error: error.message });
  }
});

module.exports = router;
