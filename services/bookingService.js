// services/bookingService.js
const db = require('../db');
const { sendMail } = require('./mailService');

async function convertLeadToBooking({ leadId, kontakt, rechnungsadresse }) {
  // 1. Lead laden
  const leadResult = await db.query('SELECT * FROM lead WHERE id = $1', [leadId]);
  if (!leadResult.rows.length) {
    throw new Error('Lead nicht gefunden');
  }
  const lead = leadResult.rows[0];

  if (lead.angebot_bestaetigt === true) {
    throw new Error('Angebot wurde bereits bestätigt.');
  }

  // 2. Artikel laden
  const artikelResult = await db.query('SELECT * FROM lead_artikel WHERE lead_id = $1', [leadId]);
  const artikel = artikelResult.rows;

  // 3. Rechnungsdaten vorbereiten
  const anschrift = {
    anschrift_strasse: rechnungsadresse.anschrift_strasse,
    anschrift_plz: rechnungsadresse.anschrift_plz,
    anschrift_ort: rechnungsadresse.anschrift_ort,
    rechnungsanschrift_strasse: rechnungsadresse.gleicheRechnungsadresse
      ? rechnungsadresse.anschrift_strasse
      : rechnungsadresse.rechnungsanschrift_strasse,
    rechnungsanschrift_plz: rechnungsadresse.gleicheRechnungsadresse
      ? rechnungsadresse.anschrift_plz
      : rechnungsadresse.rechnungsanschrift_plz,
    rechnungsanschrift_ort: rechnungsadresse.gleicheRechnungsadresse
      ? rechnungsadresse.anschrift_ort
      : rechnungsadresse.rechnungsanschrift_ort
  };

  // 4. Kunden anlegen
  const kundeResult = await db.query(`
    INSERT INTO kunde (
      vorname, nachname, telefon, email, kundentyp, firma,
      anschrift_strasse, anschrift_plz, anschrift_ort,
      rechnungsanschrift_strasse, rechnungsanschrift_plz, rechnungsanschrift_ort,
      erstellt_am
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
    RETURNING id
  `, [
    kontakt.vorname,
    kontakt.nachname,
    kontakt.telefon,
    kontakt.email,
    lead.kundentyp,
    kontakt.firmenname || null,
    anschrift.anschrift_strasse,
    anschrift.anschrift_plz,
    anschrift.anschrift_ort,
    anschrift.rechnungsanschrift_strasse,
    anschrift.rechnungsanschrift_plz,
    anschrift.rechnungsanschrift_ort
  ]);

  const kundeId = kundeResult.rows[0].id;

  // 5. Buchung anlegen
  const buchungResult = await db.query(`
    INSERT INTO buchung (
      kunde_id, status, event_datum, event_startzeit, event_endzeit,
      event_anschrift_ort, lead_id, erstellt_am
    ) VALUES ($1, 'bestaetigt', $2, $3, $4, $5, $6, NOW())
    RETURNING id
  `, [
    kundeId,
    lead.event_datum,
    lead.event_startzeit,
    lead.event_endzeit,
    lead.event_ort,
    lead.id
  ]);
  const buchungId = buchungResult.rows[0].id;

  // 6. Artikel übernehmen
  for (const item of artikel) {
    await db.query(`
      INSERT INTO buchung_artikel (buchung_id, artikel_variante_id, anzahl, einzelpreis, bemerkung)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      buchungId,
      item.artikel_variante_id,
      item.anzahl,
      item.einzelpreis,
      item.bemerkung
    ]);
  }

  // 7. Lead aktualisieren
  await db.query(`
    UPDATE lead
    SET status = 'bestaetigt',
        angebot_bestaetigt = true,
        angebot_bestaetigt_am = NOW()
    WHERE id = $1
  `, [leadId]);

  // 8. Maildaten vorbereiten
  const artikelHTML = artikel.map(a =>
    `• ${a.artikel_name || 'Artikel'} – ${a.variante_name || ''} (${a.anzahl} × ${a.einzelpreis} €)`
  ).join('<br>');

  const mailData = {
    name: `${kontakt.vorname} ${kontakt.nachname}`,
    vorname: kontakt.vorname,
    nachname: kontakt.nachname,
    email: kontakt.email,
    telefon: kontakt.telefon,
    firmenname: kontakt.firmenname,
    kundentyp: lead.kundentyp,
    event_datum: lead.event_datum,
    event_startzeit: lead.event_startzeit,
    event_endzeit: lead.event_endzeit,
    event_ort: lead.event_ort,
    artikel: artikelHTML,
    agb_link: 'https://mrknips.de/allgemeine-geschaeftsbedingungen',
    dsgvo_link: 'https://mrknips.de/datenschutzerklaerung',
  };

  // 9. Templates laden
  const eventTemplatesResult = await db.query(`
    SELECT e.*, t.subject, t.content, t.recipient, t.cc, t.bcc, t.reply_to
    FROM email_events e
    JOIN system_templates t ON e.template_key = t.key
    WHERE e.event_key = 'angebot.bestaetigt' AND e.enabled = TRUE
  `);
  const templates = eventTemplatesResult.rows;
  console.log(`📦 ${templates.length} Templates für angebot.bestaetigt geladen`);
if (templates.length === 0) {
  console.warn("⚠️ Keine aktiven Templates gefunden!");
}

  // 10. Mailversand
  for (const tpl of templates) {
    const replaceVars = (template, data) =>
      template.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || '');

    const to = replaceVars(tpl.recipient || kontakt.email, mailData);
    const subject = replaceVars(tpl.subject, mailData);
    const html = replaceVars(tpl.content, mailData);

    await sendMail({
      to,
      subject,
      html,
      bcc: tpl.bcc,
      replyTo: tpl.reply_to
    });
  }

  return { success: true, buchungId };
}

module.exports = { convertLeadToBooking };
