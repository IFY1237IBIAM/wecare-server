/**
 * models/Passkey.js — Production Final
 *
 * Supports both:
 *   tier: "webauthn"  — full FIDO2, has credentialID + publicKey
 *   tier: "biometric" — fallback, credentialID is null (no unique constraint issue)
 *
 * IMPORTANT: credentialID is NOT unique globally — only unique per user+tier.
 * Using sparse:true means null values are excluded from the index entirely.
 */

const mongoose = require("mongoose");

const passkeySchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    // Which tier this passkey uses
    tier: {
      type:    String,
      enum:    ["webauthn", "biometric"],
      default: "webauthn",
    },

    // ── Tier 1: WebAuthn fields ───────────────────────────────────────────────
    // sparse:true means null values are NOT indexed — avoids duplicate key
    // errors when biometric fallback passkeys have no credentialID
    credentialID: {
      type:   String,
      sparse: true,   // null values excluded from index — NO unique constraint
      index:  true,
    },
    publicKey: {
      type:   String,
      select: false,  // never returned in API responses
    },
    counter: {
      type:    Number,
      default: 0,
    },
    deviceType: {
      type:    String,
      enum:    ["singleDevice", "multiDevice"],
      default: "singleDevice",
    },
    backedUp: {
      type:    Boolean,
      default: false,
    },
    transports: {
      type:    [String],
      default: ["internal"],
    },

    // ── Tier 2: biometric fallback fields ─────────────────────────────────────
    deviceId: {
      type:    String,
      default: null,
    },

    // ── Shared ────────────────────────────────────────────────────────────────
    deviceName: {
      type:      String,
      default:   "Device",
      maxlength: 60,
    },
    lastUsedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast lookups
passkeySchema.index({ user: 1, createdAt: -1 });
passkeySchema.index({ user: 1, tier: 1 });
// Unique credentialID per document (only for webauthn tier where it's set)
passkeySchema.index({ credentialID: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Passkey", passkeySchema);