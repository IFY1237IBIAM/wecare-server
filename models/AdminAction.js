const mongoose = require("mongoose");

const adminActionSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminPseudonym: { type: String },
    action: {
      type: String,
      enum: ["delete_post", "dismiss_report", "ban_user", "warn_user"],
      required: true,
    },
    targetPost: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String },
    reportCount: { type: Number },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminAction", adminActionSchema);