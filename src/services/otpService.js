const { Otp } = require('../models');
const { generateOtp, hashOtp, otpExpiryDate } = require('../utils/otp');
const { sendSms } = require('./smsService');
const ApiError = require('../utils/ApiError');

/** Generates, stores (hashed), and sends an OTP. Returns nothing sensitive. */
async function requestOtp({ identifier, actorType, purpose }) {
  const code = generateOtp();

  await Otp.create({
    identifier,
    actorType,
    purpose,
    codeHash: hashOtp(code),
    expiresAt: otpExpiryDate(10),
  });

  const messages = {
    signup_verification: `Your MustyRide verification code is ${code}. It expires in 10 minutes.`,
    login_2fa: `Your MustyRide login code is ${code}. Do not share this with anyone.`,
    forgot_password: `Your MustyRide password reset code is ${code}. It expires in 10 minutes.`,
  };

  await sendSms(identifier, messages[purpose] || `Your MustyRide code is ${code}`);
  return true;
}

/** Verifies a submitted OTP. Throws if invalid/expired/already used. */
async function verifyOtp({ identifier, purpose, code }) {
  const record = await Otp.findOne({ identifier, purpose, consumed: false }).sort({ createdAt: -1 });

  if (!record) throw new ApiError(400, 'No pending OTP found. Please request a new one.');
  if (record.expiresAt < new Date()) throw new ApiError(400, 'This OTP has expired. Please request a new one.');
  if (record.attempts >= 5) throw new ApiError(429, 'Too many incorrect attempts. Please request a new OTP.');

  if (record.codeHash !== hashOtp(code)) {
    record.attempts += 1;
    await record.save();
    throw new ApiError(400, 'Incorrect OTP.');
  }

  record.consumed = true;
  await record.save();
  return true;
}

module.exports = { requestOtp, verifyOtp };
