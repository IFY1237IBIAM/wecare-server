const mongoose = require("mongoose");

const mutedMemberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, default: "" },
  duration: { type: String, enum: ["1h", "24h", "7d", "permanent"], default: "permanent" },
  mutedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null }, // null = permanent
}, { _id: false });

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "💜" },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    creatorPseudonym: { type: String, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Enhanced muted members with reason + expiry
    mutedMembers: [mutedMemberSchema],

    // Members who were removed (can view but not post)
    removedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Rejoin block: userId → unblockAt timestamp
    rejoinBlock: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      unblockAt: { type: Date },
    }],

    isClosed: { type: Boolean, default: false },

    // Pinned message — any member can pin, stores who pinned and which post
    pinnedMessage: {
      content:           { type: String, default: null },
      pinnedBy:          { type: String, default: null },           // user _id string
      pinnedByPseudonym: { type: String, default: null },           // display name
      pinnedAt:          { type: Date,   default: null },
      postId:            { type: String, default: null },
      expiresAt:         { type: Date,   default: null },
      duration:          { type: String, default: null },           // for scroll-to on frontend
    },
  },
  { timestamps: true }
);

// ── Helper: check if a user is currently muted (auto-expire) ──────────────
groupSchema.methods.isUserMuted = function (userId) {
  const entry = this.mutedMembers.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!entry) return false;
  if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) return false;
  return true;
};

// ── Helper: get mute info for a user ─────────────────────────────────────
groupSchema.methods.getMuteInfo = function (userId) {
  return this.mutedMembers.find(
    (m) => m.user.toString() === userId.toString()
  ) || null;
};

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);