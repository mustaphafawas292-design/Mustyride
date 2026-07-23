const asyncHandler = require('express-async-handler');
const { User } = require('../models');
const { generateToken } = require('../utils/token');
const { requestOtp, verifyOtp } = require('../services/otpService');
const { getOrCreateWallet } = require('../services/walletService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/auth/customer/signup
const signup = asyncHandler(async (req, res) => {
  const { fullName, phone, email, password } = req.body;
  if (!fullName || !phone || !password) throw new ApiError(400, 'fullName, phone and password are required.');

  const existing = await User.findOne({ $or: [{ phone }, ...(email ? [{ email }] : [])] });
  if (existing) throw new ApiError(409, 'An account with this phone or email already exists.');

  const user = await User.create({ fullName, phone, email, password });
  await getOrCreateWallet(user, 'customer');
  await requestOtp({ identifier: phone, actorType: 'customer', purpose: 'signup_verification' });

  return success(res, 201, 'Account created. An OTP has been sent to your phone.', { userId: user._id });
});

// POST /api/auth/customer/verify-otp
const verifySignupOtp = asyncHandler(async (req, res) => {
  const { phone, code } = req.body;
  await verifyOtp({ identifier: phone, purpose: 'signup_verification', code });

  const user = await User.findOneAndUpdate({ phone }, { phoneVerified: true }, { new: true });
  if (!user) throw new ApiError(404, 'Account not found.');

  const token = generateToken({ id: user._id, role: 'customer' });
  return success(res, 200, 'Phone verified successfully.', { token, user });
});

// POST /api/auth/customer/login
const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid phone number or password.');
  }
  if (!user.phoneVerified) throw new ApiError(403, 'Please verify your phone number first.');

  const token = generateToken({ id: user._id, role: 'customer' });
  const safeUser = user.toObject();
  delete safeUser.password;
  return success(res, 200, 'Login successful.', { token, user: safeUser });
});

// POST /api/auth/customer/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const user = await User.findOne({ phone });
  if (!user) throw new ApiError(404, 'No account found with this phone number.');

  await requestOtp({ identifier: phone, actorType: 'customer', purpose: 'forgot_password' });
  return success(res, 200, 'A password reset OTP has been sent.');
});

// POST /api/auth/customer/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { phone, code, newPassword } = req.body;
  await verifyOtp({ identifier: phone, purpose: 'forgot_password', code });

  const user = await User.findOne({ phone });
  if (!user) throw new ApiError(404, 'Account not found.');

  user.password = newPassword; // re-hashed by the pre-save hook
  await user.save();
  return success(res, 200, 'Password reset successfully. You can now log in.');
});

// GET /api/auth/customer/me
const getProfile = asyncHandler(async (req, res) => {
  return success(res, 200, 'Profile fetched.', { user: req.actor });
});

// PATCH /api/auth/customer/me
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, email, avatarUrl } = req.body;
  const user = req.actor;

  if (fullName) user.fullName = fullName;
  if (email) user.email = email;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  await user.save();

  return success(res, 200, 'Profile updated.', { user });
});

// POST /api/auth/customer/addresses
const addSavedAddress = asyncHandler(async (req, res) => {
  const { label, address, lng, lat } = req.body;
  if (!label || !address) throw new ApiError(400, 'label and address are required.');

  const user = req.actor;
  user.savedAddresses.push({
    label,
    address,
    location: lng && lat ? { type: 'Point', coordinates: [lng, lat] } : undefined,
  });
  await user.save();

  return success(res, 201, 'Address saved.', { savedAddresses: user.savedAddresses });
});

// DELETE /api/auth/customer/addresses/:addressId
const removeSavedAddress = asyncHandler(async (req, res) => {
  const user = req.actor;
  user.savedAddresses = user.savedAddresses.filter((a) => String(a._id) !== req.params.addressId);
  await user.save();
  return success(res, 200, 'Address removed.', { savedAddresses: user.savedAddresses });
});

module.exports = {
  signup,
  verifySignupOtp,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  addSavedAddress,
  removeSavedAddress,
};
