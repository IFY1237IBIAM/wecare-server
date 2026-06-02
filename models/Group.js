const mongoose = require("mongoose");

const mutedMemberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, default: "" },
  duration: { type: String, enum: ["1h", "24h", "7d", "permanent"], default: "permanent" },
  mutedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
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
    removedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    mutedMembers: [mutedMemberSchema],

    rejoinBlock: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      unblockAt: { type: Date },
    }],

    isClosed: { type: Boolean, default: false },

    // === Unread Message System ===
    totalMessages: { type: Number, default: 0 },

    lastReadAt: {
      type: Map,
      of: String, // Store as JSON string: { ts: "...", count: 42 }
      default: {},
    },

    pinnedMessage: {
      content: { type: String, default: null },
      pinnedBy: { type: String, default: null },
      pinnedByPseudonym: { type: String, default: null },
      pinnedAt: { type: Date, default: null },
      postId: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      duration: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// Helper: Is user muted?
groupSchema.methods.isUserMuted = function (userId) {
  const entry = this.mutedMembers.find(m => m.user.toString() === userId.toString());
  if (!entry) return false;
  if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) return false;
  return true;
};

groupSchema.methods.getMuteInfo = function (userId) {
  return this.mutedMembers.find(m => m.user.toString() === userId.toString()) || null;
};

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);