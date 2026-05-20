const sendEmailTransporter = require("./sendEmailTransporter");
const sendExpoPush = require("./sendExpoPush");
const User = require("../models/User");
const Admin = require("../models/Admin/Admin"); // 👈 Added to find administrators if the ID doesn't belong to a User

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
  console.log(`🚀 [NOTIFY_START] Recipient: ${userId} | Type: ${type}`);

  try {
    // 1. Try finding target recipient in the User collection first
    let recipient = await User.findById(userId);
    let isUserAdmin = false;

    // 2. Fallback to Admin collection if user was not found
    if (!recipient) {
      console.log(`🔍 [RECIPIENT_CHECK] ID not found in Users, checking Admin collection...`);
      recipient = await Admin.findById(userId);
      if (recipient) {
        isUserAdmin = true;
      }
    }

    if (!recipient) {
      console.error(`❌ [RECIPIENT_NOT_FOUND] No User or Admin exists with ID: ${userId}`);
      return;
    }

    // Standardize firstName variable name for fallback handling
    const recipientName = recipient.firstName || (isUserAdmin ? "Admin" : "User");

    console.log(
      `👤 [RECIPIENT_DATA] Found: ${recipientName} | Email: ${
        recipient.email
      } | Token: ${recipient.expoPushToken ? "Yes" : "No"} | Role: ${isUserAdmin ? "Admin" : "User"}`
    );

    /* ==========================
       🔔 EXPO PUSH NOTIFICATION
    ========================== */
    let pushSuccess = false;
    if (recipient.expoPushToken) {
      console.log(`📲 [PUSH_ATTEMPT] Dispatching to Expo...`);

      try {
        await sendExpoPush({
          expoPushToken: recipient.expoPushToken,
          title,
          body: description,
          data: { type, orderId, userId: recipient._id.toString(), isAdminAlert: isUserAdmin },
        });
        console.log(`✅ [PUSH_SUCCESS] Notification sent to device.`);
        pushSuccess = true;
      } catch (err) {
        console.error(`⚠️ [PUSH_FAILED] Error sending push:`, err.message);
      }
    } else {
      console.log(`⚠️ [PUSH_SKIPPED] Recipient has no expoPushToken registered.`);
    }

    /* ==========================
       📧 EMAIL NOTIFICATION
    ========================== */
    let emailSuccess = false;
    if (recipient.email) {
      console.log(`📩 [EMAIL_ATTEMPT] Sending email via transporter to ${recipient.email}...`);

      try {
        await sendEmailTransporter({
          to: recipient.email,
          subject: `CloneKraft: ${title}`,
          html: `
            <div style="background-color: #f9f9f9; padding: 40px 20px; font-family: Arial, sans-serif;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #eee;">
                <div style="background-color: #000; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                  <h1 style="color: #fff; margin: 0;">CLONEKRAFT</h1>
                </div>
                <div style="padding: 30px;">
                  <h2 style="color: #111;">${title}</h2>
                  <p>Hi ${recipientName},</p>
                  <p>${description}</p>
                </div>
                <div style="padding: 20px; background-color: #fafafa; text-align: center; font-size: 12px; color: #aaa;">
                  &copy; ${new Date().getFullYear()} CloneKraft
                </div>
              </div>
            </div>
          `,
        });
        console.log(`✅ [EMAIL_SUCCESS] Email sent to ${recipient.email}`);
        emailSuccess = true;
      } catch (err) {
        console.error(`⚠️ [EMAIL_FAILED] Error sending email:`, err.message);
      }
    }

    // FINAL SUMMARY CONSOLE LOG
    console.log("📊 [NOTIFICATION_SUMMARY]");
    console.table({
      Recipient: recipientName,
      Type: type,
      IsAdmin: isUserAdmin,
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