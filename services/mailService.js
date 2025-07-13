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
    from: config.email_from || config.smtp_user, // 👈 Fallback: Falls email_from fehlt
    empfaenger_betreiber: config.email_betreiber,
  };
}

async function sendMail({ to, subject, html, bcc, replyTo }) {
  try {
    const config = await getSMTPConfig();

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: true,       // ✅ SMTP-Verbindung loggen
      debug: true         // ✅ genaue SMTP-Kommunikation zeigen
    });

    const mailOptions = {
      from: config.from,
      to,
      subject,
      html,
    };

    if (bcc) mailOptions.bcc = bcc;
    if (replyTo) mailOptions.replyTo = replyTo;

    console.log("📤 Sende Mail an:", to);
    console.log("📝 Betreff:", subject);

    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Mail gesendet:", result.messageId);

    return result;
  } catch (error) {
    console.error("❌ Fehler beim Senden der Mail:", error.message);
    throw error;
  }
}

module.exports = { sendMail };
