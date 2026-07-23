const { Rider, MatchRequest } = require('../models');
const { haversineKm } = require('../utils/geo');
const { notifyRider } = require('./notificationService');

const SEARCH_RADIUS_METERS = 10000; // ~10km, tune per town density
const OFFER_TIMEOUT_SECONDS = 20;

/**
 * Finds eligible nearby riders and ranks them for a booking (module 4):
 *   - must be online, verified, not busy/suspended
 *   - sorted by a composite score: distance (heaviest weight), then rating,
 *     then acceptance rate
 */
async function findRankedCandidates(pickupCoords) {
  const nearbyRiders = await Rider.find({
    availability: 'online',
    verificationStatus: 'approved',
    isSuspended: false,
    status: 'active',
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: pickupCoords },
        $maxDistance: SEARCH_RADIUS_METERS,
      },
    },
  }).limit(20);

  const ranked = nearbyRiders
    .map((rider) => {
      const distanceKm = haversineKm(pickupCoords, rider.currentLocation.coordinates);
      const acceptanceRate = rider.acceptanceRate; // virtual, 0-1

      // Lower score = offered first. Distance dominates; rating/acceptance break ties.
      const rankScore = distanceKm * 10 - rider.ratingAverage * 1.5 - acceptanceRate * 2;

      return { rider, distanceKm, rankScore };
    })
    .sort((a, b) => a.rankScore - b.rankScore);

  return ranked;
}

/**
 * Creates the next MatchRequest in the cascade and notifies that rider.
 * Call this once to start dispatch, then again from the "decline/expire"
 * handler in bookingController to move to the next candidate.
 */
async function offerToNextRider(booking, excludeRiderIds = []) {
  const candidates = await findRankedCandidates(booking.pickup.location.coordinates);
  const next = candidates.find((c) => !excludeRiderIds.includes(String(c.rider._id)));

  if (!next) {
    return null; // caller should mark booking as no_riders_available
  }

  const matchRequest = await MatchRequest.create({
    booking: booking._id,
    rider: next.rider._id,
    distanceToPickupKm: Math.round(next.distanceKm * 10) / 10,
    riderRatingAtOffer: next.rider.ratingAverage,
    riderAcceptanceRateAtOffer: next.rider.acceptanceRate,
    rankScore: next.rankScore,
    expiresAt: new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000),
  });

  next.rider.totalDeliveryRequests += 1;
  await next.rider.save();

  booking.matchAttempts += 1;
  await booking.save();

  await notifyRider(next.rider, 'booking_received', {
    title: 'New delivery request',
    message: `Pickup ${next.distanceKm.toFixed(1)}km away. You have ${OFFER_TIMEOUT_SECONDS}s to accept.`,
    relatedBooking: booking._id,
  });

  return matchRequest;
}

/** Rider accepts an offer - assigns them to the booking */
async function acceptOffer(matchRequest, booking, rider) {
  matchRequest.status = 'accepted';
  matchRequest.respondedAt = new Date();
  await matchRequest.save();

  rider.acceptedRequests += 1;
  rider.availability = 'busy';
  await rider.save();

  booking.rider = rider._id;
  booking.pushStatus('rider_assigned', `Accepted by rider ${rider._id}`);
  await booking.save();
}

/** Rider declines (or times out) - caller should then call offerToNextRider again */
async function declineOffer(matchRequest, status = 'declined') {
  matchRequest.status = status;
  matchRequest.respondedAt = new Date();
  await matchRequest.save();
}

module.exports = { findRankedCandidates, offerToNextRider, acceptOffer, declineOffer, OFFER_TIMEOUT_SECONDS };
