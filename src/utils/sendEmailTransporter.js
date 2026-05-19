const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a premium-styled email matching the CloneKraft app UI
 * @param {Object} options - to, subject, html (inner content)
 */
const sendEmailTransporter = async ({ to, subject, html }) => {
  // Wrap the incoming HTML in our master template for UI consistency
  const masterTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">

    </head>
    <body>
      <div class="wrapper">
        <div class="container">      
          <div class="content">
            ${html}
          </div>


        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"CloneKraft" <clonekraft@gmail.com>`,
      to,
      subject,
      html: masterTemplate,
    });

    console.log("✅ Premium Email sent to:", to);
  } catch (error) {
    console.error("❌ Email send failed:", error.message);
  }
};

module.exports = sendEmailTransporter;
