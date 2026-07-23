const asyncHandler = require('express-async-handler');
const { Booking, Rider, RiderLocationPing } = require('../models');
const { estimateTrip } = require('../services/distanceService');
const { checkGpsJump } = require('../services/fraudService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/tracking/ping   body: { lng, lat, speedKph, bookingId? }
// Called by the rider's app every few seconds while online / on a trip.
const submitPing = asyncHandler(async (req, res) => {
  const { lng, lat, speedKph = 0, heading = null, bookingId } = req.body;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new ApiError(400, 'lng and lat must be numbers.');
  }

  const rider = req.actor;

  await checkGpsJump(rider, [lng, lat]); // fires a FraudFlag internally if implausible

  rider.currentLocation = { type: 'Point', coordinates: [lng, lat] };
  rider.currentSpeedKph = speedKph;
  rider.lastLocationAt = new Date();
  await rider.save();

  await RiderLocationPing.create({
    rider: rider._id,
    booking: bookingId || null,
    location: { type: 'Point', coordinates: [lng, lat] },
    speedKph,
    heading,
  });

  let booking = null;
  if (bookingId) {
    booking = await Booking.findById(bookingId);
    if (booking && String(booking.rider) === String(rider._id)) {
      const destCoords = booking.destination.location.coordinates;
      const { estimatedMinutes } = estimateTrip([lng, lat], destCoords);

      // Rough progress: how much closer are we to the destination vs the original trip distance.
      const totalKm = booking.fare.distanceKm || 1;
      const { distanceKm: remainingKm } = estimateTrip([lng, lat], destCoords);
      const progressPercent = Math.max(0, Math.min(100, Math.round((1 - remainingKm / totalKm) * 100)));

      booking.liveTracking = {
        riderLocation: { type: 'Point', coordinates: [lng, lat] },
        speedKph,
        etaMinutes: estimatedMinutes,
        progressPercent,
        updatedAt: new Date(),
      };
      await booking.save();

      // Push to anyone subscribed to this booking's room (see server.js socket setup)
      const io = req.app.get('io');
      if (io) io.to(`booking:${bookingId}`).emit('tracking:update', booking.liveTracking);
    }
  }

  return success(res, 200, 'Location updated.', { booking: booking?.liveTracking || null });
});

// GET /api/tracking/:bookingId  - customer polls this as a fallback to sockets
const getLiveTracking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).populate('rider', 'fullName phone ratingAverage');
  if (!booking) throw new ApiError(404, 'Booking not found.');
  return success(res, 200, 'Tracking fetched.', {
    trackingId: booking.trackingId,
    status: booking.status,
    rider: booking.rider,
    liveTracking: booking.liveTracking,
  });
});

// GET /api/tracking/by-code/:trackingId  - public lookup by the friendly code (e.g. OSR-7F3K2)
// Knowing the code is the access control here, same as tracking a parcel by its waybill number.
const getLiveTrackingByCode = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ trackingId: req.params.trackingId.toUpperCase() }).populate(
    'rider',
    'fullName phone ratingAverage documents.passportPhotoUrl documents.plateNumber'
  );
  if (!booking) throw new ApiError(404, "We couldn't find that tracking ID.");
  return success(res, 200, 'Tracking fetched.', {
    bookingId: booking._id,
    trackingId: booking.trackingId,
    status: booking.status,
    rider: booking.rider,
    liveTracking: booking.liveTracking,
  });
});

module.exports = { submitPing, getLiveTracking, getLiveTrackingByCode };
