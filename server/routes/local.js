// ═══════════════════════════════════════════════════════
// LOCAL MODE API — no MongoDB, in-memory user store
// Same endpoints as api.js so the client works unchanged.
// Data is lost when the server restarts.
// ═══════════════════════════════════════════════════════

const express = require("express");
const router = express.Router();

const JWT_SECRET = "local_dev_secret";

// ── In-memory store ───────────────────────────────────
const users = new Map(); // username -> { username, email, password, gameData }
let idCounter = 1;

// ── Minimal JWT (just base64 for local dev) ───────────
function signToken(username) {
  const payload = JSON.stringify({ username, iat: Date.now() });
  return Buffer.from(payload).toString("base64");
}

function decodeToken(token) {
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

// ── Auth middleware ───────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token provided" });

  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const decoded = decodeToken(token);
  if (!decoded || !decoded.username) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.username = decoded.username;
  next();
}

// ── Default game data ─────────────────────────────────
function defaultGameData() {
  return {
    level: 1, exp: 0, expToNext: 30,
    playerClass: "warrior", classLocked: false,
    hp: 30, maxHP: 30, mp: 0, maxMP: 0,
    str: 0, vit: 0, dex: 0, int: 0, luk: 0,
    statPoints: 0, damage: 2,
    baseHPFromClass: 30, baseMPFromClass: 0,
    x: 120, y: 0, facing: 1,
    mesos: 0,
    inventory: { hp1: 0, hp2: 0, hp3: 0, mp1: 0, mp2: 0, mp3: 0 },
    currentQuestId: null,
    completedQuests: [],
    questProgress: {},
    currentMap: "",
  };
}

// ═══════════════════════════════════════════════════════
// POST /api/register
// ═══════════════════════════════════════════════════════
router.post("/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (users.has(username)) {
    return res.status(409).json({ error: "Username already exists." });
  }

  users.set(username, {
    id: idCounter++,
    username,
    email,
    password,
    gameData: defaultGameData(),
  });

  const token = signToken(username);
  res.status(201).json({
    token,
    user: { username, email },
  });
});

// ═══════════════════════════════════════════════════════
// POST /api/login
// ═══════════════════════════════════════════════════════
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }

  const user = users.get(username);

  // In local mode, auto-create user on first login for convenience
  if (!user) {
    users.set(username, {
      id: idCounter++,
      username,
      email: `${username}@local`,
      password,
      gameData: defaultGameData(),
    });
  } else if (user.password !== password) {
    return res.status(401).json({ error: "Invalid password." });
  }

  const token = signToken(username);
  res.json({ token, user: { username } });
});

// ═══════════════════════════════════════════════════════
// GET /api/game/load
// ═══════════════════════════════════════════════════════
router.get("/game/load", auth, (req, res) => {
  const user = users.get(req.username);
  if (!user) return res.status(404).json({ error: "User not found." });

  res.json({
    username: user.username,
    gameData: user.gameData,
  });
});

// ═══════════════════════════════════════════════════════
// POST /api/game/save
// ═══════════════════════════════════════════════════════
router.post("/game/save", auth, (req, res) => {
  const user = users.get(req.username);
  if (!user) return res.status(404).json({ error: "User not found." });

  const gd = req.body.gameData;
  if (!gd) return res.status(400).json({ error: "No gameData provided." });

  // Merge incoming data
  const d = user.gameData;
  for (const key of Object.keys(d)) {
    if (key === "inventory" && gd.inventory) {
      d.inventory = { ...d.inventory, ...gd.inventory };
    } else if (gd[key] !== undefined) {
      d[key] = gd[key];
    }
  }

  res.json({ ok: true });
});

module.exports = router;
