const { Expo } = require('expo-server-sdk');

const expoClient = new Expo();

// Shared Expo push helper — send a real system push notification (works
// even when the app isn't in the foreground), as opposed to an in-app
// custom Alert which only exists while the user is looking at the screen.
async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) return;
  try {
    await expoClient.sendPushNotificationsAsync([{
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
    }]);
  } catch (err) {
    console.error('[Push]', err.message);
  }
}

module.exports = { sendPushNotification };
