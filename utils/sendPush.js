const { Expo } = require("expo-server-sdk");
const NotificationToken = require("../models/NotificationToken");

const expo = new Expo();

// Your Expo project ID from app.config.js
const PROJECT_ID = "542a1822-5d95-44d9-9072-37ad19adcc33";

const sendPushNotification = async (userId, { title, body, data = {} }) => {
  try {
    const tokenDocs = await NotificationToken.find({ user: userId });
    if (!tokenDocs.length) return;

    const validDocs = tokenDocs.filter((t) =>
      Expo.isExpoPushToken(t.expoPushToken)
    );
    if (!validDocs.length) return;

    const messages = validDocs.map((t) => ({
      to:    t.expoPushToken,
      sound: "default",
      title,
      body,
      data,
    }));

    // ── Send one token at a time to avoid cross-project conflicts ─────
    const invalidTokens = [];

    for (const message of messages) {
      try {
        const receipts = await expo.sendPushNotificationsAsync([message]);
        const receipt = receipts[0];

        if (
          receipt.status === "error" &&
          (receipt.details?.error === "DeviceNotRegistered" ||
           receipt.details?.error === "InvalidCredentials")
        ) {
          invalidTokens.push(message.to);
        }
      } catch (e) {
        // If this token caused a cross-project error, mark it for removal
        if (e.message?.includes("same project")) {
          invalidTokens.push(message.to);
          console.log(`🗑️ Cross-project token removed: ${message.to}`);
        } else {
          console.log("Expo send error:", e.message);
        }
      }
    }

    // ── Auto-remove stale/invalid tokens ──────────────────────────────
    if (invalidTokens.length > 0) {
      await NotificationToken.deleteMany({
        expoPushToken: { $in: invalidTokens },
      });
      console.log(`🧹 Removed ${invalidTokens.length} stale token(s)`);
    }
  } catch (e) {
    console.log("sendPushNotification error:", e.message);
  }
};

module.exports = { sendPushNotification };