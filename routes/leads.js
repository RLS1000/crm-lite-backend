// backend/routes/leads.js
console.log("✅ Webhook wurde erreicht!");

const express = require('express');
const router = express.Router();

const db = require('../db');
const { generateLeadId, generateGroupId } = require('../utils/generateId');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * POST /leads/
 * Webhook/Intake: Neuen Lead anlegen
 */
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

    const external_id = generateLeadId();     // z.B. L-...
    const group_id    = generateGroupId();    // z.B. GL-...

    await db.query(
      `INSERT INTO lead (
        external_id, group_id, vorname, nachname, email, telefon,
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
        external_id, group_id, vorname, nachname, email, telefon,
        event_datum, event_startzeit, event_endzeit, event_ort,
        kundentyp, firmenname, gaesteanzahl, kontaktwunsch,
        wichtig_raw, extras_raw, preisfragen_raw, anlass_raw,
        erfahrung_raw, preistyp_raw, ziel_raw, quelle_raw,
        freitext_kunde_raw, intern_kommentar,
        ai_typ, ai_kommentar, ai_score_json
      ]
    );

    return res.status(201).json({ message: 'Lead gespeichert', lead_id: external_id, group_id });
  } catch (error) {
    console.error('❌ Fehler beim Speichern:', error);
    return res.status(500).json({ error: error.message || 'Serverfehler' });
  }
});

/**
 * GET /leads/group/:groupId
 * Alle Leads einer Gruppe abrufen (für Angebotslink mit mehreren Tagen)
 * 👉 MUSS vor "/:id" stehen!
 */
router.get('/group/:groupId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM lead WHERE group_id = $1 ORDER BY event_datum ASC, event_startzeit ASC',
      [req.params.groupId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('❌ Fehler beim Lesen der Gruppe:', err);
    return res.status(500).json({ error: err.message || 'Serverfehler beim Lesen der Gruppe' });
  }
});

/**
 * POST /leads/:id/clone
 * Lead duplizieren:
 * - neue external_id (L-…)
 * - group_id des Originals übernehmen (oder GL neu vergeben, wenn leer)
 * - Vorname mit " (Kopie)" markieren
 */
// POST /leads/:id/clone
router.post('/:id/clone', async (req, res) => {
  const leadId = req.params.id;
  if (!/^\d+$/.test(String(leadId))) {
    return res.status(400).json({ error: 'Bad Request: ungültige Lead-ID' });
  }

  try {
    // Original holen
    const { rows } = await db.query('SELECT * FROM lead WHERE id = $1', [leadId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead nicht gefunden' });
    }
    const original = rows[0];

    // group_id sicherstellen – jetzt mit GL-Schema
    let groupId = original.group_id;
    if (!groupId) {
      // ⬇️ neue Group-ID im GL-Format
      const generateGroupId = require('../utils/generateId').generateGroupId || require('../utils/generateId');
      groupId = generateGroupId('GL');
      await db.query('UPDATE lead SET group_id = $1 WHERE id = $2', [groupId, leadId]);
    }

    // Fallbacks für mögliche NOT NULLs / Defaults
    const status = original.status || 'neu';
    const erstellt_am = new Date(); // falls keine DB-Default gesetzt

    // Klon anlegen (✅ status & erstellt_am explizit setzen)
    const insertSql = `
      INSERT INTO lead (
        external_id, group_id, status,
        vorname, nachname, email, telefon,
        event_datum, event_startzeit, event_endzeit, event_ort,
        kundentyp, firmenname, gaesteanzahl, kontaktwunsch,
        wichtig_raw, extras_raw, preisfragen_raw, anlass_raw,
        erfahrung_raw, preistyp_raw, ziel_raw, quelle_raw,
        freitext_kunde_raw, intern_kommentar,
        ai_typ, ai_kommentar, ai_score_json,
        erstellt_am, location_id
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25,
        $26, $27, $28,
        $29, $30
      )
      RETURNING id, external_id, group_id, status
    `;

    const params = [
      // IDs
      require('../utils/generateId')(),      // neue external_id im L-Schema
      groupId,
      status,
      // Person
      (original.vorname || '') + ' (Kopie)',
      original.nachname,
      original.email,
      original.telefon,
      // Event
      original.event_datum,
      original.event_startzeit,
      original.event_endzeit,
      original.event_ort,
      // Meta
      original.kundentyp,
      original.firmenname,
      original.gaesteanzahl,
      original.kontaktwunsch,
      original.wichtig_raw,
      original.extras_raw,
      original.preisfragen_raw,
      original.anlass_raw,
      original.erfahrung_raw,
      original.preistyp_raw,
      original.ziel_raw,
      original.quelle_raw,
      original.freitext_kunde_raw,
      original.intern_kommentar,
      original.ai_typ,
      original.ai_kommentar,
      original.ai_score_json,
      // Zeiten / Relationen
      erstellt_am,
      original.location_id || null
    ];

    const { rows: cloned } = await db.query(insertSql, params);

    return res.status(201).json({
      message: 'Lead erfolgreich geklont',
      lead: cloned[0],
      group_id: groupId
    });
  } catch (err) {
    console.error('❌ Fehler beim Klonen:', err); // <-- vollständiges Logging
    // Gebe die eigentliche DB-Message zurück, damit wir sehen was los ist
    return res.status(500).json({ error: err.message });
  }
});


/**
 * GET /leads/:id
 * Lead abrufen (praktisch für Appsmith-Detailansicht)
 * 👉 Muss NACH allen spezifischeren Routen kommen
 */
router.get('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      return res.status(400).json({ error: 'Bad Request: ungültige Lead-ID' });
    }
    const { rows } = await db.query('SELECT * FROM lead WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Lead nicht gefunden' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('❌ Fehler beim Lesen:', err);
    return res.status(500).json({ error: err.message || 'Serverfehler beim Lesen' });
  }
});

module.exports = router;
