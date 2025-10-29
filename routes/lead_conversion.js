// backend/routes/lead_conversion.js
const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/lead/:id/convert-to-booking', async (req, res) => {
  try {
    const { id } = req.params;
    const { kontakt, rechnungsadresse } = req.body;
    console.log("✅ Kontakt erhalten:", kontakt);
    console.log("✅ Rechnungsadresse erhalten:", rechnungsadresse);

    // 1. Lead laden
    const leadResult = await db.query('SELECT * FROM lead WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lead nicht gefunden' });
    }
    const lead = leadResult.rows[0];

    // 🔍 Location zur lead.location_id holen
  let location = null;

if (lead.location_id) {
  const locQ = await db.query(`
    SELECT name, strasse, plz, ort
    FROM location
    WHERE id = $1
  `, [lead.location_id]);

  if (locQ.rows.length > 0) {
    location = locQ.rows[0]; // ✅ keine neue Deklaration mit const/let!
  }
}

    // ✅ Neu: Wenn bereits bestätigt, keine weitere Buchung zulassen
    if (lead.angebot_bestaetigt === true) {
      return res.status(200).json({ success: false, message: 'Angebot wurde bereits bestätigt.' });
    }

    // 2. Artikel holen
    const artikelResult = await db.query('SELECT * FROM lead_artikel WHERE lead_id = $1', [id]);
    const artikel = artikelResult.rows;
    
    // 3. Anschrift vorbereiten
    const anschrift_strasse = rechnungsadresse.anschrift_strasse;
    const anschrift_plz = rechnungsadresse.anschrift_plz;
    const anschrift_ort = rechnungsadresse.anschrift_ort;

    // Rechnungsanschrift: entweder abweichend oder gleich wie normale Anschrift
    const rechnungs_strasse = rechnungsadresse.gleicheRechnungsadresse
      ? anschrift_strasse
      : rechnungsadresse.rechnungsanschrift_strasse;

    const rechnungs_plz = rechnungsadresse.gleicheRechnungsadresse
      ? anschrift_plz
      : rechnungsadresse.rechnungsanschrift_plz;

    const rechnungs_ort = rechnungsadresse.gleicheRechnungsadresse
      ? anschrift_ort
      : rechnungsadresse.rechnungsanschrift_ort;

    // 4. Kunde speichern
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
      anschrift_strasse,
      anschrift_plz,
      anschrift_ort,
      rechnungs_strasse,
      rechnungs_plz,
      rechnungs_ort
    ]);
    const kundeId = kundeResult.rows[0].id;

    // 📆 Buchung erstellen (inkl. Location-Infos und Kundendaten)
const buchungResult = await db.query(`
  INSERT INTO buchung (
    kunde_id,
    status,
    event_datum,
    event_startzeit,
    event_endzeit,
    event_anschrift_ort,
    event_location,
    event_anschrift_strasse,
    event_anschrift_plz,
    lead_id, 
    erstellt_am,
    kunde_vorname,
    kunde_nachname,
    kunde_email,
    kunde_telefon,
    kunde_firma,
    rechnungs_strasse,
    rechnungs_plz,
    rechnungs_ort,
    kundentyp
  )
  VALUES (
    $1,
    'bestätigt',
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    NOW(),
    $10,
    $11,
    $12,
    $13,
    $14,
    $15,
    $16,
    $17,
    $18
  )
  RETURNING id
`, [
  kundeId,
  lead.event_datum,
  lead.event_startzeit,
  lead.event_endzeit,
  location?.ort || null,
  location?.name || null,
  location?.strasse || null,
  location?.plz || null,
  lead.id,
  kontakt.vorname,
  kontakt.nachname,
  kontakt.email,
  kontakt.telefon,
  kontakt.firmenname || null,
  rechnungs_strasse,
  rechnungs_plz,
  rechnungs_ort,
  lead.kundentyp
]);

    
    const buchungId = buchungResult.rows[0].id;

    // 🧾 Artikel zuordnen
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

    // ✅ Lead abschließen
        await db.query(`
      UPDATE lead
      SET status = 'bestaetigt',
          angebot_bestaetigt = true,
          angebot_bestaetigt_am = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ success: true, buchungId });
  } catch (error) {
    console.error('Fehler bei der Lead-Umwandlung:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
