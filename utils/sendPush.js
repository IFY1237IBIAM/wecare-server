const { Expo } = require("expo-server-sdk");
const NotificationToken = require("../models/NotificationToken");

const expo = new Expo();

const sendPushNotification = async (userId, { title, body, data = {} }) => {
  try {
    const tokens = await NotificationToken.find({ user: userId });
    if (!tokens.length) return;

    const messages = tokens
    .map(t => t.expoPushToken)
    .filter(token => Expo.isExpoPushToken(token))
    .map(token => ({
        to: token,
        sound: "default",
        title,
        body,
        data,
        android: {
          channelId: "default",
          color: "#9B6FD4",
          smallIcon: "notification_icon",
        },
        priority: "high",
      }));

    if (!messages.length) return;

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);

        for (let i = 0; i < receipts.length; i++) {
          const receipt = receipts[i];
          const token = chunk[i].to;

          if (receipt.status === 'ok') {
            // Update lastUsedAt on successful send
            await NotificationToken.updateOne(
              { expoPushToken: token },
              { lastUsedAt: new Date() }
            );
          }

          if (receipt.status === 'error') {
            if (receipt.details?.error === 'DeviceNotRegistered') {
              await NotificationToken.deleteOne({ expoPushToken: token });
            }
            console.log(`Push error for ${token}:`, receipt.details?.error);
          }
        }
      } catch (e) {
        console.log("Push send error:", e.message);
      }
    }
  } catch (e) {
    console.log("sendPushNotification error:", e.message);
  }
};

module.exports = { sendPushNotification };