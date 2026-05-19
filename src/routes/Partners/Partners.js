const express = require("express");
const router = express.Router();
const multer = require("multer");
const { Supplier, Driver } = require("../../models/Partners/Partners");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

const upload = multer({ storage: multer.memoryStorage() });

// --- SUPPLIER ROUTES ---

// 1. Supplier Application (Public)
router.post("/suppliers/apply", async (req, res) => {
  try {
    const newSupplier = new Supplier(req.body);
    await newSupplier.save();
    res
      .status(201)
      .json({ success: true, message: "Application submitted for review." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Admin: Review Suppliers
router.get("/admin/suppliers", async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DRIVER ROUTES ---

// 1. Driver Application Form (Public - With File Uploads)
router.post(
    "/drivers/apply",
    upload.fields([
      { name: "vehiclePhoto", maxCount: 1 },
      { name: "licensePhoto", maxCount: 1 },
    ]),
    async (req, res) => {
      console.log("🚗 HIT /drivers/apply route");
  
      try {
        console.log("📦 Raw req.body:", req.body);
        console.log("🗂️ Raw req.files:", req.files);
  
        if (!req.body.data) {
          console.log("❌ Missing req.body.data");
        }
  
        const driverData = JSON.parse(req.body.data);
        console.log("🧩 Parsed driverData:", driverData);
  
        // ─── Vehicle Photo ─────────────────────────────
        if (req.files?.vehiclePhoto?.length) {
          const file = req.files.vehiclePhoto[0];
  
          console.log("🚘 Vehicle photo received:", {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          });
  
          const vehiclePhotoUrl = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            "drivers/vehicles"
          );
  
          console.log("✅ Vehicle photo uploaded:", vehiclePhotoUrl);
  
          driverData.vehicleDetails.vehiclePhoto = vehiclePhotoUrl;
        } else {
          console.log("⚠️ No vehicle photo uploaded");
        }
  
        // ─── License Photo ─────────────────────────────
        if (req.files?.licensePhoto?.length) {
          const file = req.files.licensePhoto[0];
  
          console.log("🪪 License photo received:", {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          });
  
          const licensePhotoUrl = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            "drivers/licenses"
          );
  
          console.log("✅ License photo uploaded:", licensePhotoUrl);
  
          driverData.licenseAndExperience.licensePhoto = licensePhotoUrl;
        } else {
          console.log("⚠️ No license photo uploaded");
        }
  
        console.log("🧱 Final driverData before save:", driverData);
  
        const newDriver = new Driver(driverData);
  
        console.log("🆕 Driver model instance:", newDriver);
  
        await newDriver.save();
  
        console.log("💾 Driver application saved:", newDriver._id);
  
        res.status(201).json({
          success: true,
          message: "Driver application logged.",
          driverId: newDriver._id,
        });
      } catch (err) {
        console.error("🔥 ERROR in /drivers/apply:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );

// 2. Admin: Manage Active Call List (Internal Only)
router.get("/admin/drivers/active-list", async (req, res) => {
  try {
    const drivers = await Driver.find({ status: "Active" }).select(
      "fullName primaryPhone whatsappNumber coverage"
    );
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin: Log Internal Delivery (Operations)
router.post("/admin/drivers/:driverId/log-delivery", async (req, res) => {
  try {
    const { projectId, notes } = req.body;
    await Driver.findOneAndUpdate(
      { driverId: req.params.driverId },
      { $push: { deliveryHistory: { projectId, notes, date: new Date() } } }
    );
    res.json({ success: true, message: "Delivery logged internally." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
