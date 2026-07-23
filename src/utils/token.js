const jwt = require('jsonwebtoken');

/**
 * Signs a JWT for any actor type (customer, rider, admin, business staff).
 * @param {Object} payload - must include id and role at minimum
 */
function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { generateToken, verifyToken };
