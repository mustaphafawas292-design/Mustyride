const { FareConfig } = require('../models');
const { estimateTrip } = require('./distanceService');

async function getActiveFareConfig() {
  let config = await FareConfig.findOne({ isActive: true });
  if (!config) config = await FareConfig.create({}); // fall back to schema defaults
  return config;
}

function getTimeOfDayMultiplier(peakHours) {
  const hour = new Date().getHours();
  const match = peakHours.find((p) => hour >= p.startHour && hour < p.endHour);
  return match ? match.multiplier : 1;
}

/**
 * Calculates the full fare breakdown for a booking. This is the single
 * source of truth for pricing - called both when showing the customer an
 * estimate before they confirm, and again when the booking is actually
 * created (so the stored fare always matches what was quoted).
 *
 * @param {Object} params
 * @param {[number,number]} params.pickupCoords - [lng, lat]
 * @param {[number,number]} params.destinationCoords - [lng, lat]
 * @param {string} params.serviceType - e.g. 'same_day_delivery', 'bike_ride'
 * @param {string} params.deliveryType - 'normal' | 'express' | 'standard' | 'priority'
 * @param {number} [params.packageWeightKg]
 */
async function calculateFare({ pickupCoords, destinationCoords, serviceType, deliveryType, packageWeightKg = 0 }) {
  const config = await getActiveFareConfig();
  const { distanceKm, estimatedMinutes } = estimateTrip(pickupCoords, destinationCoords);

  const baseFare = config.baseFare[serviceType] ?? 300;
  const distanceCharge = Math.round(distanceKm * config.perKmRate);
  const timeOfDayMultiplier = getTimeOfDayMultiplier(config.peakHours);
  const timeSurcharge = Math.round(estimatedMinutes * config.perMinuteRate * (timeOfDayMultiplier - 1 > 0 ? timeOfDayMultiplier : 0));

  const speedTypeMultiplier = config.speedMultiplier[deliveryType] ?? 1;

  const weightSurcharge =
    packageWeightKg > 5 ? Math.round((packageWeightKg - 5) * config.weightSurchargePerKgAbove5) : 0;

  // Applied BEFORE the speed multiplier, and independent of delivery type, so
  // a customer can't underpay a rider on a genuinely long trip just by
  // picking "Normal" instead of "Express" - distance is priced fairly either way.
  const longDistanceSurcharge =
    distanceKm > config.longDistanceThresholdKm
      ? Math.round((distanceKm - config.longDistanceThresholdKm) * config.longDistanceSurchargePerKm)
      : 0;

  const demandSurgeMultiplier = config.currentDemandSurgeMultiplier || 1;

  const subtotal =
    (baseFare + distanceCharge + timeSurcharge + weightSurcharge + longDistanceSurcharge) * speedTypeMultiplier;
  const total = Math.max(config.minimumFare, Math.round(subtotal * demandSurgeMultiplier));

  return {
    distanceKm,
    estimatedMinutes,
    baseFare,
    distanceCharge,
    timeSurcharge,
    demandSurgeMultiplier,
    weightSurcharge,
    longDistanceSurcharge,
    speedTypeMultiplier,
    total,
    currency: 'NGN',
  };
}

module.exports = { calculateFare, getActiveFareConfig };
