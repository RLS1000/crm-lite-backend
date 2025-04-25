const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const leadRoutes = require('./routes/leads');
app.use('/leads', leadRoutes);

const angebotRoutes = require('./routes/angebot');
app.use('/api', angebotRoutes); // 👈 NEU

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
