const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./src/config/db");
const furnitureai = require("./src/routes/furnitureAI");
const authRoutes = require("./src/routes/authRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const chat = require("./src/routes/ai");
const ProductionOrder = require("./src/routes/productionOrder");
const payment = require("./src/routes/payment");
const ProductionUpdate = require("./src/routes/productionUpdates");
const NotificationRoutes = require("./src/routes/notification");
const designToAdmin = require("./src/routes/adminReview");
const app = express();
const submissionID = require("./src/routes/Interior_Designer/Submission_Routes");
const authID = require("./src/routes/Interior_Designer/Auth_Routes");
const projectID = require("./src/routes/Interior_Designer/projects");
const partners = require("./src/routes/Partners/Partners");
const carpentersID = require("./src/routes/Carpenters/Carpenter");
const waitlist = require("./src/routes/waitlist");
const admin = require("./src/routes/Admin/Admin");
const adminData = require("./src/routes/Admin/AdminData");
const authCrp = require("./src/routes/Carpenters/Carpenter_Auth");
const generateImageRouter = require("./src/routes/generateImage");
const bespoke = require('./src/routes/bespoke')
const measurement = require('./src/routes/measurement')

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`🌐 [Incoming] ${req.method} ${req.url}`);
  next();
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/furniture-ai", furnitureai);
app.use("/api/v1/chat-ai", chat);
app.use("/api/v1/production-order", ProductionOrder);
app.use("/api/v1/payment", payment);
app.use("/api/v1/production-progress", ProductionUpdate);
app.use("/api/v1/notifications", NotificationRoutes);
app.use("/api/v1/design-to-admin", designToAdmin);
//design-to-admin
app.use("/api/v1/interior-designer/submission", submissionID);
app.use("/api/v1/interior-designer/auth", authID);
app.use("/api/v1/interior-designer/projects", projectID);
app.use("/api/v1/partners", partners);
app.use("/api/v1/carpenters", carpentersID);
app.use("/api/v1/waitlist", waitlist);
app.use("/api/v1/admin", admin);
app.use("/api/v1/admin/data", adminData);
app.use("/api/v1/auth/carpenter", authCrp);
app.use("/api/v1/ai-bot", generateImageRouter);
app.use("/api/v1/bespoke", bespoke);
app.use("/api/v1/measurement", measurement);

app.get("/", (req, res) => {
  res.send("CloneKraft API running 🚀");
});

app.get("/api/test", (req, res) => {
  res.json({
    message: "Server is working!",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 5006;

const startServer = async () => {
  try {
    await connectDB();
    console.log("💾 [Database] Connection established");

    app.listen(PORT, () => {
      console.log(
        `🚀 [Server] CloneKraft API running on http://localhost:${PORT}`
      );
      console.log(
        `🔗 [Auth] Endpoints active at http://localhost:${PORT}/api/v1/auth`
      );
      console.log(
        `🔗 [Profile] Endpoints active at http://localhost:${PORT}/api/v1/profile`
      );
    });
  } catch (error) {
    console.error("❌ [Critical] Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
