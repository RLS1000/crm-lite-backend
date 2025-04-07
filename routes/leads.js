const express = require('express');
const router = express.Router();
const db = require('../db');

// Einfacher Insert mit allen Pflichtfeldern
router.post('/', async (req, res) => {
  try {
    const {
      vorname,
      nachname,
      email,
      telefon,
      event_datum,
      event_ort,
      freitext_kunde_raw
    } = req.body;

    await db.query(
      `INSERT INTO lead (
        vorname, nachname, email, telefon, event_datum, event_ort, freitext_kunde_raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [vorname, nachname, email, telefon, event_datum, event_ort, freitext_kunde_raw]
    );

    res.status(201).json({ message: 'Lead gespeichert' });
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
