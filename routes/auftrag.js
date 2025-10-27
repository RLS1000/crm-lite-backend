// backend/routes/auftrag.js
const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/auftrag/:token
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // 1) Hole Buchung zur Token-ID
    const bookingQ = await db.query(`
      SELECT
        id, kunde_vorname, kunde_nachname, kunde_email,
        event_datum, event_startzeit, event_endzeit,
        token_kundenzugang, fotolayout_url, qr_layout_url, online_galerie_url
      FROM buchung
      WHERE token_kundenzugang = $1
    `, [token]);

    if (bookingQ.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buchung nicht gefunden' });
    }

    const buchung = bookingQ.rows[0];

    // 2) Lade Artikel zu dieser Buchung
    const artikelQ = await db.query(`
      SELECT
        ba.id, ba.anzahl, ba.einzelpreis, av.variante_name, a.name AS artikel_name,
        ba.bemerkung
      FROM buchung_artikel ba
      JOIN artikel_variante av ON ba.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE ba.buchung_id = $1
    `, [buchung.id]);

    const artikel = artikelQ.rows;

    return res.json({
      success: true,
      buchung,
      artikel
    });
  } catch (error) {
    console.error("❌ Fehler in /api/auftrag/:token:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
