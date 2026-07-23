const asyncHandler = require('express-async-handler');
const { Rider } = require('../models');
const { generateToken } = require('../utils/token');
const { requestOtp, verifyOtp } = require('../services/otpService');
const { getOrCreateWallet } = require('../services/walletService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/auth/rider/signup
const signup = asyncHandler(async (req, res) => {
  const { fullName, phone, email, password } = req.body;
  if (!fullName || !phone || !password) throw new ApiError(400, 'fullName, phone and password are required.');

  const existing = await Rider.findOne({ $or: [{ phone }, ...(email ? [{ email }] : [])] });
  if (existing) throw new ApiError(409, 'An account with this phone or email already exists.');

  const rider = await Rider.create({ fullName, phone, email, password });
  await getOrCreateWallet(rider, 'rider');
  await requestOtp({ identifier: phone, actorType: 'rider', purpose: 'signup_verification' });

  return success(res, 201, 'Rider account created. An OTP has been sent to your phone.', { riderId: rider._id });
});

// POST /api/auth/rider/verify-otp
const verifySignupOtp = asyncHandler(async (req, res) => {
  const { phone, code } = req.body;
  await verifyOtp({ identifier: phone, purpose: 'signup_verification', code });

  const rider = await Rider.findOneAndUpdate({ phone }, { phoneVerified: true }, { new: true });
  if (!rider) throw new ApiError(404, 'Rider account not found.');

  const token = generateToken({ id: rider._id, role: 'rider' });
  return success(res, 200, 'Phone verified. Please upload your documents for admin approval.', { token, rider });
});

// POST /api/auth/rider/documents  (multipart/form-data, uses upload middleware)
const uploadDocuments = asyncHandler(async (req, res) => {
  const rider = req.actor;
  const files = req.files || {};

  const fileUrl = (field) => (files[field]?.[0] ? `/uploads/${files[field][0].filename}` : null);

  rider.documents.passportPhotoUrl = fileUrl('passportPhoto') || rider.documents.passportPhotoUrl;
  rider.documents.bikePhotoUrl = fileUrl('bikePhoto') || rider.documents.bikePhotoUrl;
  rider.documents.meansOfIdUrl = fileUrl('meansOfId') || rider.documents.meansOfIdUrl;

  if (req.body.plateNumber) rider.documents.plateNumber = req.body.plateNumber;
  if (req.body.meansOfIdType) rider.documents.meansOfIdType = req.body.meansOfIdType;
  if (req.body.homeAddress) rider.homeAddress = req.body.homeAddress;

  rider.verificationStatus = 'pending'; // (re)submit for admin review
  await rider.save();

  return success(res, 200, 'Documents submitted. Awaiting admin approval before you can go online.', { rider });
});

// POST /api/auth/rider/login
const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const rider = await Rider.findOne({ phone }).select('+password');
  if (!rider || !(await rider.comparePassword(password))) {
    throw new ApiError(401, 'Invalid phone number or password.');
  }
  if (!rider.phoneVerified) throw new ApiError(403, 'Please verify your phone number first.');

  // Verification status is intentionally NOT checked here - a pending/rejected
  // rider can still log in and land on their dashboard, which shows them
  // exactly what's needed to get approved. Going online is what's actually
  // blocked until they're approved (see updateAvailability below).

  const token = generateToken({ id: rider._id, role: 'rider' });
  const safeRider = rider.toObject();
  delete safeRider.password;
  return success(res, 200, 'Login successful.', { token, rider: safeRider });
});

// POST /api/auth/rider/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const rider = await Rider.findOne({ phone });
  if (!rider) throw new ApiError(404, 'No rider account found with this phone number.');

  await requestOtp({ identifier: phone, actorType: 'rider', purpose: 'forgot_password' });
  return success(res, 200, 'A password reset OTP has been sent.');
});

// POST /api/auth/rider/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { phone, code, newPassword } = req.body;
  await verifyOtp({ identifier: phone, purpose: 'forgot_password', code });

  const rider = await Rider.findOne({ phone });
  if (!rider) throw new ApiError(404, 'Rider account not found.');

  rider.password = newPassword;
  await rider.save();
  return success(res, 200, 'Password reset successfully.');
});

// GET /api/auth/rider/me
const getProfile = asyncHandler(async (req, res) => success(res, 200, 'Profile fetched.', { rider: req.actor }));

// PATCH /api/auth/rider/me
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  const rider = req.actor;
  if (fullName) rider.fullName = fullName;
  if (email) rider.email = email;
  await rider.save();
  return success(res, 200, 'Profile updated.', { rider });
});

// PATCH /api/auth/rider/availability   body: { status, lng?, lat? }
const updateAvailability = asyncHandler(async (req, res) => {
  const { status, lng, lat } = req.body;
  const rider = req.actor;

  if (!['online', 'offline', 'busy', 'break'].includes(status)) {
    throw new ApiError(400, 'Invalid availability status.');
  }
  if (status === 'online' && rider.verificationStatus !== 'approved') {
    throw new ApiError(403, 'You must be approved by an admin before going online.');
  }

  // Riders only get matched to bookings near their currentLocation - if we
  // never got that from them, they'd sit at the default [0,0] forever and
  // never show up in anyone's search. Take it here too so going online
  // always sets a real position, not just the dedicated /tracking/ping route.
  if (typeof lng === 'number' && typeof lat === 'number') {
    rider.currentLocation = { type: 'Point', coordinates: [lng, lat] };
    rider.lastLocationAt = new Date();
  }

  rider.availability = status;
  rider.availabilityUpdatedAt = new Date();
  await rider.save();

  return success(res, 200, `You are now ${status}.`, { rider });
});

module.exports = {
  signup,
  verifySignupOtp,
  uploadDocuments,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  updateAvailability,
};
