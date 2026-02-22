require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/maple_mini_rpg";

// ── Middleware ─────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API routes ────────────────────────────────────────
app.use("/api", apiRoutes);

// ── Serve the game files statically ───────────────────
app.use(express.static(path.join(__dirname, "..", "game")));

// Fallback: serve index.html for the root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "game", "index.html"));
});

// ── Connect to MongoDB and start server ───────────────
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
