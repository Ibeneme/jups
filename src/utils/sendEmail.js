const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const isReset = purpose === "reset";
  const title = isReset ? "Reset Password" : "Verify Email";
  const accentColor = "#D4AF37"; // A gold/bronze accent to match "Master Craftsmanship"

  const leadText = isReset
    ? "A password reset was requested for your account."
    : "Welcome to CloneKraft. Let's get your account verified.";

  return {
    subject: `[CloneKraft] ${title} - ${otp}`,
    text: `${leadText} Your code is: ${otp}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; }
          .logo { font-size: 24px; font-weight: bold; color: #1a1a1a; letter-spacing: -1px; margin-bottom: 30px; }
          .accent { color: ${accentColor}; }
          .content-box { border-top: 2px solid #f4f4f4; padding-top: 30px; }
          .title { font-size: 22px; color: #1a1a1a; margin-bottom: 15px; }
          .message { font-size: 16px; color: #444; line-height: 1.6; margin-bottom: 30px; }
          .otp-container { background-color: #f9f9f9; border-radius: 12px; padding: 30px; text-align: center; border: 1px solid #eee; }
          .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1a1a1a; margin: 0; }
          .footer { margin-top: 40px; font-size: 12px; color: #aaaaaa; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">Clone<span class="accent">Kraft</span></div>
          
          <div class="content-box">
            <h1 class="title">${title}</h1>
            <p class="message">${leadText}<br/>Use the secure code below to proceed.</p>
            
            <div class="otp-container">
              <h2 class="otp-code">${otp}</h2>
            </div>
            
            <div class="footer">
              <p>This code will expire in 10 minutes. <br/>
              If you did not request this, please ignore this email or contact support.</p>
              <p>&copy; ${new Date().getFullYear()} CloneKraft. Built reliably across Africa.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

const sendEmail = async ({ to, otp, purpose }) => {
  try {
    const template = getOtpEmailTemplate(otp, purpose);

    const info = await transporter.sendMail({
      from: `"CloneKraft" <clonekraft@gmail.com>`,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    console.log(`✨ [Email Sent] Target: ${to} | ID: ${info.messageId}`);
  } catch (error) {
    console.error("🔥 [Email Error]:", error.message);
    throw new Error("Could not deliver OTP email.");
  }
};

module.exports = sendEmail;
