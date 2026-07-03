const { Expo } = require("expo-server-sdk");
const NotificationToken = require("../models/NotificationToken");

const expo = new Expo();

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

    const chunks = expo.chunkPushNotifications(messages);
    const invalidTokens = [];

    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);

        // ── Check each receipt and collect dead tokens ─────────────────
        receipts.forEach((receipt, i) => {
          if (
            receipt.status === "error" &&
            (receipt.details?.error === "DeviceNotRegistered" ||
             receipt.details?.error === "InvalidCredentials")
          ) {
            invalidTokens.push(chunk[i].to);
          }
        });
      } catch (e) {
        console.log("Expo chunk error:", e.message);
      }
    }

    // ── Auto-remove stale tokens ───────────────────────────────────────
    if (invalidTokens.length > 0) {
      await NotificationToken.deleteMany({
        expoPushToken: { $in: invalidTokens },
      });
      console.log(`🧹 Removed ${invalidTokens.length} stale token(s) for user ${userId}`);
    }
  } catch (e) {
    console.log("sendPushNotification error:", e.message);
  }
};

module.exports = { sendPushNotification };