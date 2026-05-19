const router = require("express").Router();
const Waitlist = require("../../models/Waitlist");
const { Supplier, Driver } = require("../../models/Partners/Partners");
const Carpenter = require("../../models/Carpenters/Carpenter");
const User = require("../../models/User");
const ProductionOrder = require("../../models/ProductionOrder");
const Payment = require("../../models/Payment");
const InteriorDecoratorProject = require("../../models/Interior_Designer/InteriorDecoratorProject");
const InteriorDesigner = require("../../models/Interior_Designer/InteriorDesigner");
const ProductionOrderProgress = require("../../models/ProductionOrderProgress");
const ProductionUpdate = require("../../models/ProductionUpdate");
const OnsiteMeasurement = require("../../models/RequestOnsite");
router.get("/all-data", async (req, res) => {
  console.log(
    "🚀 [Admin Dashboard]: Fetching all data with Unified Designer Model & Onsite Measurements..."
  );
  try {
    const [
      waitlist,
      carpenters,
      designers,
      suppliers,
      drivers,
      users,
      rawOrders,
      payments,
      designerProjects,
      onsite, // 🆕 Added Onsite Measurement
    ] = await Promise.all([
      Waitlist.find().sort({ joinedAt: -1 }),
      Carpenter.find().sort({ createdAt: -1 }),
      InteriorDesigner.find().sort({ createdAt: -1 }),
      Supplier.find().sort({ createdAt: -1 }),
      Driver.find().sort({ createdAt: -1 }),
      User.find().sort({ createdAt: -1 }),
      ProductionOrder.find()
        .populate("user", "firstName lastName email profilePicture")
        .populate("assignedCarpenters")
        .populate("assignedDrivers")
        .populate("assignedSuppliers")
        .populate({ path: "assignedDesigners", model: "InteriorDesigner" })
        .sort({ createdAt: -1 }),
      Payment.find()
        .populate("user", "firstName lastName")
        .sort({ createdAt: -1 }),
      InteriorDecoratorProject.find()
        .populate({ path: "designerId", model: "InteriorDesigner" })
        .sort({ createdAt: -1 }),
      // 🆕 Fetching Onsite Measurements and hydrating user info
      OnsiteMeasurement.find()
        .populate("userId", "firstName lastName email profilePicture")
        .sort({ createdAt: -1 }),
    ]);

    // ─── AUTO-GENERATE MISSING ORDER IDs (Maintenance Logic) ───
    const orders = await Promise.all(
      rawOrders.map(async (order) => {
        if (!order.orderId) {
          const timestamp = new Date().getTime().toString().slice(-4);
          const random = Math.floor(1000 + Math.random() * 9000);
          const generatedId = `ORD-${new Date().getFullYear()}-${timestamp}-${random}`;

          order.orderId = generatedId;
          await ProductionOrder.findByIdAndUpdate(order._id, {
            orderId: generatedId,
          });
        }
        return order;
      })
    );

    res.status(200).json({
      success: true,
      counts: {
        waitlist: waitlist.length,
        carpenters: carpenters.length,
        designers: designers.length,
        suppliers: suppliers.length,
        drivers: drivers.length,
        users: users.length,
        orders: orders.length,
        payments: payments.length,
        designerProjects: designerProjects.length,
        onsite: onsite.length, // 🆕 Included in counts
      },
      data: {
        waitlist,
        carpenters,
        designers,
        suppliers,
        drivers,
        users,
        orders,
        payments,
        designerProjects,
        onsite, // 🆕 Included in data
      },
    });
  } catch (err) {
    console.error("🔥 [Admin Dashboard Error]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/fetch/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  console.warn(`🚀 [Admin Fetch]: Fetching from ${collection} with ID: ${id}`);

  const models = {
    waitlist: Waitlist,
    carpenters: Carpenter,
    designers: InteriorDesigner,
    suppliers: Supplier,
    drivers: Driver,
    users: User,
    orders: ProductionOrder,
    payments: Payment,
    designerProjects: InteriorDecoratorProject,
    onsite: OnsiteMeasurement, // 🆕 Added Onsite Measurement model
  };

  try {
    const Model = models[collection];
    if (!Model) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid collection" });
    }

    let query = Model.findById(id);

    // ─── MASTER POPULATION LOGIC ───

    // 🆕 Populate User for Onsite Measurements
    if (collection === "onsite") {
      query = query.populate(
        "userId",
        "firstName lastName email phoneNumber profilePicture"
      );
    }

    if (collection === "designerProjects") {
      query = query.populate({
        path: "designerId",
        model: "InteriorDesigner",
      });
    }

    if (collection === "orders") {
      query = query
        .populate("user", "firstName lastName email profilePicture")
        .populate("assignedCarpenters")
        .populate("assignedDrivers")
        .populate("assignedSuppliers")
        .populate({
          path: "assignedDesigners",
          model: "InteriorDesigner",
        });
    }

    if (collection === "payments") {
      query = query.populate("user").populate("orderId");
    }

    const item = await query.lean();

    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    // 🚫 SECURITY: BLOCK UNVERIFIED USERS
    if (collection === "users" && item.verified === false) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ─── ENRICH PRODUCTION ORDER DATA ───
    const targetOrderId =
      collection === "orders" ? item._id : item.orderId?._id;

    if (targetOrderId) {
      const [progress, socialUpdates] = await Promise.all([
        ProductionOrderProgress.findOne({ order: targetOrderId }).lean(),
        ProductionUpdate.find({ orderId: targetOrderId })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      item.productionProgress = progress;
      item.socialUpdates = socialUpdates;
    }

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (err) {
    console.error("🔥 [Fetch Error]:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
// --- 3. CATEGORY SPECIFIC COUNTS ---
router.get("/counts", async (req, res) => {
  console.log("🔢 [Admin Dashboard]: Calculating category counts...");
  try {
    const counts = {
      waitlist: await Waitlist.countDocuments(),
      carpenters: await Carpenter.countDocuments(),
      activeDesignerProjects: await InteriorDecoratorProject.countDocuments({
        deliveryStatus: { $ne: "delivered" },
      }),
      orders: await ProductionOrder.countDocuments({ status: "pending" }),
    };

    console.log("📉 [Admin Dashboard]: Counts calculated successfully.");
    res.status(200).json({ success: true, counts });
  } catch (err) {
    console.error("🔥 [Admin Counts Error]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
