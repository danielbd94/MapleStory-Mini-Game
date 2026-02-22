const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "maple_secret";

// ── Helper: create JWT ────────────────────────────────
function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
}

// ── Middleware: authenticate ──────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token provided" });

  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ═══════════════════════════════════════════════════════
// POST /api/register
// ═══════════════════════════════════════════════════════
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ error: "Username must be 3-24 characters." });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }

    // Check duplicates
    const existing = await User.findOne({
      $or: [{ username }, { email: email.toLowerCase() }],
    });
    if (existing) {
      return res.status(409).json({ error: "Username or email already exists." });
    }

    const user = new User({
      username,
      email,
      passwordHash: password, // pre-save hook will bcrypt it
    });
    await user.save();

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: user.toPublic(),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error during registration." });
  }
});

// ═══════════════════════════════════════════════════════
// POST /api/login
// ═══════════════════════════════════════════════════════
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required." });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = signToken(user._id);
    res.json({
      token,
      user: user.toPublic(),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

// ═══════════════════════════════════════════════════════
// GET /api/game/load   – Load saved game data
// ═══════════════════════════════════════════════════════
router.get("/game/load", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    res.json({
      username: user.username,
      gameData: user.gameData,
    });
  } catch (err) {
    console.error("Load error:", err);
    res.status(500).json({ error: "Failed to load game data." });
  }
});

// ═══════════════════════════════════════════════════════
// POST /api/game/save  – Save game data
// ═══════════════════════════════════════════════════════
router.post("/game/save", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    const gd = req.body.gameData;
    if (!gd) return res.status(400).json({ error: "No gameData provided." });

    // Merge incoming game data onto the user document
    user.gameData.level       = gd.level       ?? user.gameData.level;
    user.gameData.exp         = gd.exp         ?? user.gameData.exp;
    user.gameData.expToNext   = gd.expToNext   ?? user.gameData.expToNext;
    user.gameData.playerClass = gd.playerClass  ?? user.gameData.playerClass;
    user.gameData.classLocked = gd.classLocked ?? user.gameData.classLocked;

    user.gameData.hp    = gd.hp    ?? user.gameData.hp;
    user.gameData.maxHP = gd.maxHP ?? user.gameData.maxHP;
    user.gameData.mp    = gd.mp    ?? user.gameData.mp;
    user.gameData.maxMP = gd.maxMP ?? user.gameData.maxMP;

    user.gameData.str        = gd.str        ?? user.gameData.str;
    user.gameData.vit        = gd.vit        ?? user.gameData.vit;
    user.gameData.dex        = gd.dex        ?? user.gameData.dex;
    user.gameData.int        = gd.int        ?? user.gameData.int;
    user.gameData.luk        = gd.luk        ?? user.gameData.luk;
    user.gameData.statPoints = gd.statPoints ?? user.gameData.statPoints;
    user.gameData.damage     = gd.damage     ?? user.gameData.damage;

    user.gameData.baseHPFromClass = gd.baseHPFromClass ?? user.gameData.baseHPFromClass;
    user.gameData.baseMPFromClass = gd.baseMPFromClass ?? user.gameData.baseMPFromClass;

    user.gameData.x      = gd.x      ?? user.gameData.x;
    user.gameData.y      = gd.y      ?? user.gameData.y;
    user.gameData.facing  = gd.facing ?? user.gameData.facing;

    user.gameData.mesos = gd.mesos ?? user.gameData.mesos;

    if (gd.inventory) {
      user.gameData.inventory = { ...user.gameData.inventory, ...gd.inventory };
    }

    user.gameData.currentQuestId  = gd.currentQuestId  ?? user.gameData.currentQuestId;
    user.gameData.completedQuests = gd.completedQuests ?? user.gameData.completedQuests;
    user.gameData.questProgress   = gd.questProgress   ?? user.gameData.questProgress;
    user.gameData.currentMap      = gd.currentMap      ?? user.gameData.currentMap;

    user.markModified("gameData");
    await user.save();

    res.json({ ok: true });
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ error: "Failed to save game data." });
  }
});

module.exports = router;
module.exports.auth = auth;
