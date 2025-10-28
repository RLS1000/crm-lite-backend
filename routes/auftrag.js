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
        id,
        buchungsnummer,
        kunde_vorname,
        kunde_nachname,
        kunde_firma,
        kunde_email,
        kunde_telefon,
        kundentyp,
        event_datum,
        event_startzeit,
        event_endzeit,
        event_location,
        event_anschrift_strasse,
        event_anschrift_plz,
        event_anschrift_ort,
        rechnungs_name,
        rechnungs_strasse,
        rechnungs_plz,
        rechnungs_ort,
        token_kundenzugang,
        fotos_bereit,
        layout_fertig,
        layout_qr_fertig,
        galerie_aktiv,
        rechnung_fertig,
        rechnung_bezahlt,
        fotodownload_link
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
        ba.id,
        ba.anzahl,
        ba.einzelpreis,
        ba.artikel_variante_id,
        av.variante_name,
        a.id AS artikel_id,
        a.name AS artikel_name,
        ba.bemerkung
      FROM buchung_artikel ba
      JOIN artikel_variante av ON ba.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE ba.buchung_id = $1
      ORDER BY 
        CASE 
          WHEN av.typ = 'Fotobox' THEN 1
          WHEN av.typ = 'Extra' THEN 2
          WHEN av.typ = 'Service' THEN 3
          WHEN av.typ = 'Lieferung' THEN 4
          ELSE 5
        END,
        a.name ASC
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
