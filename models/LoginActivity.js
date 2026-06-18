/**
 * models/LoginActivity.js
 *
 * Stores one record per login event per user.
 * Auto-expires after 90 days to keep the collection lean.
 *
 * Populated by:
 *   - authController.js (password login)
 *   - passkeyController.js (passkey login)
 *   - twoStepController.js (after 2FA verified)
 */

const mongoose = require("mongoose");

const loginActivitySchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    // ── Session identifier ────────────────────────────────────────────────────
    // A short unique token stored in the JWT and used to identify this session.
    // Allows revoking a specific session without invalidating all tokens.
    sessionId: {
      type:  String,
      index: true,
    },

    // ── Sign-in method ────────────────────────────────────────────────────────
    method: {
      type: String,
      enum: ["password", "passkey", "password+2fa"],
      default: "password",
    },

    // ── Device info (sent from client) ────────────────────────────────────────
    deviceName: {
      type:    String,
      default: "Unknown device",
    },
    deviceOS: {
      type:    String,
      default: "Unknown OS",
    },
    appVersion: {
      type:    String,
      default: "",
    },

    // ── Location (derived from IP on the server) ───────────────────────────────
    ipAddress: {
      type:    String,
      default: "",
    },
    city: {
      type:    String,
      default: "",
    },
    country: {
      type:    String,
      default: "",
    },
    flag: {
      type:    String,
      default: "",
    },

    // ── Status ────────────────────────────────────────────────────────────────
    isActive: {
      type:    Boolean,
      default: true,   // false = logged out or revoked
    },
    revokedAt: {
      type:    Date,
      default: null,
    },

    // ── Auto-expire after 90 days ─────────────────────────────────────────────
    expiresAt: {
      type:    Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      index:   { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

// Compound index for fast user lookups sorted by date
loginActivitySchema.index({ user: 1, createdAt: -1 });
loginActivitySchema.index({ user: 1, isActive: 1 });

module.exports = mongoose.model("LoginActivity", loginActivitySchema);