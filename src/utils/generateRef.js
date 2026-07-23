const crypto = require('crypto');

/** Generates human-friendly reference codes like OSR-7F3K2, OSR-CMP-9X2QA */
function generateRef(prefix = 'OSR-') {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `${prefix}${rand}`;
}

module.exports = { generateRef };
