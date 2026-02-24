require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const USE_MONGO = process.env.USE_MONGO !== "false"; // set USE_MONGO=false to disable MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/maple_mini_rpg";

// ── Middleware ─────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API routes ────────────────────────────────────────
if (USE_MONGO) {
  const mongoose = require("mongoose");
  const apiRoutes = require("./routes/api");
  app.use("/api", apiRoutes);

  // ── Serve the game files statically ───────────────────
  app.use(express.static(path.join(__dirname, "..", "game")));
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
} else {
  // ── LOCAL MODE: no MongoDB, in-memory store ───────────
  const localRoutes = require("./routes/local");
  app.use("/api", localRoutes);

  app.use(express.static(path.join(__dirname, "..", "game")));
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "game", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server running in LOCAL mode (no MongoDB) at http://localhost:${PORT}`);
  });
}
