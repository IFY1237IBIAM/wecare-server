const { Expo } = require("expo-server-sdk");
const NotificationToken = require("../models/NotificationToken");

const expo = new Expo();

const sendPushNotification = async (userId, { title, body, data = {} }) => {
  try {
    const tokenDocs = await NotificationToken.find({ user: userId });
    if (!tokenDocs.length) return;

    const messages = tokenDocs
      .filter((t) => Expo.isExpoPushToken(t.expoPushToken))
      .map((t) => ({
        to:    t.expoPushToken,
        sound: "default",
        title,
        body,
        data,
      }));

    if (!messages.length) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (e) {
        console.log("Expo chunk error:", e.message);
      }
    }
  } catch (e) {
    console.log("sendPushNotification error:", e.message);
  }
};

module.exports = { sendPushNotification };