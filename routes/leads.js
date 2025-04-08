const express = require('express');
const router = express.Router();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const db = require('../db');
const generateLeadId = require('../utils/generateId');

router.post('/', async (req, res) => {
  if (req.body.secret !== WEBHOOK_SECRET) {
      console.warn('❌ Ungültiger Webhook-Zugriff:', req.body.secret);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
  try {
    const {
      vorname,
      nachname,
      email,
      telefon,
      event_datum,
      event_startzeit,
      event_endzeit,
      event_ort,
      kundentyp,
      firmenname,
      gaesteanzahl,
      kontaktwunsch,
      wichtig_raw,
      extras_raw,
      preisfragen_raw,
      anlass_raw,
      erfahrung_raw,
      preistyp_raw,
      ziel_raw,
      quelle_raw,
      freitext_kunde_raw,
      intern_kommentar,
      ai_typ,
      ai_kommentar,
      ai_score_json
    } = req.body;

    const external_id = generateLeadId(); // Optional

    await db.query(
      `INSERT INTO lead (
        external_id, vorname, nachname, email, telefon,
        event_datum, event_startzeit, event_endzeit, event_ort,
        kundentyp, firmenname, gaesteanzahl, kontaktwunsch,
        wichtig_raw, extras_raw, preisfragen_raw, anlass_raw,
        erfahrung_raw, preistyp_raw, ziel_raw, quelle_raw,
        freitext_kunde_raw, intern_kommentar,
        ai_typ, ai_kommentar, ai_score_json
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23,
        $24, $25, $26
      )`,
      [
        external_id, vorname, nachname, email, telefon,
        event_datum, event_startzeit, event_endzeit, event_ort,
        kundentyp, firmenname, gaesteanzahl, kontaktwunsch,
        wichtig_raw, extras_raw, preisfragen_raw, anlass_raw,
        erfahrung_raw, preistyp_raw, ziel_raw, quelle_raw,
        freitext_kunde_raw, intern_kommentar,
        ai_typ, ai_kommentar, ai_score_json
      ]
    );

    res.status(201).json({ message: 'Lead gespeichert', lead_id: external_id });
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;