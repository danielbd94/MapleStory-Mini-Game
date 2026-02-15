const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

// Original design size for scaling calculations
const ORIGINAL_WIDTH = 960;
const ORIGINAL_HEIGHT = 540;

let scaleX = 1;
let scaleY = 1;

// Set canvas to fullscreen and responsive
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  scaleX = canvas.width / ORIGINAL_WIDTH;
  scaleY = canvas.height / ORIGINAL_HEIGHT;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const UI = {
  questTitle: document.getElementById("questTitle"),
  questDesc: document.getElementById("questDesc"),
  questProgress: document.getElementById("questProgress"),
  playerStats: document.getElementById("playerStats"),
  errors: document.getElementById("errors"),

  // NEW: stats panel
  statsBtn: document.getElementById("statsBtn"),
  statsPanel: document.getElementById("statsPanel"),
  statsClose: document.getElementById("statsClose"),
  statsInfo: document.getElementById("statsInfo"),
  btnAddSTR: document.getElementById("btnAddSTR"),
  btnAddVIT: document.getElementById("btnAddVIT"),

  // ✅ INVENTORY
  invBtn: document.getElementById("invBtn"),
  invPanel: document.getElementById("invPanel"),
  invInfo: document.getElementById("invInfo"),
};


const CONFIG = {
  groundY: 465,

  playerSpeed: 240,
  playerDamage: 2,
  attackCooldownMs: 220,

  // NEW: physics
  gravity: 1600,
  jumpVel: 620,

  spawnMaxOnScreen: 6,
  spawnIntervalMs: 900,

  mobBaseSpeedPxPerSec: 40,
  mobWanderSwitchMsMin: 800,
  mobWanderSwitchMsMax: 2200,

  fps: 10,
  hitStateMs: 250,
  dieStateMs: 900,

  playerMaxHP: 30,
  touchDamageCooldownMs: 500,
};
const PLAYER_HITBOX = {
  // כמה להוריד/להצר את הקוליז'ן ביחס לתמונה
  offsetX: 16,
  offsetY: 10,
  w: 22,
  h: 58,

  // נקודת "הרגליים" (לדיוק נחיתה)
  footPad: 2,
};
const PLAYER_DRAW_OFFSET_Y = 18; // כוונון גובה ויזואלי בלבד

let PATHS = {
  statsPrimary: `./assets/data/mobs_stats.json`,
  statsFallback: `./assets/data/mobs_stats.json`,
  quests: `./data/quests.json`,
  mapBg: `./assets/maps/farm.png`,

  frame: (mobId, anim, frameIndex) => {
    const f = String(frameIndex).padStart(3, "0");
    return `./assets/mobs/${mobId}/${anim}/${f}.png`;
  },
};



// לפי המבנה שלך: folder + prefix + "." + index + ".png"
const PLAYER_ANIMS = {
  stand: { folder: "stand", prefix: "stand2" },
  walk: { folder: "walk", prefix: "walk2" },
  jump: { folder: "jump", prefix: "jump" },
  climbRope: { folder: "climbRope", prefix: "rope0" },
  climbLadder: { folder: "climbLadder", prefix: "ladder0" },

  // התקפה: יש לך stabT1, stabT2... נתחיל עם T1
  attack1: { folder: "attack", prefix: "stabT1" },
  attack2: { folder: "attack", prefix: "stabT2" },
  attackF: { folder: "attack", prefix: "stabTF" },

};
const PLAYER_FRAME_COUNTS = {
  stand: 3,        // stand2.0 – stand2.2
  walk: 4,         // walk2.0 – walk2.3
  jump: 1,         // jump0.0
  climbRope: 2,    // rope0.0 – rope0.1
  climbLadder: 2,  // ladder0.0 – ladder0.1
  attack1: 3,
  attack2: 3,
  attackF: 4,
  // stabT1.0 – stabT1.3 (אם יש יותר תגיד לי)
};

const PLAYER_PATHS = {
  frame: (animKey, i) => {
    const a = PLAYER_ANIMS[animKey];
    if (!a) throw new Error(`Unknown player animKey: ${animKey}`);
    return `./assets/player/${a.folder}/${a.prefix}.${i}.png`;
  }
};


async function loadPlayerFrames(animKey) {
  const max = PLAYER_FRAME_COUNTS[animKey] ?? 1;
  const frames = [];

  for (let i = 0; i < max; i++) {
    const img = new Image();
    img.src = PLAYER_PATHS.frame(animKey, i);

    const ok = await new Promise(res => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
    });

    if (ok) {
      frames.push(img);
    } else {
      addError(`Missing player frame: ${animKey} #${i} (${img.src})`);
      // לא דוחפים תמונה שלא נטענה
      break;
    }
  }

  return frames;
}



let mapBgImg = null;

// ===== SHOP NPC (STEP 1: draw only) =====
const shopNpc = { x: 745, y: 0, w: 50, h: 70 };

const shopNpcImg = new Image();
let shopOpen = false;
shopNpcImg.src = "./assets/ui/npc/npc.png";

// ===== SHOP UI IMAGES (tabs) =====
let shopTab = 1; // 1=EQUIP default

const shopUiImgs = {};
for (let i = 1; i <= 5; i++) {
  const im = new Image();
  im.src = `./assets/ui/shop/shop${i}.png`;
  shopUiImgs[i] = im;
}

// store last drawn shop rect for mouse hit-tests
let lastShopRect = null;

// clickable zones inside the shop image (normalized 0..1)
// we'll fine-tune later if needed
const SHOP_TAB_HITBOX = [
  { tab: 1, x: 0.52, y: 0.215, w: 0.12, h: 0.055 }, // EQUIP
  { tab: 2, x: 0.64, y: 0.215, w: 0.10, h: 0.055 }, // USE
  { tab: 3, x: 0.74, y: 0.215, w: 0.10, h: 0.055 }, // ETC
  { tab: 4, x: 0.84, y: 0.215, w: 0.11, h: 0.055 }, // SET-UP
  { tab: 5, x: 0.93, y: 0.215, w: 0.08, h: 0.055 }, // CASH
];

// item clickable rects (filled every render)
let shopItemRects = [];


// ===== POTION SHOP DATA =====
const POTIONS = [
  { id: "hp1", name: "Red Potion", type: "hp", heal: 50, price: 25, img: "./assets/ui/potions/hp1.png" },
  { id: "hp2", name: "Orange Potion", type: "hp", heal: 150, price: 80, img: "./assets/ui/potions/hp2.png" },
  { id: "hp3", name: "White Potion", type: "hp", heal: 300, price: 200, img: "./assets/ui/potions/hp3.png" },

  { id: "mp1", name: "Blue Potion", type: "mp", heal: 100, price: 40, img: "./assets/ui/potions/mp1.png" },
  { id: "mp2", name: "Mana Elixir", type: "mp", heal: 300, price: 120, img: "./assets/ui/potions/mp2.png" },
  { id: "mp3", name: "Sorcerer Elixir", type: "mp", heal: 600, price: 350, img: "./assets/ui/potions/mp3.png" },
];

const potionImgs = {};
for (const p of POTIONS) {
  const im = new Image();
  im.src = p.img;
  potionImgs[p.id] = im;
}



function nowMs() { return performance.now(); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randBetween(a, b) { return a + Math.random() * (b - a); }

function expNeededForLevel(lv) {
  return Math.floor(30 + (lv - 1) * 18 + (lv - 1) * (lv - 1) * 6);
}


function applyLevelStats() {
  // STR מעלה דמג'
  // STR raises damage: +1 damage per STR point
  player.damage = CONFIG.playerDamage + (player.str || 0) * 1;

  // VIT raises max HP: +6 HP per VIT point (changed from 3 -> 6)
  const oldMax = player.maxHP;
  player.maxHP = CONFIG.playerMaxHP + (player.vit || 0) * 6;

  // When max HP increases, heal proportionally up to the new max (do not reduce HP)
  if (player.maxHP > oldMax) {
    player.hp = Math.min(player.hp + (player.maxHP - oldMax), player.maxHP);
  } else {
    player.hp = Math.min(player.hp, player.maxHP);
  }
}


function gainExp(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;

  player.exp += amount;

  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;

    // מקבלים נקודות לחלוקה בכל רמה
    player.statPoints += 3;

    player.expToNext = expNeededForLevel(player.level);

    applyLevelStats();
    addError(`LEVEL UP! You are now level ${player.level} (+3 SP)`);
  }
}
function addSTR() {
  if (player.statPoints <= 0) return;
  player.statPoints -= 1;
  player.str += 1;
  applyLevelStats();
}

function addVIT() {
  if (player.statPoints <= 0) return;
  player.statPoints -= 1;
  player.vit += 1;
  applyLevelStats();
}
function updateDamageTexts(dt) {
  for (const d of damageTexts) {
    d.y -= 40 * dt;   // עולה למעלה
    d.life -= dt;     // מוריד זמן חיים
  }

  damageTexts = damageTexts.filter(d => d.life > 0);
}

function buyPotion(potionId) {
  const p = POTIONS.find(x => x.id === potionId);
  if (!p) return;

  if (playerMesos < p.price) {
    addError("Not enough Mesos!");
    return;
  }

  playerMesos -= p.price;
  inv[potionId] += 1;

  addError(`Bought ${p.name}`);
}


let statsOpen = false;

// ===== INVENTORY UI =====
let invOpen = false;

function setInvOpen(v) {
  invOpen = v;
  if (UI.invPanel) {
    UI.invPanel.style.display = invOpen ? "block" : "none";
  }

  // ✅ תוסיף את זה
  if (invOpen) updateInvPanelText();
}


function updateInvPanelText() {
  if (!UI.invInfo) return;
  UI.invInfo.innerHTML = `Mesos: <b>${playerMesos}</b>`;
}


function toggleInv() {
  setInvOpen(!invOpen);
}


function setStatsOpen(v) {
  statsOpen = v;
  if (UI.statsPanel) UI.statsPanel.style.display = statsOpen ? "block" : "none";
}

function toggleStats() {
  setStatsOpen(!statsOpen);
}

function updateStatsPanelText() {
  if (!UI.statsInfo) return;

  UI.statsInfo.innerHTML =
    `LV: <b>${player.level}</b><br>` +
    `HP: <b>${player.hp}/${player.maxHP}</b><br>` +
    `DMG: <b>${player.damage}</b><br>` +
    `EXP: <b>${Math.floor(player.exp)}/${player.expToNext}</b><br>` +
    `SP: <b>${player.statPoints}</b><br>` +
    `STR: <b>${player.str}</b> | VIT: <b>${player.vit}</b>`;
}


async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return await r.json();
}

async function fetchJsonFirstOk(urls) {
  let lastErr = null;
  for (const u of urls) {
    try { return await fetchJson(u); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

function addError(msg) {
  UI.errors.textContent = (UI.errors.textContent ? UI.errors.textContent + "\n" : "") + msg;
}

// ===== WORLD will be dynamically loaded from quests.json =====
let WORLD = {
  groundY: 465,
  platforms: [
    { x: 0, y: 465, w: 960, h: 75 },
    { x: 238, y: 215, w: 485, h: 18 },
    { x: 199, y: 293, w: 560, h: 18 },
    { x: 160, y: 370, w: 638, h: 18 }
  ],
};


function pickFirstVariant(framebooks, prefix) {
  const keys = Object.keys(framebooks || {});
  const variants = [];
  for (const k of keys) {
    const m = k.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) variants.push([Number(m[1]), k]);
  }
  variants.sort((a, b) => a[0] - b[0]);
  return variants.length ? variants[0][1] : null;
}

function chooseAnimNames(stats) {
  const fb = stats.framebooks || {};
  const keys = Object.keys(fb);

  const stand = fb.stand ? "stand" : (keys.includes("stand") ? "stand" : "stand");
  const move = fb.move ? "move" : (keys.includes("move") ? "move" : "move");

  const hit = pickFirstVariant(fb, "hit") || (fb.hit ? "hit" : "hit1");
  const die = pickFirstVariant(fb, "die") || (fb.die ? "die" : "die1");

  return { stand, move, hit, die };
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ ok: true, img, src });
    img.onerror = () => resolve({ ok: false, img: null, src });
    img.src = src;
  });
}
// ===== DAMAGE DIGITS (Maple-style) =====
const dmgDigits = {};

function loadDmgDigits() {
  for (let i = 0; i <= 9; i++) {
    const img = new Image();
    img.src = `./assets/ui/dmg/${i}.png`;
    dmgDigits[i] = img;
  }
}


const mobFrames = new Map();
const playerFrames = new Map();

// ===== MESOS (multi types + animated frames) =====
let mesos = [];
let playerMesos = 0;

// ===== POTION INVENTORY =====
const inv = {
  hp1: 0,
  hp2: 0,
  hp3: 0,
  mp1: 0,
  mp2: 0,
  mp3: 0,
};


const MESO_TYPES = [
  { name: "mesos1", min: 1, max: 49, frames: 4, w: 22, h: 22 },
  { name: "mesos2", min: 50, max: 199, frames: 4, w: 22, h: 22 },
  { name: "mesos3", min: 200, max: 600, frames: 4, w: 24, h: 24 },
  { name: "mesos4", min: 601, max: 2000, frames: 4, w: 30, h: 28 }, // bag
];

const mesoFrames = {};

function loadMesoFrames() {
  for (const type of MESO_TYPES) {
    mesoFrames[type.name] = [];
    for (let i = 1; i <= type.frames; i++) {
      const img = new Image();
      img.src = `./assets/ui/mesos/${type.name}_${i}.png`;
      mesoFrames[type.name].push(img);
    }
  }
}
function pickMesoTypeByValue(value) {
  for (const t of MESO_TYPES) {
    if (value >= t.min && value <= t.max) return t;
  }
  return MESO_TYPES[MESO_TYPES.length - 1];
}

function spawnMeso(x, y, minValue = 10, maxValue = 600) {
  const value = Math.floor(randBetween(minValue, maxValue + 1));
  const type = pickMesoTypeByValue(value);

  mesos.push({
    x,
    y,
    w: type.w,
    h: type.h,
    vx: randBetween(-60, 60),
    vy: randBetween(-240, -140),
    value,
    type: type.name,
    life: 20,
  });
}

function updateMesos(dt) {
  const pb = playerBox();

  for (let i = mesos.length - 1; i >= 0; i--) {
    const c = mesos[i];

    const prevY = c.y;

    // physics
    c.vy += CONFIG.gravity * 0.6 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // ===== collide with platforms (from above) =====
    if (c.vy >= 0) { // only when falling
      for (const p of WORLD.platforms.slice(1)) {
        const withinX = (c.x + c.w) > p.x && c.x < (p.x + p.w);

        const prevBottom = prevY + c.h;
        const nowBottom = c.y + c.h;

        const crossedTop = (prevBottom <= p.y) && (nowBottom >= p.y);

        if (withinX && crossedTop) {
          c.y = p.y - c.h;
          c.vy = 0;
          c.vx *= 0.85;
          break;
        }
      }
    }

    // ===== collide with ground =====
    if (c.y + c.h >= WORLD.groundY) {
      c.y = WORLD.groundY - c.h;
      c.vy = 0;
      c.vx *= 0.85;
    }

    // lifetime
    c.life -= dt;
    if (c.life <= 0) {
      mesos.splice(i, 1);
      continue;
    }

    // pickup (using player hitbox)
    if (intersects(pb, c)) {
      playerMesos += c.value;
      mesos.splice(i, 1);

      // ✅ update inventory text when picking up
      if (invOpen) updateInvPanelText();
    }
  }
}


function drawMesos() {
  const t = nowMs();

  for (const c of mesos) {
    const frames = mesoFrames[c.type];
    if (!frames || frames.length === 0) continue;

    const frameIndex = Math.floor((t / 1000) * 8) % frames.length;
    const img = frames[frameIndex];

    ctx.drawImage(
      img,
      c.x * scaleX,
      c.y * scaleY,
      c.w * scaleX,
      c.h * scaleY
    );
  }
}



async function probeFrameCount(mobId, anim, maxProbe = 80) {
  const frames = [];
  let foundAny = false;

  for (let i = 0; i < maxProbe; i++) {
    const r = await loadImage(PATHS.frame(mobId, anim, i));
    if (r.ok) {
      frames.push(r.img);
      foundAny = true;
    } else {
      // אם כבר מצאנו לפחות פריים אחד – עוצרים מיד
      if (foundAny) break;

      // אם עדיין לא מצאנו כלום, ננסה עוד קצת (למקרה שמתחיל מ-001)
      if (i >= 3) break;
    }
  }

  return frames;
}


async function probeFirstAvailable(mobId, candidates) {
  for (const anim of candidates) {
    const frames = await probeFrameCount(mobId, anim);
    if (frames.length) return { anim, frames };
  }
  return { anim: null, frames: [] };
}

function buildHitCandidates(stats) {
  const fb = stats.framebooks || {};
  const keys = Object.keys(fb);
  const fbHits = keys.filter(k => /^hit\d+$/.test(k)).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  const common = ["hit1", "hit", "hit2", "hit3", "hit4", "hit5"];
  const merged = [...fbHits, ...common];
  return Array.from(new Set(merged));
}

function buildDieCandidates(stats) {
  const fb = stats.framebooks || {};
  const keys = Object.keys(fb);
  const fbDies = keys.filter(k => /^die\d+$/.test(k)).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  const common = ["die1", "die", "die2", "die3", "die4", "die5"];
  const merged = [...fbDies, ...common];
  return Array.from(new Set(merged));
}

async function loadMobFrames(mobId, stats) {
  const missing = new Set();

  let standPick = await probeFirstAvailable(mobId, ["stand"]);
  if (!standPick.frames.length) {
    missing.add(`${mobId}/stand`);
    standPick = { anim: "stand", frames: [null] };
  }

  let movePick = await probeFirstAvailable(mobId, ["move"]);
  if (!movePick.frames.length) {
    movePick = { anim: "move", frames: standPick.frames };
  }

  const hitCandidates = buildHitCandidates(stats);
  let hitPick = await probeFirstAvailable(mobId, hitCandidates);
  if (!hitPick.frames.length) {
    hitPick = { anim: hitCandidates[0] || "hit1", frames: standPick.frames };
    missing.add(`${mobId}/hit*`);
  }

  const dieCandidates = buildDieCandidates(stats);
  let diePick = await probeFirstAvailable(mobId, dieCandidates);
  if (!diePick.frames.length) {
    diePick = { anim: dieCandidates[0] || "die1", frames: standPick.frames };
    missing.add(`${mobId}/die*`);
  }

  const names = {
    stand: standPick.anim || "stand",
    move: movePick.anim || "move",
    hit: hitPick.anim || "hit1",
    die: diePick.anim || "die1",
  };

  const animFrames = {};
  animFrames[names.stand] = standPick.frames;
  animFrames[names.move] = movePick.frames;
  animFrames[names.hit] = hitPick.frames;
  animFrames[names.die] = diePick.frames;

  mobFrames.set(Number(mobId), { names, animFrames });

  if (missing.size) addError(`Missing frames (some animations not found):\n- ` + Array.from(missing).join("\n- "));
}

function getMobFrame(mobId, state, tMs) {
  const pack = mobFrames.get(Number(mobId));
  if (!pack) return null;
  const { names, animFrames } = pack;

  const animName = state === "move" ? names.move
    : state === "hit" ? names.hit
      : state === "die" ? names.die
        : names.stand;

  const frames = animFrames[animName] || [];
  if (!frames.length) return null;

  const frameIdx = Math.floor((tMs / 1000) * CONFIG.fps) % frames.length;
  return frames[frameIdx] || null;
}
function getPlayerFrame(anim, tMs) {
  const frames = playerFrames.get(anim);
  if (!frames || frames.length === 0) return null;

  const idx = Math.floor((tMs / 1000) * CONFIG.fps) % frames.length;
  return frames[idx] ?? null;
}


let mobStatsMap = new Map();
let questsDb = null;
let questIndex = new Map();
let questState = null;
let mapsDb = {};
let currentMapName = "";



const keys = new Set();

const player = {
  x: 120,
  y: 0,
  w: 50,
  h: 70,
  facing: 1,

  anim: "stand",
  animUntil: 0,

  attackVariant: 0,

  vx: 0,
  vy: 0,
  onGround: false,
  onPlatform: null, // null = קרקע, או אובייקט פלטפורמה


  speed: CONFIG.playerSpeed,
  damage: CONFIG.playerDamage,
  exp: 0,

  level: 1,
  expToNext: 30,

  statPoints: 0,
  str: 0,
  vit: 0,


  lastAttackAt: 0,

  maxHP: CONFIG.playerMaxHP,
  hp: CONFIG.playerMaxHP,
  lastHurtAt: -999999,
};


let mobs = [];
let lastSpawnAt = 0;
let damageTexts = [];


function getMobStat(mobId, key, fallback) {
  const s = mobStatsMap.get(Number(mobId));
  if (!s) return fallback;
  const v = s[key];
  if (v === null || v === undefined || Number.isNaN(Number(v))) return fallback;
  return Number(v);
}

function computeMobSpeedPxPerSec(mobId) {
  const raw = getMobStat(mobId, "speed", 0);
  const factor = clamp(1 + (raw / 200), 0.6, 1.6);
  return CONFIG.mobBaseSpeedPxPerSec * factor;
}

function mobYOnPlatform(p, mobH = 60) {
  return p.y - mobH;
}

function spawnMob(mobId, x, platform = null) {
  const stats = mobStatsMap.get(Number(mobId));
  if (!stats) throw new Error(`Missing mob stats for id=${mobId}.`);

  const maxHP = getMobStat(mobId, "maxHP", 10);
  const exp = getMobStat(mobId, "exp", 0);

  const w = 20, h = 20;
  const y = platform ? mobYOnPlatform(platform, h) : (WORLD.groundY - h);

  return {
    id: Number(mobId),
    x, y,
    w, h,
    platform, // NEW
    maxHP, hp: maxHP,
    exp,
    state: "stand",
    stateUntil: 0,
    dead: false,
    dir: Math.random() < 0.5 ? -1 : 1,
    speed: computeMobSpeedPxPerSec(mobId),
    nextWanderSwitchAt: nowMs() + randBetween(CONFIG.mobWanderSwitchMsMin, CONFIG.mobWanderSwitchMsMax),
    aggroUntil: 0,

  };
}

function setMobState(m, state, durationMs) {
  m.state = state;
  m.stateUntil = nowMs() + durationMs;
}

function intersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
function playerBoxAt(x, y) {
  return {
    x: x + PLAYER_HITBOX.offsetX,
    y: y + PLAYER_HITBOX.offsetY,
    w: PLAYER_HITBOX.w,
    h: PLAYER_HITBOX.h,
  };
}

function playerBox() {
  return playerBoxAt(player.x, player.y);
}

function hurtPlayerFromMob(m) {
  const t = nowMs();

  if (t - player.lastHurtAt < CONFIG.touchDamageCooldownMs) return;

  const dmg = getMobStat(m.id, "damage", 1);
  player.hp = Math.max(0, player.hp - dmg);
  player.lastHurtAt = t;
}

function onMobKilled(mobId) {
  if (!questState || !questState.activeQuest) return;

  for (const req of questState.activeQuest.requirements) {
    if (req.type === "kill" && Number(req.mobId) === Number(mobId)) {
      const k = `kill:${req.mobId}`;
      questState.progress[k] = (questState.progress[k] ?? 0) + 1;
    }
  }

  if (isQuestCompleted(questState.activeQuest, questState.progress)) {
    completeQuest(questState.activeQuest);
  }
}

function tryAttack() {
  const t = nowMs();
  if (t - player.lastAttackAt < CONFIG.attackCooldownMs) return;
  player.lastAttackAt = t;

  const variants = ["attack1", "attack2", "attackF"];
  player.anim = variants[player.attackVariant];
  player.animUntil = t + 220;
  player.attackVariant = (player.attackVariant + 1) % variants.length;

  const atk = {
    x: player.facing === 1 ? player.x + player.w : player.x - 34,
    y: player.y + 10,
    w: 34,
    h: player.h - 20,
  };

  for (const m of mobs) {
    if (m.dead) continue;
    if (!intersects(atk, m)) continue;

    // לחשב דמג' אמיתי (לא יותר מהחיים שנותרו)
    const realDamage = Math.min(player.damage, m.hp);

    m.hp -= realDamage;

    // AGGRO: המוב ננעל על השחקן ל-2.5 שניות
    m.aggroUntil = nowMs() + 2500;

    // ===== KNOCKBACK =====
    const knockbackForce = 5;
    if (player.facing === 1) m.x += knockbackForce;
    else m.x -= knockbackForce;

    // למנוע יציאה מהגבולות של הפלטפורמה
    const p = m.platform || { x: 0, w: ORIGINAL_WIDTH };
    const minX = p.x;
    const maxX = p.x + p.w - m.w;
    m.x = Math.max(minX, Math.min(m.x, maxX));

    // ליצור טקסט דמג'
    damageTexts.push({
      x: m.x + m.w / 2,
      y: m.y,
      value: realDamage,
      life: 0.6,
    });

    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      setMobState(m, "die", CONFIG.dieStateMs);

      // ===== DROP MESOS =====
      const isBoss = currentMapName.startsWith("b");
      const dropX = m.x + m.w / 2;
      const dropY = m.y + m.h / 2;

      if (isBoss) {
        // שק לבוס (יעבור ל-mesos4 לפי הטווח)
        spawnMeso(dropX, dropY, 800, 2000);
      } else {
        // מוב רגיל
        spawnMeso(dropX, dropY, 10, 600);
      }

      gainExp(m.exp);
      onMobKilled(m.id);
    } else {
      setMobState(m, "hit", CONFIG.hitStateMs);
    }
  }
}

function buildQuestIndex(db) {
  const m = new Map();
  for (const q of db.quests) m.set(q.id, q);
  return m;
}

function initQuestState() {
  questIndex = buildQuestIndex(questsDb);

  questState = {
    activeQuestId: questsDb.startQuestId,
    activeQuest: questIndex.get(questsDb.startQuestId),
    completed: new Set(),
    progress: {},
  };

  if (!questState.activeQuest) throw new Error("Invalid startQuestId in quests.json");
}

function isQuestCompleted(quest, progress) {
  for (const req of quest.requirements) {
    if (req.type === "kill") {
      const k = `kill:${req.mobId}`;
      const cur = progress[k] ?? 0;
      if (cur < req.count) return false;
    }
  }
  return true;
}

async function loadMapForQuest(questId) {
  const quest = questIndex.get(questId);
  if (!quest || !quest.map) return;

  const mapKey = quest.map;
  const mapDef = mapsDb[mapKey];
  if (!mapDef) {
    addError(`Map not found: ${mapKey}`);
    return;
  }

  PATHS.mapBg = mapDef.bgPath;

  // Update WORLD with the map data from quests.json
  WORLD = {
    groundY: mapDef.groundY,
    platforms: mapDef.platforms,
  };

  // Store the current map name for boss detection
  currentMapName = mapKey;

  // Reload the map image
  const bg = await loadImage(PATHS.mapBg);
  if (bg.ok) mapBgImg = bg.img;
  else addError("Failed to load map: " + PATHS.mapBg);
}

async function completeQuest(quest) {
  questState.completed.add(quest.id);

  if (quest.rewards && typeof quest.rewards.exp === "number") {
    player.exp += quest.rewards.exp;
  }

  const next = (quest.unlocks && quest.unlocks.length > 0) ? quest.unlocks[0] : null;
  if (next && questIndex.has(next)) {
    questState.activeQuestId = next;
    questState.activeQuest = questIndex.get(next);
    questState.progress = {};
  } else {
    questState.activeQuestId = null;
    questState.activeQuest = null;
  }

  // Load the appropriate map for the active quest
  if (questState.activeQuestId) {
    await loadMapForQuest(questState.activeQuestId);

    // For qBoss quests, place player on ground platform
    if (questState.activeQuestId.startsWith("qBoss")) {
      const groundPlatform = WORLD.platforms[0];
      player.y = groundPlatform.y - PLAYER_HITBOX.offsetY - PLAYER_HITBOX.h;
    } else {
      // For normal quests, place on the third floating platform
      const thirdPlatform = WORLD.platforms[3];
      player.y = thirdPlatform.y - PLAYER_HITBOX.offsetY - PLAYER_HITBOX.h;
    }
    player.vy = 0;
    player.onGround = true;



  }

  await refreshNeededAssets();

}

function getQuestTargetMobIds() {
  const q = questState.activeQuest;
  if (!q) return [];
  const ids = [];
  for (const req of q.requirements) {
    if (req.type === "kill") ids.push(Number(req.mobId));
  }
  return ids;
}

function renderQuestUI() {
  const q = questState.activeQuest;

  if (!q) {
    UI.questTitle.textContent = "All quests completed!";
    UI.questDesc.textContent = "You finished the quest chain.";
    UI.questProgress.textContent = "";
    UI.playerStats.textContent = `HP: ${player.hp}/${player.maxHP} | EXP: ${player.exp} | Damage: ${player.damage} | Mobs: ${mobs.length}`;
    return;
  }

  UI.questTitle.textContent = `${q.title}: ${q.description}`;
  UI.questDesc.textContent = "";

  const lines = [];
  for (const req of q.requirements) {
    if (req.type === "kill") {
      const mobId = Number(req.mobId);
      const mobName = mobStatsMap.get(mobId)?.name ?? String(mobId);
      const k = `kill:${mobId}`;
      const cur = questState.progress[k] ?? 0;
      lines.push(`Kill ${req.count} x ${mobName} (${mobId}) : ${cur}/${req.count}`);
    }
  }

  UI.questProgress.textContent = lines.join(" | ");
  UI.playerStats.textContent = `HP: ${player.hp}/${player.maxHP} | EXP: ${player.exp} | Damage: ${player.damage} | Mobs: ${mobs.length}`;
}

async function refreshNeededAssets() {
  UI.errors.textContent = "";

  const needed = new Set(getQuestTargetMobIds());
  const tasks = [];

  for (const id of needed) {
    const st = mobStatsMap.get(Number(id));
    if (!st) {
      addError(`Missing stats for mob ${id}.`);
      continue;
    }
    if (!mobFrames.has(Number(id))) {
      tasks.push(loadMobFrames(id, st));
    }
  }
  await Promise.all(tasks);

  mobs = [];
  lastSpawnAt = 0;

  const targets = getQuestTargetMobIds();
  if (targets.length) {
    const id = targets[0];

    // For qBoss quests, only spawn 1 mob at ground platform
    if (questState.activeQuestId && questState.activeQuestId.startsWith("qBoss")) {
      const groundPlatform = WORLD.platforms[0]; // ground platform
      const x = groundPlatform.x + 100 + Math.random() * (groundPlatform.w - 200);
      mobs.push(spawnMob(id, x, groundPlatform));
    } else {
      // Normal quest spawning
      const plats = WORLD.platforms.slice(1);
      for (let i = 0; i < 10; i++) {
        const p = plats[i % plats.length];
        const x = p.x + 30 + Math.random() * (p.w - 90);
        mobs.push(spawnMob(id, x, p));
      }
      for (let i = 0; i < 3; i++) {
        const x = 30 + Math.random() * (canvas.width - 60);
        mobs.push(spawnMob(id, x, null));
      }
    }
  }

}

// ===== NEW: Jump =====
function tryJump() {
  if (!player.onGround) return;
  player.vy = -CONFIG.jumpVel;
  player.onGround = false;
}

function updatePlayer(dt) {
  // ===== INPUT =====
  let vx = 0;
  if (keys.has("ArrowLeft")) {
    vx = -player.speed;
    player.facing = -1;
  }
  if (keys.has("ArrowRight")) {
    vx = player.speed;
    player.facing = 1;
  }
  player.vx = vx;

  const prevX = player.x;
  const prevY = player.y;
  const prevPB = playerBoxAt(prevX, prevY);

  // ===== PHYSICS =====
  player.x += player.vx * dt;
  player.vy += CONFIG.gravity * dt;
  player.y += player.vy * dt;

  // screen bounds
  player.x = clamp(player.x, 0, ORIGINAL_WIDTH - player.w);

  player.onGround = false;
  player.onPlatform = undefined; // undefined = באוויר

  // ===== PLATFORM COLLISION (swept feet test) =====
  for (const p of WORLD.platforms.slice(1)) {
    const pbNow = playerBox();
    const isFalling = player.vy > 0;

    const withinX =
      (pbNow.x + pbNow.w) > p.x &&
      pbNow.x < (p.x + p.w);

    const prevFeet = prevPB.y + prevPB.h;
    const nowFeet = pbNow.y + pbNow.h;

    // Crossed platform line from above going down
    const crossedTop = (prevFeet <= p.y) && (nowFeet >= p.y);

    // Check if feet are touching platform surface
    const feetOnPlatform = withinX && (nowFeet >= p.y && nowFeet <= p.y + 5);

    if (withinX && isFalling && crossedTop) {
      // Landing on platform from above
      player.y = (p.y - pbNow.h) - PLAYER_HITBOX.offsetY + PLAYER_HITBOX.footPad;
      player.vy = 0;
      player.onGround = true;
      player.onPlatform = p;
      break;
    }

    // Keep player on platform if feet are touching it and not jumping up
    if (feetOnPlatform && player.vy >= -10) { // allow small upward velocity tolerance
      // Snap player to platform surface
      const pbAdjusted = playerBoxAt(player.x, player.y);
      player.y = (p.y - pbAdjusted.h) - PLAYER_HITBOX.offsetY + PLAYER_HITBOX.footPad;
      player.vy = 0;
      player.onGround = true;
      player.onPlatform = p;
      break;
    }
  }

  // ===== GROUND COLLISION (only if not on platform) =====
  if (!player.onGround) {
    const pb = playerBox();
    if (pb.y + pb.h >= WORLD.groundY) {
      player.y = (WORLD.groundY - pb.h) - PLAYER_HITBOX.offsetY;
      player.vy = 0;
      player.onGround = true;
      player.onPlatform = null
    }
  }
}


// ===== UPDATED: Mobs move on their platform and flip direction =====
function updateMobs(dt) {
  const t = nowMs();

  for (const m of mobs) {
    if (m.dead) continue;

    if (m.state === "hit" && t < m.stateUntil) continue;

    const aggroActive = t < (m.aggroUntil || 0);

    let dx = 0;

    if (aggroActive && m.platform === player.onPlatform) {
      // ===== CHASE PLAYER (AGGRO) =====
      const dxToPlayer = (player.x + player.w / 2) - (m.x + m.w / 2);
      m.dir = dxToPlayer >= 0 ? 1 : -1;

      dx = m.dir * m.speed * 1.25 * dt; // קצת יותר מהר כשהוא אגרסיבי
      m.x += dx;

    } else {
      // ===== WANDER =====
      if (t >= m.nextWanderSwitchAt) {
        m.dir = Math.random() < 0.5 ? -1 : 1;
        m.nextWanderSwitchAt =
          t + randBetween(CONFIG.mobWanderSwitchMsMin, CONFIG.mobWanderSwitchMsMax);
      }

      dx = m.dir * m.speed * dt;
      m.x += dx;
    }

    // ===== PLATFORM BOUNDS =====
    const p = m.platform || { x: 0, w: ORIGINAL_WIDTH };
    const minX = p.x;
    const maxX = p.x + p.w - m.w;

    if (m.x < minX) { m.x = minX; m.dir = 1; }
    if (m.x > maxX) { m.x = maxX; m.dir = -1; }
    m.x = Math.max(minX, Math.min(m.x, maxX));

    // keep y glued to platform top
    m.y = mobYOnPlatform(p, m.h);

    // state based on movement
    m.state = Math.abs(dx) > 0.01 ? "move" : "stand";
  }

  mobs = mobs.filter(m => !(m.dead && m.state === "die" && nowMs() >= m.stateUntil));
}


function checkPlayerMobCollisions() {
  if (player.hp <= 0) return;

  for (const m of mobs) {
    if (m.dead) continue;
    if (intersects(player, m)) {
      hurtPlayerFromMob(m);
    }
  }
}

function spawnLogic() {
  const targets = getQuestTargetMobIds();
  if (!targets.length) return;

  const t = nowMs();
  if (t - lastSpawnAt < CONFIG.spawnIntervalMs) return;
  lastSpawnAt = t;

  const aliveCount = mobs.filter(m => !m.dead && m.state !== "die").length;


  // For qBoss quests, only allow 1 mob and spawn at ground platform
  if (questState.activeQuestId && questState.activeQuestId.startsWith("qBoss")) {
    if (aliveCount >= 1) return;

    const id = targets[0];
    const groundPlatform = WORLD.platforms[0]; // ground platform
    const x = groundPlatform.x + 100 + Math.random() * (groundPlatform.w - 200);
    mobs.push(spawnMob(id, x, groundPlatform));
  } else {
    // Normal quest spawning
    if (aliveCount >= CONFIG.spawnMaxOnScreen) return;

    const id = targets[0];
    const plats = WORLD.platforms.slice(1);
    const p = plats[Math.floor(Math.random() * plats.length)];
    const x = p.x + 10 + Math.random() * (p.w - 80);

    mobs.push(spawnMob(id, x, p));
  }
}

function drawFlipped(img, x, y, w, h) {
  ctx.save();
  ctx.translate(x + w / 2, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, y, w, h);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mapBgImg) {
    ctx.drawImage(mapBgImg, 0, 0, canvas.width, canvas.height);
  }

  // time once per frame
  const t = nowMs();

  // ===== PLAYER DRAW (image) =====
  let anim = "stand";
  if (t < player.animUntil) anim = player.anim;
  else if (!player.onGround) anim = "jump";
  else if (Math.abs(player.vx) > 1) anim = "walk";

  const pImg = getPlayerFrame(anim, t);

  const pbox = playerBox();
  const feetY = pbox.y + pbox.h;
  const drawY = feetY - player.h;

  const sx = player.x * scaleX;
  const sy = drawY * scaleY;
  const sw = player.w * scaleX;
  const sh = player.h * scaleY;

  if (pImg) {
    if (player.facing === -1) ctx.drawImage(pImg, sx, sy, sw, sh);
    else drawFlipped(pImg, sx, sy, sw, sh);
  } else {
    ctx.fillStyle = "magenta";
    ctx.fillRect(sx, sy, sw, sh);
  }

  // player HP bar (above head)
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(player.x * scaleX, (player.y - 12) * scaleY, player.w * scaleX, 6 * scaleY);
  ctx.fillStyle = "rgba(0,255,0,0.7)";
  ctx.fillRect(
    player.x * scaleX,
    (player.y - 12) * scaleY,
    (player.w * (player.hp / Math.max(1, player.maxHP))) * scaleX,
    6 * scaleY
  );

  // ===== EXP BAR (bottom-left) =====
  const expBarW = 260 * scaleX;
  const expBarH = 10 * scaleY;
  const expBx = 12 * scaleX;
  const expBy = (ORIGINAL_HEIGHT - 20) * scaleY;

  const ratio = player.expToNext > 0 ? (player.exp / player.expToNext) : 0;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(expBx, expBy, expBarW, expBarH);

  ctx.fillStyle = "rgba(0,160,255,0.85)";
  ctx.fillRect(expBx, expBy, expBarW * clamp(ratio, 0, 1), expBarH);

  ctx.fillStyle = "white";
  ctx.font = `${14 * scaleY}px Arial`;
  ctx.fillText(
    `LV ${player.level}  EXP ${Math.floor(player.exp)}/${player.expToNext}`,
    expBx,
    expBy - 4 * scaleY
  );

  // ===== NPC DRAW =====
  const npcScale = 0.65;

  const baseW = shopNpc.w * scaleX;
  const baseH = shopNpc.h * scaleY;

  const nw = baseW * npcScale;
  const nh = baseH * npcScale;

  const nx = shopNpc.x * scaleX;
  const ny = shopNpc.y * scaleY + (baseH - nh);

  if (shopNpcImg.complete && shopNpcImg.naturalWidth > 0) {
    ctx.drawImage(shopNpcImg, nx, ny, nw, nh);
  } else {
    ctx.fillStyle = "#00ccff";
    ctx.fillRect(nx, ny, nw, nh);
  }

  // ===== MOBS DRAW =====
  for (const m of mobs) {
    const img = getMobFrame(m.id, m.state, t);

    const isBoss = currentMapName.startsWith("b");
    const scale = isBoss ? 5 : 1;

    const mx = m.x * scaleX;
    const my = m.y * scaleY;
    const mw = m.w * scaleX * scale;
    const mh = m.h * scaleY * scale;

    const offsetX = isBoss ? (mw - m.w * scaleX) / 2 : 0;
    const offsetY = isBoss ? (mh - m.h * scaleY) : 0;

    if (img) {
      if (m.dir === 1) drawFlipped(img, mx - offsetX, my - offsetY, mw, mh);
      else ctx.drawImage(img, mx - offsetX, my - offsetY, mw, mh);
    } else {
      ctx.fillStyle = "#ff6";
      ctx.fillRect(mx - offsetX, my - offsetY, mw, mh);
    }

    const hpBarY = (m.y - 15) * scaleY - (isBoss ? mh - m.h * scaleY : 0);
    const hpBarW = mw;
    const hpBarH = isBoss ? 10 * scaleY : 6 * scaleY;

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(mx - offsetX, hpBarY, hpBarW, hpBarH);
    ctx.fillStyle = isBoss ? "rgba(255,100,0,0.9)" : "rgba(255,0,0,0.7)";
    ctx.fillRect(mx - offsetX, hpBarY, hpBarW * (m.hp / m.maxHP), hpBarH);
  }

  // mesos
  drawMesos();

  // mesos count (debug)
  ctx.fillStyle = "white";
  ctx.font = `${18 * scaleY}px Arial`;
  ctx.fillText(`Mesos: ${playerMesos}`, 12 * scaleX, 52 * scaleY);

  // ===== DAMAGE TEXTS =====
  for (const d of damageTexts) {
    const alpha = Math.max(d.life, 0);
    ctx.globalAlpha = alpha;

    const valueStr = String(Math.floor(d.value));

    const digitW = 18 * scaleX;
    const digitH = 24 * scaleY;

    const totalW = valueStr.length * digitW;
    let drawX = d.x * scaleX - totalW / 2;
    const drawYY = d.y * scaleY;

    for (const ch of valueStr) {
      const img = dmgDigits[ch];
      if (img) ctx.drawImage(img, drawX, drawYY, digitW, digitH);
      drawX += digitW;
    }

    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "start";

  // ===== SHOP UI (ONLY IF OPEN) =====
  if (shopOpen) {
    const SHOP_SCALE = 0.55;        // קטן יותר (תשנה ל-0.5/0.6 לפי טעם)
    const SHOP_ANCHOR = "rightMid"; // center / rightMid / rightBottom

    const shopBaseW = 780 * scaleX;
    const shopBaseH = 520 * scaleY;

    const imgW = shopBaseW * SHOP_SCALE;
    const imgH = shopBaseH * SHOP_SCALE;

    let shopBx, shopBy;

    if (SHOP_ANCHOR === "center") {
      shopBx = canvas.width / 2 - imgW / 2;
      shopBy = canvas.height / 2 - imgH / 2;
    } else if (SHOP_ANCHOR === "rightBottom") {
      shopBx = canvas.width - imgW - 20 * scaleX;
      shopBy = canvas.height - imgH - 20 * scaleY;
    } else { // rightMid
      shopBx = canvas.width - imgW - 20 * scaleX;
      shopBy = canvas.height / 2 - imgH / 2;
    }

    lastShopRect = { x: shopBx, y: shopBy, w: imgW, h: imgH };

    const bg = shopUiImgs[shopTab];
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, shopBx, shopBy, imgW, imgH);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(shopBx, shopBy, imgW, imgH);
    }

    shopItemRects = [];

    // show potions list ONLY on USE tab (shop2)
    if (shopTab === 2) {
      const listX = shopBx + imgW * 0.08;
      const listY = shopBy + imgH * 0.34;
      const rowH = imgH * 0.09;

      const items = [
        ["1", "hp1"], ["2", "hp2"], ["3", "hp3"],
        ["4", "mp1"], ["5", "mp2"], ["6", "mp3"],
      ];

      ctx.font = `${16 * scaleY}px Arial`;

      for (let i = 0; i < items.length; i++) {
        const id = items[i][1];
        const p = POTIONS.find(x => x.id === id);
        if (!p) continue;

        const y = listY + i * rowH;

        shopItemRects.push({
          id,
          x: listX,
          y: y - rowH * 0.65,
          w: imgW * 0.84,
          h: rowH * 0.9,
        });

        const icon = potionImgs[id];
        const iw = 26 * scaleX, ih = 26 * scaleY;
        if (icon && icon.complete && icon.naturalWidth > 0) {
          ctx.drawImage(icon, listX, y - ih * 0.7, iw, ih);
        }

        const owned = inv[id] ?? 0;

        ctx.fillStyle = "white";
        ctx.fillText(`${p.name}`, listX + 40 * scaleX, y);

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText(`+${p.heal} ${p.type.toUpperCase()}`, listX + 260 * scaleX, y);

        ctx.fillStyle = "rgba(255,215,0,0.95)";
        ctx.fillText(`${p.price}`, listX + 460 * scaleX, y);

        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText(`x${owned}`, listX + 540 * scaleX, y);
      }
    }
  }

  // quest UI always last
  renderQuestUI();
}




let lastFrameAt = nowMs();
function loop() {
  const t = nowMs();
  const dt = Math.min(0.033, (t - lastFrameAt) / 1000);
  lastFrameAt = t;

  updatePlayer(dt);
  updateMobs(dt);
  updateDamageTexts(dt);
  updateMesos(dt);
  checkPlayerMobCollisions();
  spawnLogic();
  render();



  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") e.preventDefault();
  keys.add(e.code);

  if (e.code === "ArrowUp") tryJump();
  if (e.code === "Space") tryAttack();
  if (e.code === "KeyI") toggleInv();

  // ===== SHOP SYSTEM =====

  if (e.code === "KeyE") {
    if (intersects(player, shopNpc)) {
      shopOpen = !shopOpen;
      if (shopOpen) shopTab = 1;
    }
  }


  // Buy potions when shop is open
  if (shopOpen) {
    if (e.code === "Digit1") buyPotion("hp1");
    if (e.code === "Digit2") buyPotion("hp2");
    if (e.code === "Digit3") buyPotion("hp3");

    if (e.code === "Digit4") buyPotion("mp1");
    if (e.code === "Digit5") buyPotion("mp2");
    if (e.code === "Digit6") buyPotion("mp3");

    if (e.code === "Escape") shopOpen = false;
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

canvas.addEventListener("mousedown", (e) => {
  if (!shopOpen || !lastShopRect) return;

  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const my = (e.clientY - r.top) * (canvas.height / r.height);

  // Click outside shop => close
  if (
    mx < lastShopRect.x || mx > lastShopRect.x + lastShopRect.w ||
    my < lastShopRect.y || my > lastShopRect.y + lastShopRect.h
  ) {
    shopOpen = false;
    return;
  }

  // 1) Tabs switching (click top buttons)
  for (const hb of SHOP_TAB_HITBOX) {
    const x = lastShopRect.x + lastShopRect.w * hb.x;
    const y = lastShopRect.y + lastShopRect.h * hb.y;
    const w = lastShopRect.w * hb.w;
    const h = lastShopRect.h * hb.h;

    if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
      shopTab = hb.tab;
      return;
    }
  }

  // 2) Buy potion by clicking a row (only in USE tab)
  if (shopTab === 2) {
    for (const it of shopItemRects) {
      if (
        mx >= it.x && mx <= it.x + it.w &&
        my >= it.y && my <= it.y + it.h
      ) {
        buyPotion(it.id);
        return;
      }
    }
  }
});


async function boot() {
  const statsList = await fetchJsonFirstOk([
    PATHS.statsPrimary,
    PATHS.statsFallback,
    "/stats/mobs_stats.json",
  ]);
  mobStatsMap = new Map(statsList.map(x => [Number(x.id), x]));

  questsDb = await fetchJson(PATHS.quests);

  // Load maps from quests.json
  mapsDb = questsDb.maps || {};

  initQuestState();
  player.expToNext = expNeededForLevel(player.level);
  applyLevelStats();

  // Load the map for the initial quest
  if (questState.activeQuestId) {
    await loadMapForQuest(questState.activeQuestId);
  }
  // === PLACE NPC AFTER MAP LOAD ===
  shopNpc.y = WORLD.groundY - shopNpc.h - 20;



  // place player on third platform (not flying)
  // Feet should be at platform.y, so: player.y + offsetY + hitbox.h = platform.y
  const thirdPlatform = WORLD.platforms[3];
  player.y = thirdPlatform.y - PLAYER_HITBOX.offsetY - PLAYER_HITBOX.h;
  player.vy = 0;
  player.onGround = true;

  // load mobs frames needed for current quest
  await refreshNeededAssets();

  // load player frames (must match your filenames)
  playerFrames.set("stand", await loadPlayerFrames("stand"));
  playerFrames.set("walk", await loadPlayerFrames("walk"));
  playerFrames.set("jump", await loadPlayerFrames("jump"));
  playerFrames.set("attack1", await loadPlayerFrames("attack1"));
  playerFrames.set("attack2", await loadPlayerFrames("attack2"));
  playerFrames.set("attackF", await loadPlayerFrames("attackF"));
  playerFrames.set("climbRope", await loadPlayerFrames("climbRope"));
  playerFrames.set("climbLadder", await loadPlayerFrames("climbLadder"));

  console.log("PLAYER FRAMES LOADED:", {
    stand: playerFrames.get("stand")?.length ?? 0,
    walk: playerFrames.get("walk")?.length ?? 0,
    jump: playerFrames.get("jump")?.length ?? 0,
    attack1: playerFrames.get("attack1")?.length ?? 0,
    attack2: playerFrames.get("attack2")?.length ?? 0,
    attackF: playerFrames.get("attackF")?.length ?? 0,
    climbRope: playerFrames.get("climbRope")?.length ?? 0,
    climbLadder: playerFrames.get("climbLadder")?.length ?? 0,
  });


  // OPTIONAL DEBUG: show if something failed to load
  for (const k of ["stand", "walk", "jump", "attack1", "attack2", "attackF", "climbRope", "climbLadder"]) {
    const n = playerFrames.get(k)?.length ?? 0;
    if (!n) addError(`PLAYER FRAMES MISSING: ${k}`);
  }

  // ===== STATS UI EVENTS =====
  UI.statsBtn?.addEventListener("click", () => {
    UI.statsPanel.style.display =
      UI.statsPanel.style.display === "block" ? "none" : "block";
  });

  // ✅ INVENTORY BUTTON EVENT
  UI.invBtn?.addEventListener("click", toggleInv);


  UI.btnAddSTR?.addEventListener("click", () => {
    addSTR();
    updateStatsPanelText();
  });

  UI.btnAddVIT?.addEventListener("click", () => {
    addVIT();
    updateStatsPanelText();
  });

  // עדכון ראשוני
  updateStatsPanelText();
  loadDmgDigits();
  loadMesoFrames();



  requestAnimationFrame(loop);
}


boot().catch(err => {
  console.error(err);
  addError(String(err));
  UI.questTitle.textContent = "Failed to load";
  UI.questDesc.textContent = "Check missing paths, stats file, or missing frames in assets.";
  UI.questProgress.textContent = "";
});
