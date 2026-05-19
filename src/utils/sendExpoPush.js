const { Expo } = require("expo-server-sdk");

const expo = new Expo();

const sendExpoPush = async ({ expoPushToken, title, body, data = {} }) => {
  console.log("🚀 sendExpoPush started");
  console.log("📥 Incoming parameters:", { expoPushToken, title, body, data });

  try {
    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.log("❌ Invalid Expo push token:", expoPushToken);
      return;
    }

    console.log("✅ Valid Expo push token confirmed");

    const message = {
      to: expoPushToken,
      sound: "default",
      title,
      body,
      data,
    };

    console.log("📦 Constructed message:", message);

    const tickets = await expo.sendPushNotificationsAsync([message]);

    console.log("📬 Raw Expo send response:", tickets);

    if (tickets && tickets.length > 0) {
      console.log("🎯 Push ticket for message:", tickets[0]);
    }

    console.log("✅ Expo push notification sent successfully");

  } catch (error) {
    console.error("🔥 Expo Push Error Object:", error);
    console.error("🔥 Error message:", error.message);
    console.error("🔥 Error stack:", error.stack);
  }
};

module.exports = sendExpoPush;