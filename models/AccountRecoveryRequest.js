/**
 * models/AccountRecoveryRequest.js
 *
 * Stores account recovery requests from users who are fully locked out
 * (forgot password AND lost their two-step recovery code).
 *
 * Flow:
 *   1. User submits request with identity-proof details
 *   2. Admin reviews against the real account
 *   3. Admin approves (disables two-step) or rejects
 *   4. User is emailed the outcome
 */

const mongoose = require("mongoose");

const accountRecoveryRequestSchema = new mongoose.Schema(
  {
    // The account this request claims to belong to
    // Looked up by email at submission time, but stored as a snapshot
    // in case the account details change later
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
      default: null,   // null if no matching account was found at all
    },

    // ── Submitted identity proof ──────────────────────────────────────────────
    submittedEmail:          { type: String, required: true, trim: true, lowercase: true },
    submittedPseudonym:      { type: String, required: true, trim: true },
    submittedAccountAge:     { type: String, default: "" },   // free text, e.g. "around March 2025"
    reason:                  { type: String, required: true, maxlength: 1000 },

    // ── Snapshot of the real account at submission time (for admin comparison) ──
    actualPseudonym:         { type: String, default: "" },
    actualEmail:             { type: String, default: "" },
    actualCreatedAt:         { type: Date,   default: null },
    actualTwoStepEnabled:    { type: Boolean, default: false },
    actualPasskeyEnabled:    { type: Boolean, default: false },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ["pending", "approved", "rejected"],
      default: "pending",
    },

    // ── Admin review ──────────────────────────────────────────────────────────
    reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt:   { type: Date, default: null },
    adminNote:    { type: String, default: "", maxlength: 500 },

    // ── Request metadata ──────────────────────────────────────────────────────
    ipAddress: { type: String, default: "" },
  },
  { timestamps: true }
);

accountRecoveryRequestSchema.index({ status: 1, createdAt: -1 });
accountRecoveryRequestSchema.index({ submittedEmail: 1 });

module.exports = mongoose.model("AccountRecoveryRequest", accountRecoveryRequestSchema);