const mongoose = require("mongoose");

const notificationTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expoPushToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["ios", "android", "web"], default: "android" },
    lastUsedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

notificationTokenSchema.index({ user: 1, expoPushToken: 1 }, { unique: true });

module.exports = mongoose.model("NotificationToken", notificationTokenSchema);