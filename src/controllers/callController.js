const asyncHandler = require('express-async-handler');
const { Booking, Rider, User } = require('../models');
const { initiateCall } = require('../services/callService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/calls/rider   body: { bookingId }   (customer calls their assigned rider)
const callRider = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.body.bookingId);
  if (!booking || !booking.rider) throw new ApiError(404, 'No rider assigned to this booking yet.');
  if (String(booking.customer) !== String(req.actor._id)) throw new ApiError(403, 'This is not your booking.');

  const rider = await Rider.findById(booking.rider);
  const result = await initiateCall({
    initiator: req.actor,
    initiatorType: 'customer',
    target: 'rider',
    targetPhone: rider.phone,
    targetId: rider._id,
    booking,
  });

  return success(res, 200, 'Call initiated.', result);
});

// POST /api/calls/customer   body: { bookingId }   (rider calls their customer)
const callCustomer = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.body.bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (String(booking.rider) !== String(req.actor._id)) throw new ApiError(403, 'You are not assigned to this booking.');

  const customer = await User.findById(booking.customer);
  const result = await initiateCall({
    initiator: req.actor,
    initiatorType: 'rider',
    target: 'customer',
    targetPhone: customer.phone,
    targetId: customer._id,
    booking,
  });

  return success(res, 200, 'Call initiated.', result);
});

// POST /api/calls/support   body: { bookingId? }   (either party calls support directly)
const callSupport = asyncHandler(async (req, res) => {
  const result = await initiateCall({
    initiator: req.actor,
    initiatorType: req.actorRole === 'rider' ? 'rider' : 'customer',
    target: 'support',
    targetPhone: process.env.SUPPORT_PHONE_NUMBER,
    bookingId: req.body.bookingId || null,
  });

  return success(res, 200, 'Connecting you to support.', result);
});

module.exports = { callRider, callCustomer, callSupport };
