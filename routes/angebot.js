// backend/routes/angebot.js
const express = require('express');
const db = require('../db');
const crypto = require('crypto');
const { convertLeadToBooking } = require('../services/bookingService');
const { sendMail } = require('../services/mailService'); // ✅ Mailversand für Testmail

const router = express.Router();

router.post('/lead/:id/angebot-link', async (req, res) => {
  try {
    const { id } = req.params;
    const token = crypto.randomUUID();

    await db.query(`
      UPDATE lead
      SET angebot_token = $1,
          angebot_erstellt_am = NOW(),
          status = 'angebot'
      WHERE id = $2
    `, [token, id]);

    res.json({ success: true, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/angebot/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const leadResult = await db.query(`
      SELECT 
        id, vorname, nachname, email, telefon, firmenname,
        event_datum, event_startzeit, event_endzeit, event_ort,
        kundentyp, angebot_bestaetigt
      FROM lead
      WHERE angebot_token = $1
    `, [token]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Angebot nicht gefunden' });
    }

    const lead = leadResult.rows[0];

    const artikelResult = await db.query(`
      SELECT 
        la.id, la.artikel_variante_id, la.anzahl, la.einzelpreis, la.bemerkung,
        av.variante_name, a.name AS artikel_name
      FROM lead_artikel la
      JOIN artikel_variante av ON la.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE la.lead_id = $1
    `, [lead.id]);

    res.json({ success: true, lead, artikel: artikelResult.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Neu: Bestätigung und Umwandlung zentral
router.post('/angebot/:token/bestaetigen', async (req, res) => {
  try {
    const { token } = req.params;
    const { kontakt, rechnungsadresse } = req.body;

    const leadResult = await db.query('SELECT id FROM lead WHERE angebot_token = $1', [token]);
    if (!leadResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Lead nicht gefunden' });
    }

    const leadId = leadResult.rows[0].id;

    const result = await convertLeadToBooking({ leadId, kontakt, rechnungsadresse });

    res.json(result);
  } catch (error) {
    console.error("❌ Fehler bei Angebotsbestätigung:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/testmail
router.get('/testmail', async (req, res) => {
  try {
    console.log("📨 Testmail-Route erreicht!");

    const dummyData = {
      name: 'Max Mustermann',
      vorname: 'Max',
      nachname: 'Mustermann',
      email: 'test-tm7msz9c7@srv1.mail-tester.com',
      telefon: '0123456789',
      firmenname: 'Demo GmbH',
      kundentyp: 'firma',
      event_datum: '2025-08-01',
      event_startzeit: '18:00',
      event_endzeit: '00:00',
      event_ort: 'Berlin',
      artikel: '• Fotobox – Classic (1 × 299 €)<br>• Hintergrund – Weiß (1 × 0 €)',
      agb_link: 'https://mrknips.de/allgemeine-geschaeftsbedingungen',
      dsgvo_link: 'https://mrknips.de/datenschutzerklaerung',
    };

    const replaceVars = (template, data) =>
      template.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || '');

    const tplResult = await db.query(`
      SELECT e.*, t.subject, t.content, t.recipient, t.cc, t.bcc, t.reply_to
      FROM email_events e
      JOIN system_templates t ON e.template_key = t.key
      WHERE e.event_key = 'angebot.bestaetigt' AND e.enabled = TRUE
    `);

    const templates = tplResult.rows;

    for (const tpl of templates) {
      const to = replaceVars(tpl.recipient || dummyData.email, dummyData);
      const subject = replaceVars(tpl.subject, dummyData);
      const html = replaceVars(tpl.content, dummyData);

      console.log(`📤 Sende Test-Mail an: ${to}`);

      await sendMail({
        to,
        subject,
        html,
        bcc: tpl.bcc,
        replyTo: tpl.reply_to
      });

      console.log(`✅ Testmail erfolgreich an ${to} gesendet.`);
    }

    res.json({ success: true, info: `Testmail(s) versendet.` });
  } catch (error) {
    console.error("❌ Fehler bei Testmail:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
