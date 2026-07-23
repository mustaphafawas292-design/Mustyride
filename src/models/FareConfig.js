const mongoose = require('mongoose');

/**
 * Singleton-style config document (only one active row expected at a time).
 * Admin edits this centrally instead of prices being hardcoded or recalculated
 * from scratch on every trip (module 18 - "update centrally, not every trip").
 */
const fareConfigSchema = new mongoose.Schema(
  {
    isActive: { type: Boolean, default: true },

    // Per-service base fares (₦)
    baseFare: {
      same_day_delivery: { type: Number, default: 300 },
      market_pickup: { type: Number, default: 300 },
      food_delivery: { type: Number, default: 250 },
      business_delivery: { type: Number, default: 300 },
    },

    perKmRate: { type: Number, default: 100 }, // ₦ per km
    perMinuteRate: { type: Number, default: 10 }, // ₦ per estimated minute

    // Speed-tier multipliers
    speedMultiplier: {
      normal: { type: Number, default: 1 },
      express: { type: Number, default: 1.6 },
    },

    // Package weight surcharge
    weightSurchargePerKgAbove5: { type: Number, default: 50 },

    // Time-of-day multipliers (24hr clock, Africa/Lagos)
    peakHours: [
      { startHour: { type: Number, default: 7 }, endHour: { type: Number, default: 9 }, multiplier: { type: Number, default: 1.2 } },
      { startHour: { type: Number, default: 16 }, endHour: { type: Number, default: 19 }, multiplier: { type: Number, default: 1.3 } },
    ],

    // Demand surge - admin (or a scheduled job) updates this when many bookings
    // come in at once, rather than recalculating from live order volume every trip.
    currentDemandSurgeMultiplier: { type: Number, default: 1, min: 1, max: 3 },

    // Reference fuel price, informs how baseFare/perKmRate get manually tuned.
    fuelPricePerLitre: { type: Number, default: 1200 },

    minimumFare: { type: Number, default: 400 },

    // Platform commission taken from every completed trip's fare before the
    // rest is credited to the rider's wallet (announced to riders in-app).
    commissionRate: { type: Number, default: 0.15, min: 0, max: 1 },

    // Ensures riders are paid fairly for real distance regardless of which
    // delivery type the customer picks - so a customer can't dodge paying
    // for a genuinely long trip just by selecting "Normal" instead of "Express".
    longDistanceThresholdKm: { type: Number, default: 8 },
    longDistanceSurchargePerKm: { type: Number, default: 40 },

    updatedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FareConfig', fareConfigSchema);
