// services/bookingService.js
const db = require('../db');
const { sendMail } = require('./mailService');

async function testBookingMail() {
  const mailData = {
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

  console.log("🚀 Testmail im bookingService gestartet…");

  const tplResult = await db.query(`
    SELECT e.*, t.subject, t.content, t.recipient, t.cc, t.bcc, t.reply_to
    FROM email_events e
    JOIN system_templates t ON e.template_key = t.key
    WHERE e.event_key = 'angebot.bestaetigt' AND e.enabled = TRUE
  `);

  const templates = tplResult.rows;

  for (const tpl of templates) {
    const replaceVars = (template, data) =>
      template.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || '');

    const to = replaceVars(tpl.recipient || mailData.email, mailData);
    const subject = replaceVars(tpl.subject, mailData);
    const html = replaceVars(tpl.content, mailData);

    console.log(`📤 (Service) Sende Test-Mail an: ${to}`);

    await sendMail({ to, subject, html, bcc: tpl.bcc, replyTo: tpl.reply_to });

    console.log(`✅ (Service) Testmail erfolgreich an ${to} gesendet.`);
  }

  return { success: true, info: "Testmail(s) versendet über bookingService." };
}

async function convertLeadToBooking({ leadId, kontakt, rechnungsadresse }) {
  console.log("🚀 convertLeadToBooking gestartet mit:", { leadId, kontakt, rechnungsadresse });

  // 1. Lead laden
  const leadResult = await db.query('SELECT * FROM lead WHERE id = $1', [leadId]);
  if (!leadResult.rows.length) throw new Error('Lead nicht gefunden');
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

  // 8.5 Location laden, falls vorhanden
let location = null;
if (lead.location_id) {
  const locQ = await db.query(`
    SELECT name, strasse, plz, ort
    FROM location
    WHERE id = $1
  `, [lead.location_id]);
  if (locQ.rows.length) {
    location = locQ.rows[0];
  }
}

  // 5. Buchung anlegen
  const buchungResult = await db.query(`
  INSERT INTO buchung (
    kunde_id, status,
    event_datum, event_startzeit, event_endzeit,
    event_anschrift_ort, event_location,
    event_anschrift_strasse, event_anschrift_plz,
    hinweistext_kunde, intern_kommentar,
    lead_id, erstellt_am,

    kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, kunde_firma,
    rechnungs_strasse, rechnungs_plz, rechnungs_ort,
    kundentyp, anlass_raw, kontaktwunsch
  )
  VALUES (
    $1, 'bestätigt',
    $2, $3, $4,
    $5, $6,
    $7, $8,
    $9, $10,
    $11, NOW(),
    $12, $13, $14, $15, $16,
    $17, $18, $19,
    $20, $21, $22
  )
  RETURNING id
`, [
  kundeId,
  lead.event_datum,
  lead.event_startzeit,
  lead.event_endzeit,
  lead.event_ort,                 // event_anschrift_ort
  location?.name || null,        // event_location
  location?.strasse || null,     // event_anschrift_strasse
  location?.plz || null,         // event_anschrift_plz
  lead.hinweistext_kunde,
  lead.intern_kommentar,
  lead.id,
  kontakt.vorname,
  kontakt.nachname,
  kontakt.email,
  kontakt.telefon,
  kontakt.firmenname || null,
  anschrift.rechnungsanschrift_strasse,
  anschrift.rechnungsanschrift_plz,
  anschrift.rechnungsanschrift_ort,
  lead.kundentyp,
  lead.anlass_raw,
  lead.kontaktwunsch
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

  // 8. ✨ Buchung + Kunde erneut laden
  const buchungData = await db.query(`
    SELECT b.*, 
           k.vorname, k.nachname, k.email, k.telefon, k.kundentyp, k.firma,
           k.anschrift_strasse, k.anschrift_plz, k.anschrift_ort,
           k.rechnungsanschrift_strasse, k.rechnungsanschrift_plz, k.rechnungsanschrift_ort
    FROM buchung b
    JOIN kunde k ON b.kunde_id = k.id
    WHERE b.id = $1
  `, [buchungId]);
  const buchung = buchungData.rows[0];

  const buchungArtikelResult = await db.query(`
    SELECT ba.*, av.variante_name, a.name AS artikel_name
    FROM buchung_artikel ba
    JOIN artikel_variante av ON ba.artikel_variante_id = av.id
    JOIN artikel a ON av.artikel_id = a.id
    WHERE ba.buchung_id = $1
  `, [buchungId]);
  const buchungArtikel = buchungArtikelResult.rows;

  const artikelTypReihenfolge = {
    'Fotobox': 1,
    'Extra': 2,
    'Service': 3,
    'Lieferung': 4
    };

    buchungArtikel.sort((a, b) => {
      const rA = artikelTypReihenfolge[a.typ] || 99;
      const rB = artikelTypReihenfolge[b.typ] || 99;
      return rA - rB || a.artikel_name.localeCompare(b.artikel_name);
    });

  

  // 9. ✉️ Maildaten vorbereiten
  const artikelHTML = buchungArtikel.map(a =>
    `• ${a.artikel_name} – ${a.variante_name} (${a.anzahl} × ${parseFloat(a.einzelpreis).toFixed(2)} €)`
  ).join('<br>');

  const artikelSumme = buchungArtikel.reduce((sum, a) => {
  const preis = parseFloat(a.einzelpreis) || 0;
  const anzahl = a.anzahl || 0;
  return sum + (preis * anzahl);
  }, 0);

  const mailData = {
    name: `${buchung.vorname} ${buchung.nachname}`,
    vorname: buchung.vorname,
    nachname: buchung.nachname,
    email: buchung.email,
    telefon: buchung.telefon,
    firmenname: buchung.firma,
    kundentyp: buchung.kundentyp,

    anschrift_strasse: buchung.anschrift_strasse,
    anschrift_plz: buchung.anschrift_plz,
    anschrift_ort: buchung.anschrift_ort,
    rechnungsanschrift_strasse: buchung.rechnungsanschrift_strasse,
    rechnungsanschrift_plz: buchung.rechnungsanschrift_plz,
    rechnungsanschrift_ort: buchung.rechnungsanschrift_ort,

    event_datum: new Date(buchung.event_datum).toLocaleDateString("de-DE"),
    event_startzeit: buchung.event_startzeit?.slice(0, 5),
    event_endzeit: buchung.event_endzeit?.slice(0, 5),
    event_ort: buchung.event_anschrift_ort,

    artikel: artikelHTML,
    artikel_summe: artikelSumme.toFixed(2),

     // 📍 Neue Felder für Location (optional)
    location_name: location?.name || '',
    location_strasse: location?.strasse || '',
    location_plz: location?.plz || '',
    location_ort: location?.ort || '',

    agb_link: 'https://mrknips.de/allgemeine-geschaeftsbedingungen',
    dsgvo_link: 'https://mrknips.de/datenschutzerklaerung',
  };

  // 10. Templates laden
  const eventTemplatesResult = await db.query(`
    SELECT e.*, t.subject, t.content, t.recipient, t.cc, t.bcc, t.reply_to
    FROM email_events e
    JOIN system_templates t ON e.template_key = t.key
    WHERE e.event_key = 'angebot.bestaetigt' AND e.enabled = TRUE
  `);
  const templates = eventTemplatesResult.rows;

  // 11. 📬 Mailversand (optional mit Delay)
  for (const tpl of templates) {
    const replaceVars = (template, data) =>
      template.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || '');

    const to = replaceVars(tpl.recipient || mailData.email, mailData);
    const subject = replaceVars(tpl.subject, mailData);
    const html = replaceVars(tpl.content, mailData);

    console.log("📤 Sende Bestätigung an:", to);

    // ⏳ Optional: Verzögerung per setTimeout
    // await new Promise(resolve => setTimeout(resolve, 60000)); // ← 60s Delay

    await sendMail({
      to,
      subject,
      html,
      bcc: tpl.bcc,
      replyTo: tpl.reply_to
    });
  }

//  console.log("📨 Buchung erfolgreich – führe testBookingMail() zu Debugzwecken aus…");
  
//  try {
//  console.log("📨 Buchung erfolgreich – führe testBookingMail() zu Debugzwecken aus…");
//  await testBookingMail();
//  console.log("✅ testBookingMail() erfolgreich beendet.");
//} catch (err) {
//  console.warn("⚠️ Fehler bei testBookingMail():", err.message);
//}

  
  return { success: true, buchungId };
}

module.exports = { convertLeadToBooking, testBookingMail };
