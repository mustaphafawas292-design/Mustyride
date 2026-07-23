const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const { Admin } = require('../models');
const { generateToken } = require('../utils/token');
const { requestOtp, verifyOtp } = require('../services/otpService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/auth/admin/login  (step 1: email + password)
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email }).select('+password +twoFactorSecret');
  if (!admin || !(await admin.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  if (admin.status !== 'active') throw new ApiError(403, 'This admin account is suspended.');

  if (!admin.twoFactorEnabled) {
    // 2FA is strongly recommended (per module 1) but not force-enabled here so a
    // freshly-seeded first admin can still log in and turn it on from settings.
    const token = generateToken({ id: admin._id, role: 'admin' });
    admin.lastLoginAt = new Date();
    await admin.save();
    const safeAdmin = admin.toObject();
    delete safeAdmin.password;
    delete safeAdmin.twoFactorSecret;
    return success(res, 200, 'Login successful.', { token, admin: safeAdmin, twoFactorRequired: false });
  }

  // Step 1 passed - issue a short-lived temp token and require the OTP step next.
  const tempToken = crypto.randomBytes(24).toString('hex');
  admin.twoFactorTempToken = tempToken;
  await admin.save();

  await requestOtp({ identifier: admin.email, actorType: 'admin', purpose: 'login_2fa' });

  return success(res, 200, 'Password correct. Enter the 2FA code sent to your email/phone.', {
    twoFactorRequired: true,
    tempToken,
  });
});

// POST /api/auth/admin/verify-2fa  (step 2: OTP)
const verifyTwoFactor = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;
  const admin = await Admin.findOne({ twoFactorTempToken: tempToken }).select('+twoFactorSecret');
  if (!admin) throw new ApiError(401, 'Invalid or expired login session. Please log in again.');

  await verifyOtp({ identifier: admin.email, purpose: 'login_2fa', code });

  admin.twoFactorTempToken = null;
  admin.lastLoginAt = new Date();
  await admin.save();

  const token = generateToken({ id: admin._id, role: 'admin' });
  const safeAdmin = admin.toObject();
  delete safeAdmin.twoFactorSecret;
  return success(res, 200, 'Login successful.', { token, admin: safeAdmin });
});

// PATCH /api/auth/admin/2fa/enable
const enableTwoFactor = asyncHandler(async (req, res) => {
  const admin = req.actor;
  admin.twoFactorEnabled = true;
  await admin.save();
  return success(res, 200, 'Two-factor authentication enabled.');
});

// PATCH /api/auth/admin/2fa/disable
const disableTwoFactor = asyncHandler(async (req, res) => {
  const admin = req.actor;
  admin.twoFactorEnabled = false;
  await admin.save();
  return success(res, 200, 'Two-factor authentication disabled.');
});

module.exports = { login, verifyTwoFactor, enableTwoFactor, disableTwoFactor };
