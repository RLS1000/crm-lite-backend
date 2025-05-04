const express = require('express');
const db = require('../db');
const crypto = require('crypto');

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

    await db.query(`
      UPDATE lead
      SET angebot_bestaetigt_am = NOW(),
          angebot_bestaetigt = TRUE,
          status = 'bestaetigt',
          rechnungsadresse = $1
      WHERE angebot_token = $2
    `, [rechnungsadresse, token]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
