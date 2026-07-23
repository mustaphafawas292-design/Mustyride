const { MatchRequest, Booking } = require('../models');
const { offerToNextRider, declineOffer } = require('../services/matchingService');

/**
 * Runs on an interval (see server.js). Finds any rider offer that timed out
 * without a response and automatically moves the booking to the next
 * candidate rider - this is the "if Rider A declines, automatically send to
 * Rider B" behaviour from module 4, covering the *timeout* case (an explicit
 * decline is handled instantly in bookingController instead).
 */
async function expireStaleMatchRequests() {
  const expired = await MatchRequest.find({ status: 'offered', expiresAt: { $lt: new Date() } });

  for (const matchRequest of expired) {
    await declineOffer(matchRequest, 'expired');

    const booking = await Booking.findById(matchRequest.booking);
    if (!booking || booking.status !== 'pending_match') continue; // already matched/cancelled elsewhere

    const alreadyOffered = await MatchRequest.find({ booking: booking._id }).distinct('rider');
    const nextOffer = await offerToNextRider(booking, alreadyOffered.map(String));

    if (!nextOffer) {
      booking.pushStatus('no_riders_available', 'All nearby riders declined or timed out');
      await booking.save();
    }
  }
}

/** Call once from server.js to start the recurring check. */
function startMatchExpiryJob(intervalMs = 5000) {
  setInterval(() => {
    expireStaleMatchRequests().catch((err) => console.error('[MatchExpiryJob] Error:', err.message));
  }, intervalMs);
  console.log(`[MatchExpiryJob] Running every ${intervalMs / 1000}s.`);
}

module.exports = { startMatchExpiryJob, expireStaleMatchRequests };
