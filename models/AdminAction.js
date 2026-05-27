const mongoose = require("mongoose");

const adminActionSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminPseudonym: { type: String },
    action: {
      type: String,
      enum: [
        "delete_post",
        "dismiss_report",
        "ban_user",
        "warn_user",
        // Group moderation
        "group_mute_member",
        "group_unmute_member",
        "group_remove_member",
        "group_close_circle",
        "group_reopen_circle",
        "group_pin_message",
        "group_report_reviewed",
      ],
      required: true,
    },
    targetPost: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetGroup: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    reason: { type: String },
    reportCount: { type: Number },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminAction", adminActionSchema);