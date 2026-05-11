const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderPseudonym: { type: String, required: true },
    type: {
      type: String,
      enum: ["reaction", "comment", "reply", "warning", "ban", "post_removed"],
      required: true,
    },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    postPreview: { type: String },
    reactionType: { type: String },
    commentText: { type: String },
    adminMessage: { type: String },
    adminReason: { type: String },
    nextStep: { type: String },
    violationCount: { type: Number },
    isBanNotification: { type: Boolean, default: false },
    isUnban: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);