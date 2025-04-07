function generateLeadId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `L-${today}-${rand}`;
}

module.exports = generateLeadId;
