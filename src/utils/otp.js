const crypto = require('crypto');

/** Generates a 6-digit numeric OTP as a string, e.g. "048213" */
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/** Generates a short numeric code (default 4 digits) for delivery handover confirmation. */
function generateShortCode(length = 4) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return crypto.randomInt(min, max).toString();
}

/** Hashes an OTP before storing it, so raw OTPs never sit in the DB */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function otpExpiryDate(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = { generateOtp, generateShortCode, hashOtp, otpExpiryDate };
