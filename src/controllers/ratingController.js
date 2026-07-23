const asyncHandler = require('express-async-handler');
const { Booking, Rating, Rider, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/ratings   body: { bookingId, stars, comment }
// Works for both directions - inferred from who's calling (req.actorRole).
const submitRating = asyncHandler(async (req, res) => {
  const { bookingId, stars, comment } = req.body;
  if (!stars || stars < 1 || stars > 5) throw new ApiError(400, 'stars must be between 1 and 5.');

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (booking.status !== 'delivered') throw new ApiError(400, 'You can only rate a completed trip.');

  const isCustomer = req.actorRole === 'customer';
  const direction = isCustomer ? 'customer_to_rider' : 'rider_to_customer';

  if (isCustomer && String(booking.customer) !== String(req.actor._id)) {
    throw new ApiError(403, 'This is not your booking.');
  }
  if (!isCustomer && String(booking.rider) !== String(req.actor._id)) {
    throw new ApiError(403, 'This is not your booking.');
  }

  const existing = await Rating.findOne({ booking: bookingId, direction });
  if (existing) throw new ApiError(409, 'You already rated this trip.');

  const rating = await Rating.create({
    booking: bookingId,
    direction,
    ratedByUser: isCustomer ? req.actor._id : null,
    ratedByRider: isCustomer ? null : req.actor._id,
    targetUser: isCustomer ? null : booking.customer,
    targetRider: isCustomer ? booking.rider : null,
    stars,
    comment,
  });

  // Roll the new rating into the target's running average.
  const TargetModel = isCustomer ? Rider : User;
  const targetId = isCustomer ? booking.rider : booking.customer;
  const target = await TargetModel.findById(targetId);
  if (target) {
    const newCount = target.ratingCount + 1;
    target.ratingAverage = (target.ratingAverage * target.ratingCount + stars) / newCount;
    target.ratingCount = newCount;
    await target.save();
  }

  return success(res, 201, 'Rating submitted.', { rating });
});

// GET /api/ratings/booking/:bookingId
const getRatingsForBooking = asyncHandler(async (req, res) => {
  const ratings = await Rating.find({ booking: req.params.bookingId });
  return success(res, 200, 'Ratings fetched.', { ratings });
});

module.exports = { submitRating, getRatingsForBooking };
