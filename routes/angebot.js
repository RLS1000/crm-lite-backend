// backend/routes/angebot.js
const express = require('express');
const db = require('../db');
const crypto = require('crypto');
const { convertLeadToBooking } = require('../services/bookingService');
const { sendMail } = require('../services/mailService'); // ✅ Mailversand für Testmail
const { testBookingMail } = require('../services/bookingService');

const router = express.Router();

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

router.get('/angebot/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const leadResult = await db.query(`
      SELECT 
        id, vorname, nachname, email, telefon, firmenname,
        event_datum, event_startzeit, event_endzeit, event_ort,
        kundentyp, angebot_bestaetigt, angebot_bestaetigt_am, group_id
      FROM lead
      WHERE angebot_token = $1
    `, [token]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Angebot nicht gefunden' });
    }

    const lead = leadResult.rows[0];

    const artikelResult = await db.query(`
      SELECT 
        la.id, la.artikel_variante_id, la.anzahl, la.einzelpreis, la.bemerkung,
        av.variante_name, a.name AS artikel_name
      FROM lead_artikel la
      JOIN artikel_variante av ON la.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE la.lead_id = $1
    `, [lead.id]);

    res.json({ success: true, lead, artikel: artikelResult.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Bestätigung: Einzel- oder Gruppen-Leads
router.post('/angebot/:token/bestaetigen', async (req, res) => {
  console.log("📩 POST /angebot/:token/bestaetigen erreicht mit:", req.params, req.body);
  try {
    const { token } = req.params;
    const { kontakt, rechnungsadresse, selectedLeadIds, selectAllGroup } = req.body || {};

    // 1) Leit-Lead über Token holen (liefert id + group_id)
    const leadByToken = await db.query(
      `SELECT id, group_id, angebot_bestaetigt
         FROM lead
        WHERE angebot_token = $1`,
      [token]
    );
    if (!leadByToken.rows.length) {
      return res.status(404).json({ success: false, message: 'Lead nicht gefunden' });
    }
    const tokenLead = leadByToken.rows[0];

    // 2) Ermitteln, welche Leads bestätigt werden sollen
    let candidates = [];

    if (Array.isArray(selectedLeadIds) && selectedLeadIds.length > 0) {
      // a) explizit ausgewählte Leads – müssen zur gleichen Gruppe gehören (oder Single ohne group_id)
      const ids = selectedLeadIds.map(Number).filter(n => Number.isInteger(n));

      if (!ids.length) {
        return res.status(400).json({ success: false, message: 'Keine gültigen Lead-IDs übergeben.' });
      }

      if (tokenLead.group_id) {
        const q = await db.query(
          `SELECT id, group_id, angebot_bestaetigt
             FROM lead
            WHERE id = ANY($1::int[])
              AND group_id = $2`,
          [ids, tokenLead.group_id]
        );
        candidates = q.rows;
      } else {
        // Token-Lead hat keine group_id -> nur sich selbst zulassen
        const q = await db.query(
          `SELECT id, group_id, angebot_bestaetigt
             FROM lead
            WHERE id = ANY($1::int[])
              AND id = $2`,
          [ids, tokenLead.id]
        );
        candidates = q.rows;
      }

      if (!candidates.length) {
        return res.status(400).json({ success: false, message: 'Ausgewählte Leads gehören nicht zur Gruppe oder existieren nicht.' });
      }
    } else if (selectAllGroup === true && tokenLead.group_id) {
      // b) komplette Gruppe (alle offenen)
      const q = await db.query(
        `SELECT id, group_id, angebot_bestaetigt
           FROM lead
          WHERE group_id = $1
          ORDER BY event_datum ASC, event_startzeit ASC`,
        [tokenLead.group_id]
      );
      candidates = q.rows;
    } else {
      // c) Fallback: nur den Lead des Tokens bestätigen
      candidates = [tokenLead];
    }

    // 3) Bereits bestätigte Leads herausfiltern
    const toConvert = candidates.filter(l => l.angebot_bestaetigt !== true);
    const alreadyDone = candidates.filter(l => l.angebot_bestaetigt === true).map(l => l.id);

    if (!toConvert.length) {
      return res.status(200).json({
        success: false,
        message: 'Alle ausgewählten Leads sind bereits bestätigt.',
        alreadyConfirmed: alreadyDone
      });
    }

    // 4) Konvertierung nacheinander ausführen (bewusst sequenziell)
    const results = [];
    for (const l of toConvert) {
      try {
        const result = await convertLeadToBooking({ leadId: l.id, kontakt, rechnungsadresse });
        results.push({ leadId: l.id, ...result });
      } catch (err) {
        console.error(`❌ convertLeadToBooking failed for lead ${l.id}:`, err.message);
        results.push({ leadId: l.id, success: false, error: err.message });
      }
    }

    // 5) Antwort zusammenfassen
    const ok = results.filter(r => r.success).map(r => ({ leadId: r.leadId, buchungId: r.buchungId }));
    const failed = results.filter(r => !r.success).map(r => ({ leadId: r.leadId, error: r.error }));

    return res.json({
      success: ok.length > 0,
      converted: ok,
      failed,
      alreadyConfirmed: alreadyDone
    });
  } catch (error) {
    console.error("❌ Fehler bei Angebotsbestätigung:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/testmail-service', async (req, res) => {
  try {
    const result = await testBookingMail();
    res.json(result);
  } catch (error) {
    console.error("❌ Fehler bei testmail-service:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/leads/:id/artikel', async (req, res) => {
  try {
    const { id } = req.params;
    const artikelResult = await db.query(`
      SELECT 
        la.id, la.artikel_variante_id, la.anzahl, la.einzelpreis, la.bemerkung,
        av.variante_name, a.name AS artikel_name
      FROM lead_artikel la
      JOIN artikel_variante av ON la.artikel_variante_id = av.id
      JOIN artikel a ON av.artikel_id = a.id
      WHERE la.lead_id = $1
    `, [id]);
    res.json({ success: true, artikel: artikelResult.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
