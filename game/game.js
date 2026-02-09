const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const UI = {
  questTitle: document.getElementById("questTitle"),
  questDesc: document.getElementById("questDesc"),
  questProgress: document.getElementById("questProgress"),
  playerStats: document.getElementById("playerStats"),
  errors: document.getElementById("errors"),
};

const CONFIG = {
  groundY: 460,

  playerSpeed: 240,
  playerDamage: 2,
  attackCooldownMs: 220,

  spawnMaxOnScreen: 6,
  spawnIntervalMs: 900,

  mobBaseSpeedPxPerSec: 40,
  mobWanderSwitchMsMin: 800,
  mobWanderSwitchMsMax: 2200,

  fps: 10,
  hitStateMs: 250,
  dieStateMs: 900,
};

const PATHS = {
  statsPrimary: `./assets/data/mobs_stats.json`,
  statsFallback: `../stats/mobs_stats.json`,
  quests: `./data/quests.json`,
  frame: (mobId, anim, frameIndex) => {
    const f = String(frameIndex).padStart(3, "0");
    return `./assets/mobs/${mobId}/${anim}/${f}.png`;
  },
};

function nowMs() { return performance.now(); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randBetween(a, b) { return a + Math.random() * (b - a); }

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

function pickFirstVariant(framebooks, prefix) {
  const keys = Object.keys(framebooks || {});
  const variants = [];
  for (const k of keys) {
    const m = k.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) variants.push([Number(m[1]), k]);
  }
  variants.sort((a,b) => a[0]-b[0]);
  return variants.length ? variants[0][1] : null;
}

function chooseAnimNames(stats) {
  // Prefer names from framebooks if present, otherwise return common defaults.
  const fb = stats.framebooks || {};
  const keys = Object.keys(fb);

  const stand = fb.stand ? "stand" : (keys.includes("stand") ? "stand" : "stand");
  const move  = fb.move  ? "move"  : (keys.includes("move") ? "move" : "move");

  // If framebooks exist, prefer the first hitX/dieX. If not, we'll probe in loadMobFrames.
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

const mobFrames = new Map();

async function probeFrameCount(mobId, anim, maxProbe = 80) {
  // Try to load frames 000.. until we see a couple misses AFTER at least one success.
  const frames = [];
  let misses = 0;
  for (let i = 0; i < maxProbe; i++) {
    const r = await loadImage(PATHS.frame(mobId, anim, i));
    if (r.ok) {
      frames.push(r.img);
      misses = 0;
    } else {
      if (frames.length === 0) {
        misses++;
        if (misses >= 3) break;
      } else {
        misses++;
        if (misses >= 2) break;
      }
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
  const fbHits = keys.filter(k => /^hit\d+$/.test(k)).sort((a,b)=>Number(a.slice(3))-Number(b.slice(3)));
  const common = ["hit1","hit","hit2","hit3","hit4","hit5"];
  const merged = [...fbHits, ...common];
  return Array.from(new Set(merged));
}

function buildDieCandidates(stats) {
  const fb = stats.framebooks || {};
  const keys = Object.keys(fb);
  const fbDies = keys.filter(k => /^die\d+$/.test(k)).sort((a,b)=>Number(a.slice(3))-Number(b.slice(3)));
  const common = ["die1","die","die2","die3","die4","die5"];
  const merged = [...fbDies, ...common];
  return Array.from(new Set(merged));
}

async function loadMobFrames(mobId, stats) {
  const fb = stats.framebooks || {};
  const missing = new Set();

  // Stand / Move: try exact names first
  let standPick = await probeFirstAvailable(mobId, ["stand"]);
  if (!standPick.frames.length) {
    missing.add(`${mobId}/stand`);
    standPick = { anim: "stand", frames: [null] };
  }

  let movePick = await probeFirstAvailable(mobId, ["move"]);
  if (!movePick.frames.length) {
    movePick = { anim: "move", frames: standPick.frames };
  }

  // Hit / Die: probe likely variants
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
  animFrames[names.move]  = movePick.frames;
  animFrames[names.hit]   = hitPick.frames;
  animFrames[names.die]   = diePick.frames;

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

let mobStatsMap = new Map();
let questsDb = null;
let questIndex = new Map();
let questState = null;

const keys = new Set();

const player = {
  x: 120,
  y: 380,
  w: 50,
  h: 70,
  facing: 1,
  speed: CONFIG.playerSpeed,
  damage: CONFIG.playerDamage,
  exp: 0,
  lastAttackAt: 0,
};

let mobs = [];
let lastSpawnAt = 0;

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

function spawnMob(mobId, x) {
  const stats = mobStatsMap.get(Number(mobId));
  if (!stats) throw new Error(`Missing mob stats for id=${mobId}.`);

  const maxHP = getMobStat(mobId, "maxHP", 10);
  const exp = getMobStat(mobId, "exp", 0);

  return {
    id: Number(mobId),
    x, y: CONFIG.groundY - 60,
    w: 60, h: 60,
    maxHP, hp: maxHP,
    exp,
    state: "stand",
    stateUntil: 0,
    dead: false,
    dir: Math.random() < 0.5 ? -1 : 1,
    speed: computeMobSpeedPxPerSec(mobId),
    nextWanderSwitchAt: nowMs() + randBetween(CONFIG.mobWanderSwitchMsMin, CONFIG.mobWanderSwitchMsMax),
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

  const atk = {
    x: player.facing === 1 ? player.x + player.w : player.x - 34,
    y: player.y + 10,
    w: 34,
    h: player.h - 20,
  };

  for (const m of mobs) {
    if (m.dead) continue;
    if (!intersects(atk, m)) continue;

    m.hp -= player.damage;

    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      setMobState(m, "die", CONFIG.dieStateMs);

      player.exp += m.exp;
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
    UI.playerStats.textContent = `EXP: ${player.exp} | Damage: ${player.damage} | Mobs: ${mobs.length}`;
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
  UI.playerStats.textContent = `EXP: ${player.exp} | Damage: ${player.damage} | Mobs: ${mobs.length}`;
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
    mobs.push(spawnMob(targets[0], 540));
    mobs.push(spawnMob(targets[0], 680));
  }
}

function updatePlayer(dt) {
  let vx = 0;
  if (keys.has("ArrowLeft")) { vx = -player.speed; player.facing = -1; }
  if (keys.has("ArrowRight")) { vx = player.speed; player.facing = 1; }

  player.x += vx * dt;
  player.x = clamp(player.x, 0, canvas.width - player.w);
}

function updateMobs(dt) {
  const t = nowMs();

  for (const m of mobs) {
    if (m.dead) continue;

    if (m.state === "hit" && t < m.stateUntil) continue;

    if (t >= m.nextWanderSwitchAt) {
      m.dir = Math.random() < 0.5 ? -1 : 1;
      m.nextWanderSwitchAt = t + randBetween(CONFIG.mobWanderSwitchMsMin, CONFIG.mobWanderSwitchMsMax);
    }

    const dx = m.dir * m.speed * dt;
    m.x += dx;

    if (m.x <= 0) { m.x = 0; m.dir = 1; }
    if (m.x >= canvas.width - m.w) { m.x = canvas.width - m.w; m.dir = -1; }

    m.state = Math.abs(dx) > 0.01 ? "move" : "stand";
  }

  mobs = mobs.filter(m => !(m.dead && m.state === "die" && nowMs() >= m.stateUntil));
}

function spawnLogic() {
  const targets = getQuestTargetMobIds();
  if (!targets.length) return;

  const t = nowMs();
  if (t - lastSpawnAt < CONFIG.spawnIntervalMs) return;
  lastSpawnAt = t;

  if (mobs.length >= CONFIG.spawnMaxOnScreen) return;

  const id = targets[0];
  mobs.push(spawnMob(id, 380 + Math.random() * 520));
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#222";
  ctx.fillRect(0, CONFIG.groundY, canvas.width, canvas.height - CONFIG.groundY);

  ctx.fillStyle = "#66ccff";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  const t = nowMs();
  for (const m of mobs) {
    const img = getMobFrame(m.id, m.state, t);
    if (img) ctx.drawImage(img, m.x, m.y, m.w, m.h);
    else {
      ctx.fillStyle = "#ff6";
      ctx.fillRect(m.x, m.y, m.w, m.h);
    }

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(m.x, m.y - 10, m.w, 6);
    ctx.fillStyle = "rgba(0,255,0,0.7)";
    ctx.fillRect(m.x, m.y - 10, m.w * (m.hp / m.maxHP), 6);
  }

  renderQuestUI();
}

let lastFrameAt = nowMs();
function loop() {
  const t = nowMs();
  const dt = Math.min(0.033, (t - lastFrameAt) / 1000);
  lastFrameAt = t;

  updatePlayer(dt);
  updateMobs(dt);
  spawnLogic();
  render();

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") e.preventDefault();
  keys.add(e.code);
  if (e.code === "Space") tryAttack();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

async function boot() {
  const statsList = await fetchJsonFirstOk([PATHS.statsPrimary, PATHS.statsFallback, '/stats/mobs_stats.json']);
  mobStatsMap = new Map(statsList.map(x => [Number(x.id), x]));

  questsDb = await fetchJson(PATHS.quests);
  initQuestState();
  await refreshNeededAssets();

  requestAnimationFrame(loop);
}

boot().catch(err => {
  console.error(err);
  addError(String(err));
  UI.questTitle.textContent = "Failed to load";
  UI.questDesc.textContent = "Check missing paths, stats file, or missing frames in assets.";
  UI.questProgress.textContent = "";
});