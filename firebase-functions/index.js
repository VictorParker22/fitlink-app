const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { onRequest } = require("firebase-functions/v2/https");

// Initialize Firebase Admin — automatically uses built-in credentials (ADC)
// No service account key needed!
initializeApp();

exports.sendPush = onRequest(
  { cors: true, region: "us-east1", invoker: "public" },
  async (req, res) => {
    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { token, title, body, data } = req.body;

      if (!token || !title || !body) {
        res.status(400).json({ error: "Missing required fields: token, title, or body" });
        return;
      }

      const message = {
        token,
        notification: { title, body },
        android: {
          priority: "high",
          notification: {
            channelId: "default",
            sound: "default",
          },
        },
        data: data || {},
      };

      const response = await getMessaging().send(message);
      console.log("Successfully sent FCM message:", response);
      res.status(200).json({ success: true, messageId: response });
    } catch (error) {
      console.error("Error sending FCM message:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
