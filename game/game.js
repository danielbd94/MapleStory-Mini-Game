const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

// ===== Audio =====
const BGM_MP3 = "./assets/sounds/perion.mp3";
const STUMP_HIT_MP3 = "./assets/sounds/stump.mp3";
const POTION_USE_MP3 = "./assets/sounds/potion.mp3";

const bgmAudio = new Audio(BGM_MP3);
bgmAudio.loop = true;
bgmAudio.volume = 0.42;
bgmAudio.preload = "auto";
let bgmStarted = false;

const stumpHitAudio = new Audio(STUMP_HIT_MP3);
stumpHitAudio.volume = 0.8;
stumpHitAudio.preload = "auto";
let lastStumpHitSfxAt = 0;
const STUMP_HIT_SFX_COOLDOWN_MS = 120;

const potionUseAudio = new Audio(POTION_USE_MP3);
potionUseAudio.volume = 0.6;
potionUseAudio.preload = "auto";

function ensureBgmStarted() {
  if (bgmStarted) return;
  // Only mark started after play succeeds; otherwise retries (e.g. autoplay) keep working.
  bgmAudio.play()
    .then(() => { bgmStarted = true; })
    .catch(() => {});
}

function playStumpHitSfx() {
  const t = performance.now();
  if (t - lastStumpHitSfxAt < STUMP_HIT_SFX_COOLDOWN_MS) return;
  lastStumpHitSfxAt = t;
  stumpHitAudio.currentTime = 0;
  stumpHitAudio.play().catch(() => {});
}

window.addEventListener("pointerdown", ensureBgmStarted, { passive: true });

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
  questPanel: document.getElementById("questPanel"),
  questClose: document.getElementById("questClose"),
  questTitle: document.getElementById("questTitle"),
  questDesc: document.getElementById("questDesc"),
  questProgress: document.getElementById("questProgress"),
  playerStats: document.getElementById("playerStats"),
  errors: document.getElementById("errors"),
  saveStatus: document.getElementById("saveStatus"),

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
  invClose: document.getElementById("invClose"),
  invInfo: document.getElementById("invInfo"),

  // ===== CHAT =====
  chatPanel: document.getElementById("chatPanel"),
  chatHeader: document.getElementById("chatHeader"),
  chatExpandBtn: document.getElementById("chatExpandBtn"),
  chatMessages: document.getElementById("chatMessages"),
  chatInputRow: document.getElementById("chatInputRow"),
  chatInput: document.getElementById("chatInput"),
  chatSendBtn: document.getElementById("chatSendBtn"),

  // ===== TOP-RIGHT MENU =====
  gameMenu: document.getElementById("gameMenu"),
  menuToggle: document.getElementById("menuToggle"),
  menuDropdown: document.getElementById("menuDropdown"),
  questBtn: document.getElementById("questBtn"),

  // ===== LOGIN =====
  loginScreen: document.getElementById("loginScreen"),
  loginUser: document.getElementById("loginUser"),
  loginEmail: document.getElementById("loginEmail"),
  loginPass: document.getElementById("loginPass"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  loginMsg: document.getElementById("loginMsg"),

  // ===== SAVE / LOGOUT =====
  saveBtn: document.getElementById("saveBtn"),
  logoutBtn: document.getElementById("logoutBtn"),

  // ===== DEATH =====
  deathOverlay: document.getElementById("deathOverlay"),
  respawnBtn: document.getElementById("respawnBtn"),
};


const CONFIG = {
  groundY: 465,

  playerSpeed: 240,
  playerDamage: 2,
  // Multiplier applied to STR scaling for stronger early-game hits.
  damageMultiplier: 3,
  attackCooldownMs: 220,

  // NEW: physics
  gravity: 1600,
  jumpVel: 620,

  spawnMaxOnScreen: 20,
  spawnIntervalMs: 350,

  mobBaseSpeedPxPerSec: 40,
  mobWanderSwitchMsMin: 800,
  mobWanderSwitchMsMax: 2200,

  fps: 10,
  // Idle/standing animation speed (player only).
  // Lower this so the "stand" frames don't cycle too fast.
  standFps: 4,
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
/** Screen-space hit rect for the shop close control (set while shop is drawn). */
let shopCloseHit = null;
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
const SHOP_TAB_HITBOX = [
  { tab: 1, x: 0.530, y: 0.240, w: 0.080, h: 0.065 }, // EQUIP
  { tab: 2, x: 0.615, y: 0.240, w: 0.075, h: 0.065 }, // USE
  { tab: 3, x: 0.695, y: 0.240, w: 0.065, h: 0.065 }, // ETC
  { tab: 4, x: 0.765, y: 0.240, w: 0.080, h: 0.065 }, // SET-UP
  { tab: 5, x: 0.850, y: 0.240, w: 0.075, h: 0.065 }, // CASH
];

// item clickable rects (filled every render)
let shopItemRects = [];

// mouse hover tracking for shop tooltip
let shopMouseX = 0, shopMouseY = 0;
let shopHoverId = null;

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  shopMouseX = (e.clientX - r.left) * (canvas.width / r.width);
  shopMouseY = (e.clientY - r.top) * (canvas.height / r.height);

  // detect which shop item row is hovered
  shopHoverId = null;
  if (shopOpen && shopTab === 2) {
    for (const it of shopItemRects) {
      if (shopMouseX >= it.x && shopMouseX <= it.x + it.w &&
          shopMouseY >= it.y && shopMouseY <= it.y + it.h) {
        shopHoverId = it.id;
        break;
      }
    }
  }
});


// ===== POTION SHOP DATA =====
const POTIONS = [
  { id: "hp1", name: "Red Potion", type: "hp", heal: 50, price: 25, img: "./assets/ui/potions/hp3.png" },
  { id: "hp2", name: "Orange Potion", type: "hp", heal: 150, price: 80, img: "./assets/ui/potions/hp2.png" },
  { id: "hp3", name: "White Potion", type: "hp", heal: 300, price: 200, img: "./assets/ui/potions/hp1.png" },

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

// Stub for applyClassBase — class system not yet active
function applyClassBase(p, classKey) {
  p.class = classKey || "warrior";
}


function applyLevelStats() {
  // STR מעלה דמג'
  // STR raises damage: +1 damage per STR point
  player.damage = (CONFIG.playerDamage + (player.str || 0) * 1) * (CONFIG.damageMultiplier ?? 1);

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
    // Show in chat log instead of the top error box.
    if (!chatExpanded) setChatExpanded(true);
    addChatSystemLine("Not enough Mesos!", "#ffcc66");
    return;
  }

  playerMesos -= p.price;
  inv[potionId] += 1;

  addError(`Bought ${p.name}`);
  updateInvPanelText();
}

function usePotion(potionId) {
  const p = POTIONS.find(x => x.id === potionId);
  if (!p) return;
  if ((inv[potionId] ?? 0) <= 0) {
    addError(`No ${p.name} left!`);
    return;
  }
  if (player.hp <= 0) return; // can't use when dead

  inv[potionId] -= 1;

  potionUseAudio.currentTime = 0;
  potionUseAudio.play().catch(() => {});

  if (p.type === "hp") {
    const before = player.hp;
    player.hp = Math.min(player.hp + p.heal, player.maxHP);
    const healed = player.hp - before;
  } else if (p.type === "mp") {
    const before = player.mp;
    player.mp = Math.min(player.mp + p.heal, player.maxMP);
    const healed = player.mp - before;
  }

  updateInvPanelText();
  updateStatsPanelText();
}


let statsOpen = false;

// ===== INVENTORY UI =====
let invOpen = false;

let questOpen = false;

function setQuestOpen(v) {
  questOpen = !!v;
  if (UI.questPanel) UI.questPanel.style.display = questOpen ? "block" : "none";
}

/** One of stats / inventory / quest can be open at a time (menu + hotkeys). */
function toggleStatsPanel() {
  const next = !statsOpen;
  setStatsOpen(next);
  if (next) {
    setInvOpen(false);
    setQuestOpen(false);
  }
}

function toggleInvPanel() {
  const next = !invOpen;
  setInvOpen(next);
  if (next) {
    setStatsOpen(false);
    setQuestOpen(false);
    updateInvPanelText();
  }
}

function toggleQuestPanel() {
  const next = !questOpen;
  setQuestOpen(next);
  if (next) {
    setStatsOpen(false);
    setInvOpen(false);
  }
}

function setInvOpen(v) {
  invOpen = v;
  if (UI.invPanel) {
    UI.invPanel.style.display = invOpen ? "block" : "none";
  }

  if (invOpen) updateInvPanelText();
}


function updateInvPanelText() {
  if (!UI.invInfo) return;
  UI.invInfo.innerHTML = `Mesos: <b>${playerMesos}</b>`;

  // Build potion rows
  const container = document.getElementById("invPotions");
  if (!container) return;

  let html = "";
  for (const p of POTIONS) {
    const qty = inv[p.id] ?? 0;
    const typeClass = p.type === "mp" ? "mp" : "";
    html += `<div class="inv-potion-row">`;
    html += `  <img src="${p.img}" alt="${p.name}">`;
    html += `  <span class="inv-potion-name">${p.name}<br><small style="opacity:0.5">+${p.heal} ${p.type.toUpperCase()}</small></span>`;
    html += `  <span class="inv-potion-qty">x${qty}</span>`;
    html += `  <button class="inv-use-btn ${typeClass}" onclick="usePotion('${p.id}')" ${qty <= 0 ? 'disabled' : ''}>Use</button>`;
    html += `</div>`;
  }
  container.innerHTML = html;
}


function setStatsOpen(v) {
  statsOpen = v;
  if (UI.statsPanel) UI.statsPanel.style.display = statsOpen ? "block" : "none";
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
let playerMesos = 50000;

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

  // Use a slower frame rate for idle to avoid "fast standing" visuals.
  const fps = anim === "stand" ? (CONFIG.standFps ?? CONFIG.fps) : CONFIG.fps;
  const idx = Math.floor((tMs / 1000) * fps) % frames.length;
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

// ═══════════════════════════════════════════════════════
// ===== AUTH & SAVE/LOAD SYSTEM =====
// ═══════════════════════════════════════════════════════
const API_BASE = "/api";
let authToken = localStorage.getItem("maple_token") || null;
let currentUsername = null;

// ── Auto-save interval (every 60 seconds) ─────────────
let autoSaveInterval = null;

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : "",
  };
}

// Collect current game state into a plain object
function collectGameData() {
  return {
    level: player.level,
    exp: player.exp,
    expToNext: player.expToNext,
    playerClass: player.class,
    classLocked: player.classLocked,

    hp: player.hp,
    maxHP: player.maxHP,
    mp: player.mp,
    maxMP: player.maxMP,

    str: player.str,
    vit: player.vit,
    dex: player.dex,
    int: player.int,
    luk: player.luk,
    statPoints: player.statPoints,
    damage: player.damage,

    baseHPFromClass: player.baseHPFromClass,
    baseMPFromClass: player.baseMPFromClass,

    x: player.x,
    y: player.y,
    facing: player.facing,

    mesos: playerMesos,

    inventory: { ...inv },

    currentQuestId: questState?.activeQuestId || null,
    completedQuests: questState ? Array.from(questState.completed) : [],
    questProgress: questState?.progress ? { ...questState.progress } : {},
    currentMap: currentMapName,
  };
}

// Apply loaded game data onto the running game state
async function applyGameData(gd) {
  if (!gd) return;

  player.level       = gd.level       ?? player.level;
  player.exp         = gd.exp         ?? player.exp;
  player.expToNext   = gd.expToNext   ?? player.expToNext;

  if (gd.playerClass) {
    applyClassBase(player, gd.playerClass);
  }
  player.classLocked = gd.classLocked ?? player.classLocked;

  player.str        = gd.str        ?? player.str;
  player.vit        = gd.vit        ?? player.vit;
  player.dex        = gd.dex        ?? player.dex;
  player.int        = gd.int        ?? player.int;
  player.luk        = gd.luk        ?? player.luk;
  player.statPoints = gd.statPoints ?? player.statPoints;

  applyLevelStats();

  player.hp    = gd.hp    ?? player.hp;
  player.maxHP = gd.maxHP ?? player.maxHP;
  player.mp    = gd.mp    ?? player.mp;
  player.maxMP = gd.maxMP ?? player.maxMP;
  // Player.damage is derived from STR and CONFIG in applyLevelStats().
  // Don't override it with possibly stale saved values.

  // Safety: don't load into a dead state — heal to full
  if (player.hp <= 0) player.hp = player.maxHP;
  if (player.mp <= 0 && player.maxMP > 0) player.mp = player.maxMP;

  player.baseHPFromClass = gd.baseHPFromClass ?? player.baseHPFromClass;
  player.baseMPFromClass = gd.baseMPFromClass ?? player.baseMPFromClass;

  player.facing = gd.facing ?? player.facing;

  playerMesos = gd.mesos ?? playerMesos;

  // Inventory
  if (gd.inventory) {
    for (const k of Object.keys(inv)) {
      inv[k] = gd.inventory[k] ?? inv[k];
    }

    // If an old save (or fresh one) contains no potions at all, initialize the defaults.
    // This keeps the "start with 5 potions each" behavior stable across existing saves.
    const totalPotions = Object.values(inv).reduce((sum, v) => sum + (Number(v) || 0), 0);
    if (totalPotions === 0) {
      inv.hp1 = 5; inv.hp2 = 5; inv.hp3 = 5;
      inv.mp1 = 5; inv.mp2 = 5; inv.mp3 = 5;
    }
  }

  // Quest state restoration
  if (gd.currentQuestId && questIndex.has(gd.currentQuestId)) {
    questState.activeQuestId = gd.currentQuestId;
    questState.activeQuest = questIndex.get(gd.currentQuestId);
  }

  if (gd.completedQuests && Array.isArray(gd.completedQuests)) {
    questState.completed = new Set(gd.completedQuests);
  }

  if (gd.questProgress) {
    questState.progress = {};
    // Handle both Map and plain object from MongoDB
    if (gd.questProgress instanceof Map) {
      gd.questProgress.forEach((v, k) => { questState.progress[k] = v; });
    } else {
      Object.assign(questState.progress, gd.questProgress);
    }
  }

  // Load the correct map
  if (gd.currentQuestId) {
    await loadMapForQuest(gd.currentQuestId);
  }

  // Restore position AFTER map is loaded
  if (typeof gd.x === "number") player.x = gd.x;
  if (typeof gd.y === "number") player.y = gd.y;
  player.vy = 0;
  player.onGround = true;

  await refreshNeededAssets();

  // Refresh visible panels after loading so UI matches restored state.
  if (invOpen) updateInvPanelText();
  if (statsOpen) updateStatsPanelText();
  renderQuestUI();
}

async function saveGameToServer() {
  if (!authToken) return;

  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function setSaveStatus(text) {
    if (UI.saveStatus) UI.saveStatus.textContent = text;
  }

  try {
    const resp = await fetch(`${API_BASE}/game/save`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ gameData: collectGameData() }),
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!resp.ok) {
      addError("Save failed: " + (data.error || "unknown"));
      setSaveStatus(`Save failed @ ${formatTime(new Date())}: ${data.error || "unknown"}`);
    } else {
      setSaveStatus(`Game saved @ ${formatTime(new Date())}`);
    }
  } catch (err) {
    addError("Save error: " + err.message);
    setSaveStatus(`Save error @ ${formatTime(new Date())}: ${err.message}`);
  }
}

async function loadGameFromServer() {
  if (!authToken) return null;
  try {
    const resp = await fetch(`${API_BASE}/game/load`, {
      headers: getAuthHeaders(),
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    if (!resp.ok) return null;
    return data.gameData || null;
  } catch {
    return null;
  }
}

function startAutoSave() {
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(() => {
    saveGameToServer();
  }, 60_000); // save every 60 seconds
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}
let mobs = [];
let lastSpawnAt = 0;
let damageTexts = [];

// ===== CHAT =====
let chatHistory = []; // { from, text, at }
let chatBubbles = []; // { bornMs, untilMs, x, y, w, h, lines, fontSizePx, lineHeight, padX, padY }
let chatExpanded = false;

/** Set true when the player must click the quest panel to advance (reserved for future use). */
let questReadyToClaim = false;

const STUMPY_MOB_ID = 3220000;
const STUMPY_ANNOUNCE_COOLDOWN_MS = 8000;
let lastStumpyAnnounceMs = -STUMPY_ANNOUNCE_COOLDOWN_MS;

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addChatSystemLine(text, color = "#00ffff") {
  if (!UI.chatMessages) return;
  const safe = escapeHtml(text);
  const lineHtml =
    `<div class="chatLine">` +
    `<span style="color:${color}; font-weight:900;">${safe}</span>` +
    `</div>`;

  UI.chatMessages.insertAdjacentHTML("beforeend", lineHtml);
  UI.chatMessages.scrollTop = UI.chatMessages.scrollHeight;

  chatHistory.push({ from: "System", text, at: Date.now() });
}

function setChatExpanded(v) {
  chatExpanded = !!v;
  const panel = UI.chatPanel;
  if (!panel) return;

  if (!chatExpanded) {
    // Clear inline height so the CSS `.collapsed` height can take effect.
    panel.dataset.prevChatH = panel.style.height || "";
    panel.dataset.prevChatW = panel.style.width || "";
    panel.style.height = "";
    panel.classList.add("collapsed");
  } else {
    panel.classList.remove("collapsed");

    // Restore last user size (prefer localStorage, fallback to dataset).
    try {
      const rw = localStorage.getItem("chatPanelW");
      const rh = localStorage.getItem("chatPanelH");
      if (rw) panel.style.width = `${parseInt(rw, 10)}px`;
      const prevH = panel.dataset.prevChatH || "";
      const restoredH = rh ? `${parseInt(rh, 10)}px` : prevH;
      if (restoredH) panel.style.height = restoredH;
    } catch (_) {
      const prevH = panel.dataset.prevChatH || "";
      if (prevH) panel.style.height = prevH;
    }
  }

  if (UI.chatExpandBtn) UI.chatExpandBtn.textContent = chatExpanded ? "▲" : "▼";
  if (chatExpanded) UI.chatInput?.focus();
}

function wrapTextByWidth(text, maxWidthPx) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidthPx) {
      line = test;
      continue;
    }

    // if a single word is too long, hard-split it
    if (!line) {
      let part = "";
      for (const ch of w) {
        const testPart = part + ch;
        if (ctx.measureText(testPart).width > maxWidthPx) {
          if (part) lines.push(part);
          part = ch;
          // If a single character is already too wide, still push it (can't do better).
          if (ctx.measureText(part).width > maxWidthPx) {
            lines.push(part);
            part = "";
          }
        } else {
          part = testPart;
        }
      }
      if (part) lines.push(part);
      line = "";
    } else {
      lines.push(line);
      line = w;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function layoutChatBubble(fullText, atMs) {
  const fontSizePx = Math.round(11 * scaleY);
  ctx.font = `bold ${fontSizePx}px Arial`;
  const lineHeight = Math.round(fontSizePx * 1.15);
  const padX = Math.round(6 * scaleX);
  const padY = Math.round(4 * scaleY);
  // Cap bubble width so long messages wrap into a couple rows.
  const maxWrap = Math.round(140 * scaleX);
  const wrapMaxWidth = Math.max(36 * scaleX, maxWrap - padX * 2);
  const maxRows = 7;

  let lines = wrapTextByWidth(fullText, wrapMaxWidth);

  // Hard cap height (max rows) and ensure last line still fits.
  if (lines.length > maxRows) {
    lines = lines.slice(0, maxRows);
    const ell = "…";
    let last = lines[maxRows - 1] || "";
    // Trim until it fits with an ellipsis.
    while (last.length > 0 && ctx.measureText(last + ell).width > wrapMaxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxRows - 1] = (last ? last + ell : ell);
  }

  // Keep bubble width fixed so nothing can overflow horizontally.
  const bubbleW = Math.ceil(wrapMaxWidth + padX * 2);
  const bubbleH = lineHeight * lines.length + padY * 2;
  const lifeMs = 5000;

  return {
    bornMs: atMs,
    untilMs: atMs + lifeMs,
    w: bubbleW,
    h: bubbleH,
    lines,
    fontSizePx,
    lineHeight,
    padX,
    padY,
  };
}

function sendChatMessage() {
  const from = currentUsername || "Player";
  const input = UI.chatInput;
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  const fullText = `${from}: ${text}`;
  const atMs = nowMs();

  chatHistory.push({ from, text, at: Date.now() });
  if (UI.chatMessages) {
    const lineHtml =
      `<div class="chatLine">` +
      `<span class="chatName">${escapeHtml(from)}:</span>` +
      `<span class="chatText">${escapeHtml(text)}</span>` +
      `</div>`;
    UI.chatMessages.insertAdjacentHTML("beforeend", lineHtml);
    UI.chatMessages.scrollTop = UI.chatMessages.scrollHeight;
  }

  chatBubbles.push(layoutChatBubble(fullText, atMs));
}

function drawRoundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function renderChatBubbles(tMs) {
  if (!chatBubbles.length) return;

  chatBubbles = chatBubbles.filter(b => tMs < b.untilMs);

  // Keep bubbles attached to the player (reposition every frame).
  const pbox = playerBox();
  const feetY = pbox.y + pbox.h;
  const drawY = feetY - player.h;
  const sx = player.x * scaleX;
  const sy = drawY * scaleY;
  const sw = player.w * scaleX;
  const anchorY = sy - 6 * scaleY;

  for (const b of chatBubbles) {
    // Align right edge similarly to the player name pill.
    const x = sx + sw - b.w + 2 * scaleX;
    const y = anchorY - b.h;

    ctx.save();
    drawRoundedRectPath(x, y, b.w, b.h, Math.round(4 * scaleX));
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = Math.max(0.8, 1 * scaleX);
    ctx.fill();
    ctx.stroke();

    ctx.font = `bold ${b.fontSizePx}px Arial`;
    ctx.fillStyle = "#111111";
    ctx.textBaseline = "top";

    for (let i = 0; i < b.lines.length; i++) {
      const ln = b.lines[i];
      const tx = x + b.padX;
      const ty = y + b.padY + i * b.lineHeight;
      ctx.fillText(ln, tx, ty);
    }

    ctx.restore();
  }
}


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

  const idNum = Number(mobId);
  if (idNum === STUMPY_MOB_ID) {
    const t = nowMs();
    if (t - lastStumpyAnnounceMs >= STUMPY_ANNOUNCE_COOLDOWN_MS) {
      lastStumpyAnnounceMs = t;
      // Make sure the player can actually see the message.
      if (!chatExpanded) setChatExpanded(true);
      addChatSystemLine("Stomp! Stomp! Stomp! Stumpy has appread!", "#00ffff");
    }
  }

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
    vx: 0,
    wanderPauseUntil: 0,
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

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
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

let playerDead = false;

function hurtPlayerFromMob(m) {
  const t = nowMs();

  if (t - player.lastHurtAt < CONFIG.touchDamageCooldownMs) return;

  const dmg = getMobStat(m.id, "damage", 1);
  player.hp = Math.max(0, player.hp - dmg);
  player.lastHurtAt = t;

  // ===== PLAYER DEATH =====
  if (player.hp <= 0 && !playerDead) {
    playerDead = true;
    onPlayerDeath();
  }
}

function onPlayerDeath() {
  const overlay = document.getElementById("deathOverlay");
  if (overlay) overlay.style.display = "flex";

  // Clear all mobs and mesos on screen
  mobs = [];
  mesos = [];
}

async function respawnPlayer() {
  playerDead = false;

  const overlay = document.getElementById("deathOverlay");
  if (overlay) overlay.style.display = "none";

  // Reset quest progress (restart current quest)
  if (questState && questState.activeQuest) {
    questState.progress = {};
    questReadyToClaim = false;
  }

  // Restore HP to full, lose 10% mesos as penalty
  player.hp = player.maxHP;
  player.mp = player.maxMP;
  playerMesos = Math.floor(playerMesos * 0.9);

  // Clear mobs
  mobs = [];
  mesos = [];

  // Reload the map and reposition player
  if (questState.activeQuestId) {
    await loadMapForQuest(questState.activeQuestId);
  }

  const plat = WORLD.platforms[3] || WORLD.platforms[0];
  player.y = plat.y - PLAYER_HITBOX.offsetY - PLAYER_HITBOX.h;
  player.x = 120;
  player.vy = 0;
  player.onGround = true;

  await refreshNeededAssets();

  addError("You have respawned. Quest progress reset. Lost 10% mesos.");
  updateStatsPanelText();
  updateInvPanelText();
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

  let didHitMob = false;
  for (const m of mobs) {
    if (m.dead) continue;
    if (!intersects(atk, m)) continue;

    // לחשב דמג' אמיתי (לא יותר מהחיים שנותרו)
    const realDamage = Math.min(player.damage, m.hp);

    m.hp -= realDamage;
    if (realDamage > 0) didHitMob = true;

    // AGGRO: המוב ננעל על השחקן ל-2.5 שניות
    // Chase for a random duration after being hit.
    // If the player stops hitting, this timer runs out and it returns to patrolling.
    const chaseMs = randBetween(CONFIG.mobAggroMinMs ?? 1500, CONFIG.mobAggroMaxMs ?? 4500);
    m.aggroUntil = t + chaseMs;
    m.lastHitAt = t;

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

  if (didHitMob) playStumpHitSfx();
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
    npcX: mapDef.npcX ?? 745,
    npcY: mapDef.npcY ?? null,
  };

  // Store the current map name for boss detection
  currentMapName = mapKey;

  // Reload the map image
  const bg = await loadImage(PATHS.mapBg);
  if (bg.ok) mapBgImg = bg.img;
  else addError("Failed to load map: " + PATHS.mapBg);

  // Reposition NPC for this map
  shopNpc.x = WORLD.npcX ?? 745;
  shopNpc.y = WORLD.npcY ?? (WORLD.groundY - shopNpc.h - 20);
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


// ===== Mobs move more naturally (smooth velocity + occasional pauses) =====
function updateMobs(dt) {
  const t = nowMs();

  for (const m of mobs) {
    if (m.dead) continue;
    if (m.state === "hit" && t < m.stateUntil) continue;

    const aggroActive = t < (m.aggroUntil || 0);
    const p = m.platform || { x: 0, w: ORIGINAL_WIDTH };

    let desiredVx = 0; // px/sec

    if (aggroActive && m.platform === player.onPlatform) {
      // ===== CHASE PLAYER (AGGRO) =====
      const dxToPlayer = (player.x + player.w / 2) - (m.x + m.w / 2);
      m.dir = dxToPlayer >= 0 ? 1 : -1;
      desiredVx = m.dir * m.speed * 1.25; // slightly faster when aggressive
    } else {
      // ===== WANDER (with pauses) =====
      if (t >= m.nextWanderSwitchAt) {
        m.dir = Math.random() < 0.5 ? -1 : 1;
        m.nextWanderSwitchAt =
          t + randBetween(CONFIG.mobWanderSwitchMsMin, CONFIG.mobWanderSwitchMsMax);

        // Pause sometimes so movement isn't constant/jittery.
        // Longer, occasional stand-still pauses during wandering.
        const pauseChance = 0.55;
        m.wanderPauseUntil = t + (Math.random() < pauseChance ? randBetween(350, 1400) : 0);
      }

      if (t >= (m.wanderPauseUntil || 0)) {
        desiredVx = m.dir * m.speed;
      }
    }

    // ===== Smooth velocity changes =====
    const currentVx = m.vx ?? 0;
    const desiredDelta = desiredVx - currentVx;
    const maxChange = (m.speed * 8 + 80) * dt; // px/sec change per frame
    m.vx = currentVx + clamp(desiredDelta, -maxChange, maxChange);

    m.x += m.vx * dt;

    // ===== PLATFORM BOUNDS =====
    const minX = p.x;
    const maxX = p.x + p.w - m.w;

    if (m.x < minX) {
      m.x = minX;
      m.vx = 0;
      m.dir = 1;
    } else if (m.x > maxX) {
      m.x = maxX;
      m.vx = 0;
      m.dir = -1;
    }

    // keep y glued to platform top
    m.y = mobYOnPlatform(p, m.h);

    // state based on movement
    m.state = Math.abs(m.vx) > 5 ? "move" : "stand";
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
  } else

    // For qBoss quests, only allow 1 mob and spawn at ground platform
    if (questState.activeQuestId && questState.activeQuestId.startsWith("qBoss")) {
      if (aliveCount >= 1) return;

      const id = targets[0];
      const groundPlatform = WORLD.platforms[0]; // ground platform
      const x = groundPlatform.x + 100 + Math.random() * (groundPlatform.w - 200);
      mobs.push(spawnMob(id, x, groundPlatform));
    } else {
      if (aliveCount >= CONFIG.spawnMaxOnScreen) return;

      const id = targets[0];
      const plats = WORLD.platforms.slice(1);

      const p = pickPlatformWeighted(plats);

      // קצרה? רק אם אין עליה אף אחד
      if (isShortPlatform(p) && countAliveOnPlatform(p) >= 1) return;

      // ארוכה? תן שיהיו עליה הרבה
      if (!isShortPlatform(p) && countAliveOnPlatform(p) >= 6) return;

      const x = p.x + 20 + Math.random() * (p.w - 60);
      mobs.push(spawnMob(id, x, p));

    }

}

function isShortPlatform(p) {
  return p.w <= 220; // קצרה = עד 220px (תכוון אם צריך)
}

function pickPlatformWeighted(plats) {
  // ארוכות יקבלו משקל גדול יותר
  const weights = plats.map(p => {
    const base = Math.max(1, Math.floor(p.w / 120)); // רוחב גדול => יותר משקל
    const shortPenalty = isShortPlatform(p) ? 0.25 : 1; // קצרות פי 4 פחות
    return base * shortPenalty;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;

  for (let i = 0; i < plats.length; i++) {
    r -= weights[i];
    if (r <= 0) return plats[i];
  }
  return plats[plats.length - 1];
}

function countAliveOnPlatform(p) {
  return mobs.filter(m => !m.dead && m.platform === p).length;
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
 // ===== DEBUG: SHOW PLATFORMS =====
   ctx.fillStyle = "rgba(255,0,0,0.35)";
   for (const p of WORLD.platforms) {
     ctx.fillRect(
       p.x * scaleX,
       p.y * scaleY,
       p.w * scaleX,
       p.h * scaleY
     );
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

  // ===== PLAYER NAME (compact tag, right-aligned to sprite) =====
  if (currentUsername) {
    const userFontSize = Math.round(11 * scaleY);
    ctx.font = `bold ${userFontSize}px Arial`;
    const padX = Math.round(6 * scaleX);
    const padY = Math.round(3 * scaleY);
    const unameW = ctx.measureText(currentUsername).width;
    const rectW = Math.ceil(unameW + padX * 2);
    const rectH = Math.round(userFontSize + padY * 2);
    // When facing left, the sprite is drawn as-is; anchor the pill to the left edge
    // so it stays visually aligned while moving.
    const rectX = player.facing === -1
      ? sx - 2 * scaleX
      : (sx + sw - rectW + 2 * scaleX);
    const rectY = sy + sh + Math.round(3 * scaleY);

    drawRoundedRectPath(rectX, rectY, rectW, rectH, Math.round(4 * scaleX));
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = Math.max(0.8, 1 * scaleX);
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(currentUsername, rectX + padX, rectY + rectH / 2);
    ctx.textAlign = "start";
  }

  // Chat bubbles on the canvas
  renderChatBubbles(t);


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

    let scale = isBoss ? 5 : 1.4;


    const mx = m.x * scaleX;
    const my = m.y * scaleY;
    const mw = m.w * scaleX * scale;
    const mh = m.h * scaleY * scale;

    const offsetX = isBoss ? (mw - m.w * scaleX) / 2 : 0;
    const offsetY = mh - m.h * scaleY;

    if (img) {
      if (m.dir === 1) drawFlipped(img, mx - offsetX, my - offsetY, mw, mh);
      else ctx.drawImage(img, mx - offsetX, my - offsetY, mw, mh);
    } else {
      ctx.fillStyle = "#ff6";
      ctx.fillRect(mx - offsetX, my - offsetY, mw, mh);
    }

    const hpBarY = (m.y - 15) * scaleY - (mh - m.h * scaleY);
    const hpBarW = mw;
    const hpBarH = isBoss ? 10 * scaleY : 6 * scaleY;

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(mx - offsetX, hpBarY, hpBarW, hpBarH);
    ctx.fillStyle = isBoss ? "rgba(255,100,0,0.9)" : "rgba(255,0,0,0.7)";
    ctx.fillRect(mx - offsetX, hpBarY, hpBarW * (m.hp / m.maxHP), hpBarH);
  }

  // mesos
  drawMesos();

  // mesos count (removed from top-left)
  // ctx.fillStyle = "white";
  // ctx.font = `${18 * scaleY}px Arial`;
  // ctx.fillText(`Mesos: ${playerMesos}`, 12 * scaleX, 52 * scaleY);

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
      if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, drawX, drawYY, digitW, digitH);
      drawX += digitW;
    }

    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "start";

  // ===== SHOP UI (ONLY IF OPEN) =====
  shopCloseHit = null;
  if (shopOpen) {
    const SHOP_SCALE = 0.55;        // קטן יותר (תשנה ל-0.5/0.6 לפי טעם)
    const SHOP_ANCHOR = "center"; // center / rightMid / rightBottom

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

    const closeBtn = Math.round(Math.min(28 * scaleY, imgH * 0.075));
    shopCloseHit = {
      x: shopBx + imgW - closeBtn - Math.round(8 * scaleX),
      y: shopBy + Math.round(8 * scaleY),
      w: closeBtn,
      h: closeBtn,
    };
    const cr = shopCloseHit;
    drawRoundedRectPath(cr.x, cr.y, cr.w, cr.h, Math.min(8, cr.w * 0.28));
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.font = `800 ${Math.round(cr.h * 0.42)}px Arial`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×", cr.x + cr.w / 2, cr.y + cr.h / 2 + 1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    // DEBUG: draw tab hitboxes as colored rectangles
    // for (const hb of SHOP_TAB_HITBOX) {
    //   const dx = shopBx + imgW * hb.x;
    //   const dy = shopBy + imgH * hb.y;
    //   const dw = imgW * hb.w;
    //   const dh = imgH * hb.h;
    //   ctx.strokeStyle = hb.tab === shopTab ? "lime" : "red";
    //   ctx.lineWidth = 2;
    //   ctx.strokeRect(dx, dy, dw, dh);
    // }

    shopItemRects = [];

    // show potions list ONLY on USE tab (shop2)
    if (shopTab === 2) {
      // All positions proportional to shop image dimensions
      const contentL = shopBx + imgW * 0.07;   // left edge of content area
      const listY    = shopBy + imgH * 0.31;    // first row top
      const rowH     = imgH * 0.062;            // row height (fits ~10 rows)

      const items = [
        ["1", "hp1"], ["2", "hp2"], ["3", "hp3"],
        ["4", "mp1"], ["5", "mp2"], ["6", "mp3"],
      ];

      const fontSize = Math.max(9, Math.round(rowH * 0.52));
      ctx.font = `bold ${fontSize}px Arial`;

      for (let i = 0; i < items.length; i++) {
        const id = items[i][1];
        const p = POTIONS.find(x => x.id === id);
        if (!p) continue;

        const rowY  = listY + i * rowH;
        const textY = rowY + rowH * 0.65;       // vertically center text

        shopItemRects.push({
          id,
          x: contentL,
          y: rowY,
          w: imgW * 0.88,
          h: rowH,
        });

        const isHovered = (shopHoverId === id);

        // — highlight row on hover —
        if (isHovered) {
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(contentL, rowY, imgW * 0.88, rowH);
        }

        // — icon (scaled to row height) —
        const icon = potionImgs[id];
        const iSize = rowH * 0.8;
        if (icon && icon.complete && icon.naturalWidth > 0) {
          ctx.drawImage(icon, contentL + imgW * 0.01, rowY + (rowH - iSize) / 2, iSize, iSize);
        }

        // — potion name —
        ctx.fillStyle = "white";
        ctx.fillText(p.name, contentL + imgW * 0.10, textY);

        // — owned count (always visible) —
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText(`x${inv[id] ?? 0}`, shopBx + imgW * 0.88, textY);
      }

      // — tooltip on hover (show effect + price) —
      if (shopHoverId) {
        const hp = POTIONS.find(x => x.id === shopHoverId);
        if (hp) {
          const tipW = imgW * 0.32;
          const tipH = imgH * 0.09;
          const tipX = Math.min(shopMouseX + 12, shopBx + imgW - tipW - 5);
          const tipY = Math.min(shopMouseY + 12, shopBy + imgH - tipH - 5);

          ctx.fillStyle = "rgba(0,0,0,0.85)";
          ctx.strokeStyle = "rgba(255,215,0,0.6)";
          ctx.lineWidth = 1;
          ctx.fillRect(tipX, tipY, tipW, tipH);
          ctx.strokeRect(tipX, tipY, tipW, tipH);

          const tipFontSize = Math.max(9, Math.round(tipH * 0.3));
          ctx.font = `bold ${tipFontSize}px Arial`;

          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillText(`+${hp.heal} ${hp.type.toUpperCase()}`, tipX + 8, tipY + tipH * 0.4);

          ctx.fillStyle = "rgba(255,215,0,0.95)";
          ctx.fillText(`Price: ${hp.price} mesos`, tipX + 8, tipY + tipH * 0.75);
        }
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

  // 🔒 לעצור את המשחק עד התחברות
  if (!isLoggedIn) {
    render();
    requestAnimationFrame(loop);
    return;
  }

  // ⛔ Freeze gameplay when dead
  if (playerDead) {
    render();
    requestAnimationFrame(loop);
    return;
  }

  // Safety: catch 0 HP even if hurtPlayerFromMob didn't trigger it
  if (player.hp <= 0 && !playerDead) {
    playerDead = true;
    onPlayerDeath();
    render();
    requestAnimationFrame(loop);
    return;
  }

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
  const chatInputEl = UI.chatInput;
  const isMainEnter = e.code === "Enter" || e.code === "NumpadEnter";
  const raw = chatInputEl ? chatInputEl.value.trim() : "";

  // Enter behavior:
  // 1) Press Enter anywhere => focus chat (open if collapsed).
  // 2) Press Enter again while chat is focused & empty => minimize chat.
  // 3) Press Enter again => open chat and focus it again.
  if (isMainEnter) {
    ensureBgmStarted();

    if (!chatExpanded) {
      setChatExpanded(true);
      e.preventDefault();
      requestAnimationFrame(() => chatInputEl?.focus());
      return;
    }

    if (chatInputEl && document.activeElement === chatInputEl) {
      if (!raw) {
        e.preventDefault();
        setChatExpanded(false);
      }
      // If raw is non-empty, let the chat input handler send the message.
      return;
    }

    e.preventDefault();
    chatInputEl?.focus();
    return;
  }

  // Don't move/attack while typing chat (except Enter, handled above).
  if (chatInputEl && document.activeElement === chatInputEl) return;

  ensureBgmStarted();

  if (e.code === "Space") e.preventDefault();
  keys.add(e.code);

  if (e.code === "ArrowUp") tryJump();
  if (e.code === "Space") tryAttack();

  // ===== SHOP SYSTEM =====

  if (e.code === "KeyE") {
    shopOpen = !shopOpen;
    if (shopOpen) shopTab = 1;
  }

  // Buy potions when shop is open, USE potions when shop closed
  if (shopOpen) {
    if (e.code === "Digit1") buyPotion("hp1");
    if (e.code === "Digit2") buyPotion("hp2");
    if (e.code === "Digit3") buyPotion("hp3");

    if (e.code === "Digit4") buyPotion("mp1");
    if (e.code === "Digit5") buyPotion("mp2");
    if (e.code === "Digit6") buyPotion("mp3");

    if (e.code === "Escape") shopOpen = false;
  } else {
    if (e.code === "KeyI") {
      e.preventDefault();
      toggleInvPanel();
    }
    if (e.code === "KeyS") {
      e.preventDefault();
      toggleStatsPanel();
    }
    if (e.code === "KeyQ") {
      e.preventDefault();
      toggleQuestPanel();
    }

    // Use potions from hotbar (keys 1-6)
    if (e.code === "Digit1") usePotion("hp1");
    if (e.code === "Digit2") usePotion("hp2");
    if (e.code === "Digit3") usePotion("hp3");
    if (e.code === "Digit4") usePotion("mp1");
    if (e.code === "Digit5") usePotion("mp2");
    if (e.code === "Digit6") usePotion("mp3");
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

// If the window/tab loses focus, keyup might not fire (leaving keys stuck).
// Clear pressed keys so the player doesn't keep walking sideways.
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) keys.clear();
});

canvas.addEventListener("mousedown", (e) => {
  ensureBgmStarted();
  if (!shopOpen || !lastShopRect) return;

  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const my = (e.clientY - r.top) * (canvas.height / r.height);

  if (shopCloseHit && pointInRect(mx, my, shopCloseHit)) {
    shopOpen = false;
    return;
  }

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
  shopNpc.x = WORLD.npcX ?? 745;
  shopNpc.y = WORLD.npcY ?? (WORLD.groundY - shopNpc.h - 20);



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
  UI.menuToggle?.addEventListener("click", () => {
    UI.menuDropdown.classList.toggle("open");
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (UI.gameMenu && !UI.gameMenu.contains(e.target)) {
      UI.menuDropdown?.classList.remove("open");
    }
  });

  UI.statsBtn?.addEventListener("click", () => {
    UI.menuDropdown?.classList.remove("open");
    toggleStatsPanel();
  });

  UI.invBtn?.addEventListener("click", () => {
    UI.menuDropdown?.classList.remove("open");
    toggleInvPanel();
  });

  UI.questBtn?.addEventListener("click", () => {
    UI.menuDropdown?.classList.remove("open");
    toggleQuestPanel();
  });

  // Close buttons for panels
  UI.statsClose?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setStatsOpen(false);
  });
  UI.invClose?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setInvOpen(false);
  });

  UI.questClose?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setQuestOpen(false);
  });

  function makePanelDraggable(panelEl) {
    if (!panelEl) return;

    panelEl.addEventListener("pointerdown", (e) => {
      // Allow dragging only from empty area / headers; don't interfere with buttons.
      if (e.button !== 0) return;
      const t = e.target;
      if (t && t.closest && t.closest("button, input, textarea, select, a")) return;
      if (panelEl === UI.questPanel && t && t.closest && t.closest("#questProgress")) return;
      if (panelEl.style.display === "none") return;

      e.preventDefault();

      const rect = panelEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;

      const prevZ = panelEl.style.zIndex;
      panelEl.style.zIndex = "9999";
      panelEl.style.right = "auto";
      panelEl.style.left = `${rect.left}px`;
      panelEl.style.top = `${rect.top}px`;

      const onMove = (ev) => {
        const w = rect.width;
        const h = rect.height;
        const rawLeft = ev.clientX - offsetX;
        const rawTop = ev.clientY - offsetY;
        const left = clamp(rawLeft, 0, window.innerWidth - w);
        const top = clamp(rawTop, 0, window.innerHeight - h);
        panelEl.style.left = `${left}px`;
        panelEl.style.top = `${top}px`;
      };

      const onUp = () => {
        panelEl.style.zIndex = prevZ || "";
        document.removeEventListener("pointermove", onMove);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
    });
  }

  // Quest / Stats / Inventory can be dragged anywhere.
  makePanelDraggable(UI.questPanel);
  makePanelDraggable(UI.statsPanel);
  makePanelDraggable(UI.invPanel);

  // ===== CHAT UI =====
  if (UI.chatPanel) {
    // Start collapsed; user can press C or expand the panel.
    setChatExpanded(false);
    if (UI.chatMessages) UI.chatMessages.innerHTML = "";
  }

  UI.chatHeader?.addEventListener("click", () => {
    setChatExpanded(!chatExpanded);
  });

  UI.chatExpandBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setChatExpanded(!chatExpanded);
  });

  UI.chatSendBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    sendChatMessage();
  });

  const chatPanelEl = UI.chatPanel;
  if (chatPanelEl && window.ResizeObserver) {
    let resizeSaveT = 0;
    new ResizeObserver(() => {
      if (chatPanelEl.classList.contains("collapsed")) return;
      clearTimeout(resizeSaveT);
      resizeSaveT = setTimeout(() => {
        try {
          localStorage.setItem("chatPanelW", String(chatPanelEl.offsetWidth));
          localStorage.setItem("chatPanelH", String(chatPanelEl.offsetHeight));
        } catch (_) {}
      }, 150);
    }).observe(chatPanelEl);
  }
  try {
    const rw = localStorage.getItem("chatPanelW");
    const rh = localStorage.getItem("chatPanelH");
    if (chatPanelEl && rw && rh) {
      const w = parseInt(rw, 10);
      const h = parseInt(rh, 10);
      if (w >= 280 && h >= 120) {
        chatPanelEl.style.width = `${w}px`;
        chatPanelEl.style.height = `${h}px`;
      }
    }
  } catch (_) {}

  // Custom resize handle (more reliable than CSS `resize`).
  const chatResizeHandle = document.getElementById("chatResizeHandle");
  if (chatPanelEl && chatResizeHandle) {
    chatResizeHandle.addEventListener("pointerdown", (e) => {
      if (chatPanelEl.classList.contains("collapsed")) return;
      e.preventDefault();
      e.stopPropagation();

      const startRect = chatPanelEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = startRect.width;
      const startH = startRect.height;

      const minW = 280;
      const minH = 120;
      const cs = window.getComputedStyle(chatPanelEl);
      const leftMargin = parseFloat(cs.left) || startRect.left || 10;
      const bottomMargin = parseFloat(cs.bottom) || 10;
      // Panel is `position: fixed` with `left` + `bottom`, so increasing height should
      // be bounded by the viewport minus the bottom margin (not the initial top).
      const maxW = Math.max(minW, window.innerWidth - leftMargin - 10);
      const maxH = Math.max(minH, window.innerHeight - bottomMargin - 10);

      const onMove = (ev) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const nextW = clamp(startW + dw, minW, maxW);
        const nextH = clamp(startH + dh, minH, maxH);
        chatPanelEl.style.width = `${nextW}px`;
        chatPanelEl.style.height = `${nextH}px`;
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
    });
  }

  UI.chatInput?.addEventListener("keydown", (e) => {
    const isEnter = e.key === "Enter" || e.code === "NumpadEnter";
    if (isEnter) {
      e.preventDefault();
      const raw = UI.chatInput.value.trim();
      if (raw) sendChatMessage();
      else setChatExpanded(false);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setChatExpanded(false);
    }
  });

  let claimingQuest = false;

  // ===== RESPAWN BUTTON =====
  UI.respawnBtn?.addEventListener("click", () => {
    respawnPlayer();
  });

  UI.questPanel?.addEventListener("click", async () => {
    if (!questReadyToClaim) return;
    if (!questState?.activeQuest) return;
    if (claimingQuest) return;

    claimingQuest = true;
    questReadyToClaim = false;

    try {
      await completeQuest(questState.activeQuest);
    } finally {
      claimingQuest = false;
    }
  });

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


  // ===== LOGIN SYSTEM (MongoDB) =====
  function showGameUI() {
    isLoggedIn = true;
    if (UI.loginScreen) UI.loginScreen.style.display = "none";
    if (UI.hud) UI.hud.style.display = "block";
    if (UI.gameMenu) UI.gameMenu.style.display = "block";
    if (UI.loginMsg) UI.loginMsg.textContent = "";
  }

  function hideGameUI() {
    isLoggedIn = false;
    if (UI.loginScreen) UI.loginScreen.style.display = "flex";
    if (UI.hud) UI.hud.style.display = "none";
    if (UI.gameMenu) UI.gameMenu.style.display = "none";
    setStatsOpen(false);
    setInvOpen(false);
    setQuestOpen(false);
  }

  async function doLogin(token, username) {
    authToken = token;
    currentUsername = username;
    localStorage.setItem("maple_token", token);
    localStorage.setItem("maple_user", username);

    showGameUI();
    ensureBgmStarted();

    // Load saved game data from server
    const gd = await loadGameFromServer();
    if (gd) {
      await applyGameData(gd);
      addError(`Welcome back, ${username}! Game data loaded.`);
    } else {
      addError(`Welcome, ${username}! Starting fresh.`);
    }

    startAutoSave();
  }

  function doLogout() {
    stopAutoSave();
    // Save before logging out
    saveGameToServer();

    authToken = null;
    currentUsername = null;
    localStorage.removeItem("maple_token");
    localStorage.removeItem("maple_user");

    hideGameUI();
  }

  // ── Login button ──
  UI.loginBtn?.addEventListener("click", async () => {
    const user = UI.loginUser?.value.trim();
    const pass = UI.loginPass?.value.trim();

    if (!user || !pass) {
      if (UI.loginMsg) UI.loginMsg.textContent = "Enter username and password.";
      return;
    }

    if (UI.loginMsg) UI.loginMsg.textContent = "Logging in...";

    try {
      const resp = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch {
        if (UI.loginMsg) UI.loginMsg.textContent = "Server returned invalid response. Make sure you're accessing the game through http://localhost:3000";
        return;
      }

      if (!resp.ok) {
        if (UI.loginMsg) UI.loginMsg.textContent = data.error || "Login failed.";
        return;
      }

      await doLogin(data.token, user);
    } catch (err) {
      if (UI.loginMsg) UI.loginMsg.textContent = "Connection error: " + err.message;
    }
  });

  // ── Register button ──
  UI.registerBtn?.addEventListener("click", async () => {
    const user  = UI.loginUser?.value.trim();
    const email = UI.loginEmail?.value.trim();
    const pass  = UI.loginPass?.value.trim();

    if (!user || !email || !pass) {
      if (UI.loginMsg) UI.loginMsg.textContent = "All fields are required.";
      return;
    }

    if (UI.loginMsg) UI.loginMsg.textContent = "Creating account...";

    try {
      const resp = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, email, password: pass }),
      });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch {
        if (UI.loginMsg) UI.loginMsg.textContent = "Server returned invalid response. Make sure you're accessing the game through http://localhost:3000";
        return;
      }

      if (!resp.ok) {
        if (UI.loginMsg) UI.loginMsg.textContent = data.error || "Registration failed.";
        return;
      }

      await doLogin(data.token, user);
    } catch (err) {
      if (UI.loginMsg) UI.loginMsg.textContent = "Connection error: " + err.message;
    }
  });

  // ── Save button ──
  UI.saveBtn?.addEventListener("click", () => {
    UI.menuDropdown?.classList.remove("open");
    saveGameToServer();
  });

  // ── Logout button ──
  UI.logoutBtn?.addEventListener("click", () => {
    UI.menuDropdown?.classList.remove("open");
    doLogout();
  });

  // ── Auto-login with existing token ──
  const savedToken = localStorage.getItem("maple_token");
  const savedUser  = localStorage.getItem("maple_user");

  if (savedToken && savedUser) {
    authToken = savedToken;
    await doLogin(savedToken, savedUser);
  } else {
    hideGameUI();
  }

  requestAnimationFrame(loop);
}


boot().catch(err => {
  console.error(err);
  addError(String(err));
  UI.questTitle.textContent = "Failed to load";
  UI.questDesc.textContent = "Check missing paths, stats file, or missing frames in assets.";
  UI.questProgress.textContent = "";
});
