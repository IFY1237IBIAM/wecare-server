const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // Privacy
    isProfilePrivate: { type: Boolean, default: false },
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Notifications
    pushNotifications: {
      comments: { type: Boolean, default: true },
      replies: { type: Boolean, default: true },
      reactions: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      groupPosts: { type: Boolean, default: true },
    },
    emailNotifications: {
      comments: { type: Boolean, default: false },
      replies: { type: Boolean, default: false },
      reactions: { type: Boolean, default: false },
      weeklyDigest: { type: Boolean, default: false },
    },
    quietHours: {
      enabled: { type: Boolean, default: false },
      from: { type: String, default: "22:00" },
      to: { type: String, default: "08:00" },
    },

    // Content & Safety
    contentSensitivity: {
      type: String,
      enum: ["low", "medium", "strict"],
      default: "medium",
    },
    mutedKeywords: { type: [String], default: [] },

    // Appearance
    theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
    fontSize: { type: String, enum: ["small", "medium", "large"], default: "medium" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserSettings", userSettingsSchema);