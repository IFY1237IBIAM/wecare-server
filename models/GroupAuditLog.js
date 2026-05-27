const mongoose = require("mongoose");

const groupAuditLogSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    performedByPseudonym: { type: String, required: true },
    action: {
      type: String,
      enum: [
        "mute_member",
        "unmute_member",
        "remove_member",
        "close_circle",
        "reopen_circle",
        "pin_message",
        "unpin_message",
        "delete_message",
        "edit_message",
      ],
      required: true,
    },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetUserPseudonym: { type: String },
    targetPost: { type: mongoose.Schema.Types.ObjectId, ref: "GroupPost" },
    reason: { type: String, default: "" },
    duration: { type: String }, // for mutes
    meta: { type: mongoose.Schema.Types.Mixed }, // extra info
  },
  { timestamps: true }
);

groupAuditLogSchema.index({ group: 1, createdAt: -1 });

module.exports = mongoose.models.GroupAuditLog ||
  mongoose.model("GroupAuditLog", groupAuditLogSchema);