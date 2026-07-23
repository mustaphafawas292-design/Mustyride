const mongoose = require('mongoose');

/**
 * One row per rider offered a given booking. The matching service creates
 * these in distance/rating/acceptance-rate order and moves to the next
 * rider automatically if one declines or times out (module 4).
 */
const matchRequestSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', required: true },

    distanceToPickupKm: { type: Number, required: true },
    riderRatingAtOffer: { type: Number, required: true },
    riderAcceptanceRateAtOffer: { type: Number, required: true },
    rankScore: { type: Number, required: true }, // lower = offered first

    status: {
      type: String,
      enum: ['offered', 'accepted', 'declined', 'expired'],
      default: 'offered',
    },
    offeredAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }, // offer auto-expires (module 4 timeout)
  },
  { timestamps: true }
);

matchRequestSchema.index({ booking: 1, rider: 1 }, { unique: true });

module.exports = mongoose.model('MatchRequest', matchRequestSchema);
