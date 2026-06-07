/**
 * models/Passkey.js
 *
 * Stores ONE row per registered passkey device.
 * The private key NEVER appears here — only the public key.
 *
 * Fields from @simplewebauthn/server registrationInfo:
 *   credentialID   — base64url-encoded unique ID for this credential
 *   publicKey      — base64url-encoded COSE public key (used to verify signatures)
 *   counter        — monotonically increases each sign-in (replay-attack guard)
 *   deviceType     — "singleDevice" | "multiDevice" (multiDevice = synced to iCloud/Google)
 *   backedUp       — true if the OS is syncing this passkey across devices
 *   transports     — ["internal"] for platform keys (Face ID / fingerprint)
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

    // Core WebAuthn credential fields
    credentialID: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },
    publicKey: {
      type:     String,
      required: true,
      select:   false,  // never returned in API responses
    },
    counter: {
      type:    Number,
      default: 0,
    },

    // Device metadata
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

    // Human-readable label the user sees in Security settings
    deviceName: {
      type:    String,
      default: "Device",
      maxlength: 60,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index so we can quickly look up all passkeys for a user
passkeySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Passkey", passkeySchema);