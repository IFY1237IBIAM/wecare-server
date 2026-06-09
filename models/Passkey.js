/**
 * models/Passkey.js — v2 (supports both WebAuthn and biometric fallback)
 */

const mongoose = require("mongoose");

const passkeySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId, ref: "User",
      required: true, index: true,
    },

    // Which tier this passkey uses
    tier: {
      type:    String,
      enum:    ["webauthn", "biometric"],
      default: "webauthn",
    },

    // ── Tier 1: WebAuthn fields (null for biometric fallback) ─────────────────
    credentialID: { type: String, sparse: true, index: true },   // base64url
    publicKey:    { type: String, select: false },                // base64url, never returned
    counter:      { type: Number, default: 0 },
    deviceType:   { type: String, enum: ["singleDevice","multiDevice"], default: "singleDevice" },
    backedUp:     { type: Boolean, default: false },
    transports:   { type: [String], default: ["internal"] },

    // ── Tier 2: biometric fallback fields ─────────────────────────────────────
    // deviceId identifies the physical device (used to prevent duplicate registrations)
    deviceId: { type: String, default: null },

    // ── Shared ────────────────────────────────────────────────────────────────
    deviceName: { type: String, default: "Device", maxlength: 60 },
    lastUsedAt: { type: Date,   default: null },
  },
  { timestamps: true }
);

passkeySchema.index({ user: 1, createdAt: -1 });
passkeySchema.index({ user: 1, tier: 1 });

module.exports = mongoose.model("Passkey", passkeySchema);