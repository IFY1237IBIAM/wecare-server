const mongoose = require("mongoose");

// ── Muted member sub-schema (enhanced: reason + expiry) ───────────────────
const mutedMemberSchema = new mongoose.Schema(
  {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason:    { type: String, default: "" },
    duration:  { type: String, enum: ["1h", "24h", "7d", "permanent"], default: "permanent" },
    mutedAt:   { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // null = permanent
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name:             { type: String, required: true, trim: true, maxlength: 50 },
    topic:            { type: String, required: true },
    description:      { type: String, default: "", maxlength: 300 },
    icon:             { type: String, default: "💜" },
    creator:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    creatorPseudonym: { type: String, required: true },
    members:          [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Enhanced muted members with reason + expiry
    mutedMembers: [mutedMemberSchema],

    // Members removed by Circle_Keeper (can view but not post)
    removedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Rejoin block: prevents re-entry for 24 h after leaving
    rejoinBlock: [
      {
        user:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        unblockAt:  { type: Date },
      },
    ],

    isClosed: { type: Boolean, default: false },

    // Pinned message — any member can pin; stores who pinned and which post
    pinnedMessage: {
      content:           { type: String, default: null },
      pinnedBy:          { type: String, default: null },          // user _id string
      pinnedByPseudonym: { type: String, default: null },
      pinnedAt:          { type: Date,   default: null },
      postId:            { type: String, default: null },          // for scroll-to on frontend
      expiresAt:         { type: Date,   default: null },
      duration:          { type: String, default: null },
    },

    // ── Unread-count system ──────────────────────────────────────────────
    // Total messages ever sent in this group — incremented on each new post
    totalMessages: { type: Number, default: 0 },

    // Per-user read checkpoint.
    // Key   = userId string
    // Value = JSON string: { ts: ISODate, count: <totalMessages at time of read> }
    lastReadAt: {
      type: Map,
      of:   String,
      default: {},
    },
  },
  { timestamps: true }
);

// ── Helper: is this user currently muted? (auto-expires) ─────────────────
groupSchema.methods.isUserMuted = function (userId) {
  const entry = this.mutedMembers.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!entry) return false;
  if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) return false;
  return true;
};

// ── Helper: get full mute info for a user ────────────────────────────────
groupSchema.methods.getMuteInfo = function (userId) {
  return (
    this.mutedMembers.find((m) => m.user.toString() === userId.toString()) ||
    null
  );
};

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);