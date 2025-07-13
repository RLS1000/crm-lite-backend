const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/email', async (req, res) => {
  try {
    const result = await db.query(`SELECT key, value FROM system_config`);
    const config = {};
    result.rows.forEach(row => config[row.key] = row.value);
    res.json({ success: true, config });
  } catch (err) {
    console.error("Fehler beim Laden der E-Mail-Konfiguration:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;