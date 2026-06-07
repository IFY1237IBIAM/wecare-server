/**
 * models/User.js — Complete production version with Two-Step + Passkey fields
 */

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

function getRandomColor() {
  const colors = ["#A78BFA","#60A5FA","#34D399","#F472B6","#FB923C","#E879F9"];
  return colors[Math.floor(Math.random() * colors.length)];
}
function getRandomShape() {
  const shapes = ["circle","square","triangle","diamond"];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

const userSchema = new mongoose.Schema(
  {
    pseudonym: {
      type: String, required: [true,"Pseudonym is required"], unique: true, trim: true,
      minlength: [3,"Pseudonym must be at least 3 characters"],
      maxlength: [20,"Pseudonym cannot exceed 20 characters"],
    },
    email: {
      type: String, required: [true,"Email is required"], unique: true,
      lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/,"Please enter a valid email"],
    },
    password: {
      type: String, required: [true,"Password is required"],
      minlength: [8,"Password must be at least 8 characters"], select: false,
    },
    role: {
      type: String, enum: ["user","admin","moderator"], default: "user",
    },
    avatar: {
      color: { type: String, default: () => getRandomColor() },
      shape: { type: String, default: () => getRandomShape() },
    },

    // ── Email Verification ────────────────────────────────────────────────────
    isVerified:              { type: Boolean, default: false },
    emailVerificationToken:  { type: String,  select: false },
    emailVerificationCode:   { type: String,  select: false },
    emailVerificationExpiry: { type: Date,    select: false },

    // ── Password Reset ────────────────────────────────────────────────────────
    passwordResetCode:   { type: String, select: false },
    passwordResetExpiry: { type: Date,   select: false },

    // ── Two-Step Verification ─────────────────────────────────────────────────
    twoStepEnabled:      { type: Boolean, default: false },
    twoStepPin:          { type: String,  select: false },       // bcrypt-hashed 6-digit PIN
    twoStepHint:         { type: String,  default: "" },         // memory hint, not the PIN
    twoStepRecoveryCode: { type: String,  select: false },       // bcrypt-hashed one-time code
    twoStepRecoveryUsed: { type: Boolean, default: false },

    // ── Passkey ───────────────────────────────────────────────────────────────
    // passkeyEnabled is a convenience flag — the source of truth is the Passkey collection.
    // Set true when any passkey is registered; false when all are deleted.
    passkeyEnabled: { type: Boolean, default: false },

    // ── Profile ───────────────────────────────────────────────────────────────
    bio:             { type: String,  maxlength: 100, default: "" },
    lastSeen:        { type: Date,    default: Date.now },
    isOnline:        { type: Boolean, default: false },
    showOnlineStatus:{ type: Boolean, default: true },
    savedPosts:      [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],

    // ── Push Notifications ────────────────────────────────────────────────────
    expoPushToken: { type: String, default: null },

    // ── Moderation ────────────────────────────────────────────────────────────
    reportCount:         { type: Number,   default: 0 },
    confirmedViolations: { type: Number,   default: 0 },
    isBanned:            { type: Boolean,  default: false },
    violations:          { type: [String], default: [] },
    appealStatus: {
      type: String, enum: ["none","pending","rejected","accepted"], default: "none",
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);