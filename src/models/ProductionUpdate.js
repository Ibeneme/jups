const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ProductionUpdateSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductionOrder",
      required: true,
    },
    adminName: { type: String, required: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    images: [{ type: String }], // Array for multiple Backblaze URLs
    likes: [], // Simple array of strings (usernames)
    comments: [CommentSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductionUpdate", ProductionUpdateSchema);
