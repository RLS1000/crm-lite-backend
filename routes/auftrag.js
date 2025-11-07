// .backend/routes/auftrag.js
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
        fotodownload_link,
        fotolayout_style,
        fotolayout_text,
        fotolayout_datum,
        fotolayout_farbe,
        fotolayout_link,
        fotolayout_kundenfreigabe,
        fotolayout_freigabe_am
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

// PATCH /api/auftrag/:token/layout
router.patch('/:token/layout', async (req, res) => {
  try {
    const { token } = req.params;
    const {
      style,
      farbe,
      text,
      datum,
      kundenfreigabe
    } = req.body;

    // Optional: Log zur Prüfung
    console.log("📥 Layout-Update empfangen:", { style, farbe, text, datum, kundenfreigabe });

    // 1) Buchung zur Token-ID finden
    const buchungQ = await db.query(`
      SELECT id FROM buchung WHERE token_kundenzugang = $1
    `, [token]);

    if (buchungQ.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Buchung nicht gefunden" });
    }

    const buchungId = buchungQ.rows[0].id;

// 2) Layout-Felder nur aktualisieren, wenn sie übergeben wurden
    const updates = [];
    const values = [];
    let index = 1;

    if (style !== undefined) {
      updates.push(`fotolayout_style = $${index++}`);
      values.push(style);
    }
    if (farbe !== undefined) {
      updates.push(`fotolayout_farbe = $${index++}`);
      values.push(farbe);
    }
    if (text !== undefined) {
      updates.push(`fotolayout_text = $${index++}`);
      values.push(text);
    }
    if (datum !== undefined) {
      updates.push(`fotolayout_datum = $${index++}`);
      values.push(datum);
    }
    if (kundenfreigabe !== undefined) {
      updates.push(`fotolayout_kundenfreigabe = $${index++}`);
      values.push(kundenfreigabe);

      // Wenn Kundenfreigabe auf TRUE gesetzt wird → Freigabedatum automatisch eintragen
      updates.push(`fotolayout_freigabe_am = CASE
        WHEN $${index - 1} = TRUE AND fotolayout_freigabe_am IS NULL THEN NOW()
        ELSE fotolayout_freigabe_am
      END`);
    }

    // Wenn gar nichts übergeben wurde, Abbruch
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Keine Felder zum Aktualisieren übergeben."
      });
    }

    // Buchungs-ID als letzter Wert
    values.push(buchungId);

    // Dynamisches SQL-Update zusammenbauen
    const updateQuery = `
      UPDATE buchung
      SET ${updates.join(", ")}
      WHERE id = $${index}
    `;

    await db.query(updateQuery, values);

    return res.json({ success: true, message: "Layout erfolgreich gespeichert (selektives Update)." });

     } catch (error) {
    console.error("❌ Fehler beim Layout-Speichern:", error);
    res.status(500).json({ success: false, error: error.message });
    
  }
});

router.patch("/:token/rechnung", async (req, res) => {
  const { token } = req.params;
  const { name, strasse, plz, ort, kostenstelle } = req.body;

  const result = await db.query(`
    UPDATE buchung
    SET rechnungs_name = $1,
        rechnungs_strasse = $2,
        rechnungs_plz = $3,
        rechnungs_ort = $4,
        rechnungs_kostenstelle = $5,
        rechnungsadresse_geaendert_am = NOW()
    WHERE token_kundenzugang = $6
    RETURNING id
  `, [name, strasse, plz, ort, kostenstelle, token]);

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Buchung nicht gefunden" });
  }

  res.json({ success: true });
});
    
module.exports = router;
