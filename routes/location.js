// backend/routes/location.js
const express = require('express');
const db = require('../db');

const router = express.Router();

// 📥 Neue Location anlegen
router.post('/locations', async (req, res) => {
  try {
    const { name, strasse, plz, ort, ansprechpartner, telefon, hinweis } = req.body;

    const result = await db.query(`
      INSERT INTO location (name, strasse, plz, ort, ansprechpartner, telefon, hinweis)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, strasse, plz, ort, ansprechpartner, telefon, hinweis]);

    res.status(201).json({ success: true, location: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ success: false, message: 'Location bereits vorhanden.' });
    } else {
      console.error('Fehler beim Anlegen der Location:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// 📤 Alle Locations abrufen (z. B. für Dropdowns)
router.get('/locations', async (_req, res) => {
  try {
    const result = await db.query(`SELECT id, name, ort FROM location ORDER BY name ASC`);
    res.json({ success: true, locations: result.rows });
  } catch (error) {
    console.error('Fehler beim Laden der Locations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
