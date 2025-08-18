// utils/generateId.js

/**
 * Erzeugt eine eindeutige Lead-ID (bestehend aus Datum + zufälligem Suffix)
 * Beispiel: L-20250818-ABCD
 */
function generateLeadId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `L-${today}-${rand}`;
}

/**
 * Erzeugt eine Group-ID für verbundene Leads (mehrere Tage / Varianten)
 * Beispiel: GL-20250818-64j7
 */
function generateGroupId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toLowerCase();
  return `GL-${today}-${rand}`;
}

module.exports = {
  generateLeadId,
  generateGroupId
};
