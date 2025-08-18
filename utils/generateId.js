// backend/utils/generateId.js

function generateLeadId() {
  // z.B. L-20250818-KQ5D
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `L-${today}-${rand}`;
}

function generateGroupId() {
  // z.B. GL-20250818-64J7
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GL-${today}-${rand}`;
}

module.exports = { generateLeadId, generateGroupId };
