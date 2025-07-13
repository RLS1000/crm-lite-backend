const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendeAngebotsBestaetigungsMail({ empfaenger, betreff, html }) {
  return transporter.sendMail({
    from: `"Mr. Knips" <${process.env.SMTP_USER}>`,
    to: empfaenger,
    subject: betreff,
    html,
  });
}

module.exports = {
  sendeAngebotsBestaetigungsMail,
};