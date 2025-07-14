const express = require('express');
const db = require('../db');
const crypto = require('crypto');
const { sendMail } = require('../services/mailService'); // ✅ Mail-Service einbinden

const router = express.Router();

// POST /lead/:id/angebot-link
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

// GET /angebot/:token
router.get('/angebot/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const leadResult = await db.query(`
      SELECT 
        id,
        vorname,
        nachname,
        email,
        telefon,
        firmenname,
        event_datum,
        event_startzeit,
        event_endzeit,
        event_ort,
        kundentyp,
        angebot_bestaetigt
      FROM lead
      WHERE angebot_token = $1
    `, [token]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Angebot nicht gefunden' });
    }

    const lead = leadResult.rows[0];

    const artikelResult = await db.query(`
      SELECT 
        la.id,
        la.artikel_variante_id,
        la.anzahl,
        la.einzelpreis,
        la.bemerkung,
        av.variante_name,
        a.name AS artikel_name
      FROM lead_artikel la
      JOIN artikel_variante av ON la.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE la.lead_id = $1
      ORDER BY
        CASE
          WHEN a.name ILIKE '%fotobox%' THEN 1
          WHEN a.name ILIKE '%hintergrund%' THEN 2
          WHEN a.name ILIKE '%accessoire%' THEN 3
          WHEN a.name ILIKE '%service%' THEN 4
          ELSE 99
        END
    `, [lead.id]);

    res.json({ success: true, lead, artikel: artikelResult.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /angebot/:token/bestaetigen
router.post('/angebot/:token/bestaetigen', async (req, res) => {
  try {
    const { token } = req.params;
    const { rechnungsadresse } = req.body;

    // 1. Lead bestätigen
    await db.query(`
      UPDATE lead
      SET angebot_bestaetigt_am = NOW(),
          angebot_bestaetigt = TRUE,
          status = 'bestaetigt',
          rechnungsadresse = $1
      WHERE angebot_token = $2
    `, [rechnungsadresse, token]);

    // 2. Lead-Daten laden
    const leadResult = await db.query(`
      SELECT id, vorname, nachname, email, firmenname, event_datum, angebot_bestaetigt_am
      FROM lead
      WHERE angebot_token = $1
    `, [token]);

    if (!leadResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Lead nicht gefunden' });
    }

    const lead = leadResult.rows[0];

    // 3. Artikel laden für Platzhalter {{artikel}}
    const artikelResult = await db.query(`
      SELECT 
        a.name AS artikel_name,
        av.variante_name,
        la.anzahl,
        la.einzelpreis
      FROM lead_artikel la
      JOIN artikel_variante av ON la.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE la.lead_id = $1
    `, [lead.id]);

    const artikelHTML = artikelResult.rows.map(a =>
      `• ${a.artikel_name} – ${a.variante_name} (${a.anzahl} × ${a.einzelpreis} €)`
    ).join('<br>');

    // 4. c vorbereiten
    const mailData = {
      name: `${lead.vorname} ${lead.nachname}`,
      vorname: lead.vorname,
      nachname: lead.nachname,
      email: lead.email,
      telefon: lead.telefon,
      firmenname: lead.firmenname,
      kundentyp: lead.kundentyp,
      rechnungsadresse: lead.rechnungsadresse,
      event_datum: lead.event_datum,
      event_startzeit: lead.event_startzeit,
      event_endzeit: lead.event_endzeit,
      event_ort: lead.event_ort,
      bestaetigt_am: lead.angebot_bestaetigt_am,
      artikel: artikelHTML,
      gesamtpreis: summe.toFixed(2) + " €",
      agb_link: 'https://mrknips.de/allgemeine-geschaeftsbedingungen',
      dsgvo_link: 'https://mrknips.de/datenschutzerklaerung',
    };

    const replaceVars = (template, data) =>
      template.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || '');

    // 5. Aktive Templates zum Event „angebot.bestaetigt“ laden
    const eventTemplatesResult = await db.query(`
      SELECT e.*, t.subject, t.content, t.recipient, t.cc, t.bcc, t.reply_to
      FROM email_events e
      JOIN system_templates t ON e.template_key = t.key
      WHERE e.event_key = 'angebot.bestaetigt' AND e.enabled = TRUE
    `);

    const templates = eventTemplatesResult.rows;

    console.log(`📬 Starte Mailversand für ${templates.length} Templates…`);

    // 6. Mailversand pro Template
    for (const tpl of templates) {
      const to = replaceVars(tpl.recipient || lead.email, mailData);
      const subject = replaceVars(tpl.subject, mailData);
      const html = replaceVars(tpl.content, mailData);

      console.log("➡️ Template:", tpl.key);
      console.log("👤 Empfänger:", to);
      console.log("📝 Betreff:", subject);

      await sendMail({
        to,
        subject,
        html,
        bcc: tpl.bcc,
        replyTo: tpl.reply_to
      });
      console.log("✅ Mail versendet:", to);
    }


    res.json({ success: true });
  } catch (error) {
    console.error("❌ Fehler bei Angebotsbestätigung:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /testmail
router.get('/testmail', async (req, res) => {
  try {
    const dummyData = {
      vorname: 'Test',
      nachname: 'Kunde',
      name: 'Test Kunde',
      email: 'info@mrknips.de',
      firmenname: 'Demo GmbH',
      event_datum: '2025-08-01',
      bestaetigt_am: '2025-07-13',
      artikel: '• Fotobox Basic (1 × 299 €)',
      agb_link: 'https://deinedomain.de/agb.pdf',
      dsgvo_link: 'https://deinedomain.de/datenschutz.pdf',
    };

    const eventTemplatesResult = await db.query(`
      SELECT e.*, t.subject, t.content, t.recipient, t.cc, t.bcc, t.reply_to
      FROM email_events e
      JOIN system_templates t ON e.template_key = t.key
      WHERE e.event_key = 'angebot.bestaetigt' AND e.enabled = TRUE
    `);

    const templates = eventTemplatesResult.rows;
    const replaceVars = (template, data) =>
      template.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || '');

    for (const tpl of templates) {
      const to = replaceVars(tpl.recipient || dummyData.email, dummyData);
      const subject = replaceVars(tpl.subject, dummyData);
      const html = replaceVars(tpl.content, dummyData);

      await sendMail({ to, subject, html });
    }

    res.json({ success: true, message: 'Testmail(s) gesendet' });
  } catch (err) {
    console.error("❌ Fehler bei Testmail:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// TEST: /api/testmail
router.get('/testmail', async (req, res) => {
  try {
    console.log("📨 Testmail-Route erreicht!");

    // Dummy-Lead-Daten simulieren
    const lead = {
      vorname: 'Max',
      nachname: 'Mustermann',
      email: 'test@mrknips.de',
      firmenname: 'Testfirma',
      event_datum: '2025-08-01',
      angebot_bestaetigt_am: new Date().toISOString(),
      id: 9999, // Fiktive ID
    };

    // Leerer Artikel (optional)
    const artikelHTML = `• Fotobox Classic – Basic (1 × 199 €)<br>• Hintergrund – Weiß (1 × 0 €)`;

    const mailData = {
      name: `${lead.vorname} ${lead.nachname}`,
      vorname: lead.vorname,
      nachname: lead.nachname,
      email: lead.email,
      firmenname: lead.firmenname,
      event_datum: lead.event_datum,
      bestaetigt_am: lead.angebot_bestaetigt_am,
      artikel: artikelHTML,
      agb_link: 'https://deinedomain.de/agb.pdf',
      dsgvo_link: 'https://deinedomain.de/datenschutz.pdf',
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
      const to = replaceVars(tpl.recipient || lead.email, mailData);
      const subject = replaceVars(tpl.subject, mailData);
      const html = replaceVars(tpl.content, mailData);

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

    res.json({ success: true, info: `Testmail(s) versendet an ${lead.email}` });
  } catch (error) {
    console.error("❌ Fehler bei Testmail:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
