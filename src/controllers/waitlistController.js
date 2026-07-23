const asyncHandler = require('express-async-handler');
const { WaitlistSignup } = require('../models');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/waitlist  - public, no auth. body: { fullName, phone, email?, interestType?, town?, source? }
const join = asyncHandler(async (req, res) => {
  const { fullName, phone, email, interestType, town, source } = req.body;

  if (!fullName || !fullName.trim()) throw new ApiError(400, 'Please tell us your name.');
  if (!phone || !phone.trim()) throw new ApiError(400, 'Please provide a phone number.');

  const existing = await WaitlistSignup.findOne({ phone: phone.trim() });
  if (existing) {
    // Not an error from the visitor's point of view - just confirm they're
    // already on the list, and return the current count so the page can
    // still show social proof.
    const count = await WaitlistSignup.countDocuments();
    return success(res, 200, "You're already on the waitlist! We'll be in touch.", { alreadyJoined: true, count });
  }

  await WaitlistSignup.create({
    fullName: fullName.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : null,
    interestType: ['customer', 'rider', 'both'].includes(interestType) ? interestType : 'customer',
    town: town ? town.trim() : null,
    source: source ? source.trim() : 'direct',
  });

  const count = await WaitlistSignup.countDocuments();
  return success(res, 201, "You're on the list! We'll text you the moment MustyRide opens in your area.", { alreadyJoined: false, count });
});

// GET /api/waitlist/count  - public, used to show live social proof on the landing page ("Join 214 others")
const getCount = asyncHandler(async (req, res) => {
  const count = await WaitlistSignup.countDocuments();
  return success(res, 200, 'Count fetched.', { count });
});

// GET /api/waitlist  (admin) - full list with basic breakdown, newest first
const listSignups = asyncHandler(async (req, res) => {
  const signups = await WaitlistSignup.find().sort({ createdAt: -1 }).limit(1000);

  const byInterest = { customer: 0, rider: 0, both: 0 };
  const byTown = {};
  signups.forEach((s) => {
    byInterest[s.interestType] = (byInterest[s.interestType] || 0) + 1;
    if (s.town) byTown[s.town] = (byTown[s.town] || 0) + 1;
  });

  return success(res, 200, 'Waitlist fetched.', {
    total: signups.length,
    byInterest,
    byTown,
    signups,
  });
});

// PATCH /api/waitlist/:id/contacted  (admin) - mark as followed up with once you launch
const markContacted = asyncHandler(async (req, res) => {
  const signup = await WaitlistSignup.findById(req.params.id);
  if (!signup) throw new ApiError(404, 'Signup not found.');
  signup.contacted = true;
  await signup.save();
  return success(res, 200, 'Marked as contacted.', { signup });
});

module.exports = { join, getCount, listSignups, markContacted };
