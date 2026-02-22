const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },

    // ── Player game data ──────────────────────────────────
    gameData: {
      // Character basics
      level:       { type: Number, default: 1 },
      exp:         { type: Number, default: 0 },
      expToNext:   { type: Number, default: 30 },
      playerClass: { type: String, default: "warrior" },
      classLocked: { type: Boolean, default: false },

      // Stats
      hp:    { type: Number, default: 30 },
      maxHP: { type: Number, default: 30 },
      mp:    { type: Number, default: 0 },
      maxMP: { type: Number, default: 0 },

      str:        { type: Number, default: 0 },
      vit:        { type: Number, default: 0 },
      dex:        { type: Number, default: 0 },
      int:        { type: Number, default: 0 },
      luk:        { type: Number, default: 0 },
      statPoints: { type: Number, default: 0 },
      damage:     { type: Number, default: 2 },

      baseHPFromClass: { type: Number, default: 30 },
      baseMPFromClass: { type: Number, default: 0 },

      // Position
      x:      { type: Number, default: 120 },
      y:      { type: Number, default: 0 },
      facing: { type: Number, default: 1 },

      // Mesos (currency)
      mesos: { type: Number, default: 0 },

      // Potion inventory
      inventory: {
        hp1: { type: Number, default: 0 },
        hp2: { type: Number, default: 0 },
        hp3: { type: Number, default: 0 },
        mp1: { type: Number, default: 0 },
        mp2: { type: Number, default: 0 },
        mp3: { type: Number, default: 0 },
      },

      // Quest progress
      currentQuestId: { type: String, default: null },
      completedQuests: { type: [String], default: [] },
      questProgress:   { type: Map, of: Number, default: {} },

      // Current map
      currentMap: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// ── Password hashing ────────────────────────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Strip sensitive data when converting to JSON
userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
