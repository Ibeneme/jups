const sendEmailTransporter = require("./sendEmailTransporter");
const sendExpoPush = require("./sendExpoPush");
const User = require("../models/User");

/**
 * @param {Object} params
 * @param {String} params.userId
 * @param {String} params.title
 * @param {String} params.description
 * @param {String} [params.orderId]
 * @param {String} params.type
 */
const notifyUser = async ({ userId, title, description, orderId, type }) => {
  console.log("--------------------------------------------------");
  console.log(`🚀 [NOTIFY_START] User: ${userId} | Type: ${type}`);

  try {
    const user = await User.findById(userId);

    if (!user) {
      console.error(`❌ [USER_NOT_FOUND] No user exists with ID: ${userId}, `, user);
      return;
    }

    console.log(user,
      `👤 [USER_DATA] Found: ${user.firstName} | Email: ${
        user.email
      } | Token: ${user.expoPushToken ? "Yes" : "No"}`
    );

    /* ==========================
       🔔 EXPO PUSH NOTIFICATION
    ========================== */
    let pushSuccess = false;
    if (user.expoPushToken) {
      console.log(`📲 [PUSH_ATTEMPT] Dispatching to Expo...`);

      try {
        await sendExpoPush({
          expoPushToken: user.expoPushToken,
          title,
          body: description,
          data: { type, orderId, userId: user._id.toString() },
        });
        console.log(`✅ [PUSH_SUCCESS] Notification sent to device.`);
        pushSuccess = true;
      } catch (err) {
        console.error(`⚠️ [PUSH_FAILED] Error sending push:`, err.message);
      }
    } else {
      console.log(`⚠️ [PUSH_SKIPPED] User has no expoPushToken registered.`);
    }

    /* ==========================
       📧 EMAIL NOTIFICATION
    ========================== */
    let emailSuccess = false;
    if (user.email) {
      console.log(`📩 [EMAIL_ATTEMPT] Sending email via transporter...`);

      try {
        await sendEmailTransporter({
          to: user.email,
          subject: `CloneKraft: ${title}`,
          html: `
            <div style="background-color: #f9f9f9; padding: 40px 20px; font-family: Arial, sans-serif;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #eee;">
                <div style="background-color: #000; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                  <h1 style="color: #fff; margin: 0;">CLONEKRAFT</h1>
                </div>
                <div style="padding: 30px;">
                  <h2 style="color: #111;">${title}</h2>
                  <p>Hi ${user.firstName || "User"},</p>
                  <p>${description}</p>
                </div>
                <div style="padding: 20px; background-color: #fafafa; text-align: center; font-size: 12px; color: #aaa;">
                  &copy; ${new Date().getFullYear()} CloneKraft
                </div>
              </div>
            </div>
          `,
        });
        console.log(`✅ [EMAIL_SUCCESS] Email sent to ${user.email}`);
        emailSuccess = true;
      } catch (err) {
        console.error(`⚠️ [EMAIL_FAILED] Error sending email:`, err.message);
      }
    }

    // FINAL SUMMARY CONSOLE LOG
    console.log("📊 [NOTIFICATION_SUMMARY]");
    console.table({
      User: user.firstName || userId,
      Type: type,
      PushSent: pushSuccess,
      EmailSent: emailSuccess,
      Timestamp: new Date().toLocaleTimeString(),
    });
    console.log("--------------------------------------------------");
  } catch (error) {
    console.error("🔥 [CRITICAL_ERROR] notifyUser crashed:", error.message);
  }
};

module.exports = notifyUser;
