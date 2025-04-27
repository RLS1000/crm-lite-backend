// backend/routes/lead_conversion.js
const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /api/lead/:id/convert-to-booking
router.post('/lead/:id/convert-to-booking', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Lead holen
    const leadResult = await db.query('SELECT * FROM lead WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lead nicht gefunden' });
    }
    const lead = leadResult.rows[0];

    // 2. Artikel des Leads holen
    const artikelResult = await db.query('SELECT * FROM lead_artikel WHERE lead_id = $1', [id]);
    const artikel = artikelResult.rows;

    // 3. Kunde anlegen
    const kundeResult = await db.query(`
      INSERT INTO kunde (vorname, nachname, telefon, email, kundentyp, erstellt_am)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `, [
      lead.vorname,
      lead.nachname,
      lead.telefon,
      lead.email,
      lead.kundentyp
    ]);
    const kundeId = kundeResult.rows[0].id;

    // 4. Buchung anlegen
    const buchungResult = await db.query(`
      INSERT INTO buchung (
        kunde_id,
        status,
        event_datum,
        event_startzeit,
        event_endzeit,
        event_anschrift_ort
      ) VALUES ($1, 'neu', $2, $3, $4, $5)
      RETURNING id
    `, [
      kundeId,
      lead.event_datum,
      lead.event_startzeit,
      lead.event_endzeit,
      lead.event_ort
    ]);
    const buchungId = buchungResult.rows[0].id;

    // 5. Artikel zur Buchung hinzufügen
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

    // 6. Lead auf Status "abgeschlossen" setzen
    await db.query('UPDATE lead SET status = $1 WHERE id = $2', ['abgeschlossen', id]);

    res.json({ success: true, buchungId });
  } catch (error) {
    console.error('Fehler bei der Lead-Umwandlung:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
