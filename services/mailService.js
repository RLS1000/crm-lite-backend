// crm-lite-backend/services/mailService.js
const nodemailer = require("nodemailer");
const db = require("../db");

async function getSMTPConfig() {
  const result = await db.query(`
    SELECT key, value FROM system_config 
    WHERE key IN (
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'email_from', 'email_betreiber'
    )
  `);

  const config = {};
  result.rows.forEach(({ key, value }) => {
    config[key] = value;
  });

  return {
    host: config.smtp_host,
    port: parseInt(config.smtp_port, 10),
    secure: config.smtp_secure === "true",
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
    from: config.email_from,
    empfaenger_betreiber: config.email_betreiber,
  };
}

async function sendMail({ to, subject, html }) {
  const config = await getSMTPConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  return transporter.sendMail({
    from: config.from,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };