// indx.js (Server-Entry)
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

/* ----------------------------- CORS-Setup ----------------------------- */
const allowedOrigins = [
  'https://crm-lite-angebot-frontend-production.up.railway.app',
  'https://buchung.mrknips.de',
  // Optional: im lokalen Dev-Fall ergänzen:
  // 'http://localhost:5173',
  // 'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    // erlaubt auch Tools wie Postman (ohne Origin)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Nicht erlaubter Origin: ' + origin));
  },
  optionsSuccessStatus: 200,
}));

app.use(express.json({ limit: '1mb' }));

/* ----------------------------- Healthcheck ---------------------------- */
app.get('/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

/* -------------------------------- Routes ------------------------------ */
// Leads (Webhook/Intake + Detail + Clone + Group)
const leadRoutes = require('./routes/leads');
// Angebotslink + Bestätigung
const angebotRoutes = require('./routes/angebot');
// (Bestehende) Lead-zu-Buchung-Conversion
const leadConversionRoutes = require('./routes/lead_conversion');
// Locations (bestehend)
const locationRoutes = require('./routes/location');

// Alles konsistent unter /api
app.use('/api/leads', leadRoutes);
app.use('/api', angebotRoutes);
app.use('/api', leadConversionRoutes);
app.use('/api', locationRoutes);

/* ------------------------------ 404 + Error --------------------------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Serverfehler' });
});

/* ------------------------------- Start -------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
