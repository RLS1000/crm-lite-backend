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

    // 3. Buchung erstellen
    const buchungResult = await db.query(`
      INSERT INTO buchung (
        lead_id,
        status,
        vorname,
        nachname,
        email,
        telefon,
        event_datum,
        event_startzeit,
        event_endzeit,
        event_ort,
        firmenname
      ) VALUES ($1, 'neu', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      lead.id,
      lead.vorname,
      lead.nachname,
      lead.email,
      lead.telefon,
      lead.event_datum,
      lead.event_startzeit,
      lead.event_endzeit,
      lead.event_ort,
      lead.firmenname
    ]);

    const buchungId = buchungResult.rows[0].id;

    // 4. Artikel zur Buchung hinzufügen
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

    // 5. Lead auf Status "abgeschlossen" setzen
    await db.query('UPDATE lead SET status = $1 WHERE id = $2', ['abgeschlossen', id]);

    res.json({ success: true, buchungId });
  } catch (error) {
    console.error('Fehler bei der Lead-Umwandlung:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
