const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
const allowedOrigins = [
  "https://crm-lite-angebot-frontend-production.up.railway.app",
  "https://buchung.mrknips.de"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Nicht erlaubter Origin: " + origin));
  }
}));


app.use(express.json());

// Routes
const leadRoutes = require('./routes/leads');
app.use('/leads', leadRoutes);

const angebotRoutes = require('./routes/angebot');
app.use('/api', angebotRoutes); // 👈 Angebote-API

const leadConversionRoutes = require('./routes/lead_conversion');
app.use('/api', leadConversionRoutes);

const locationRoutes = require('./routes/location');
app.use('/api', locationRoutes);

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server läuft auf Port ${PORT}`));
