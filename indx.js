const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: "https://crm-lite-angebot-frontend-production.up.railway.app",
}));
app.use(express.json());

// Routes
const leadRoutes = require('./routes/leads');
app.use('/leads', leadRoutes);

const angebotRoutes = require('./routes/angebot');
app.use('/api', angebotRoutes); // 👈 Angebote-API

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server läuft auf Port ${PORT}`));
