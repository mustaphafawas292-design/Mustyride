const { haversineKm } = require('../utils/geo');

/**
 * Estimates trip distance and duration between two [lng, lat] points.
 *
 * Uses haversine (straight-line) distance x a road-windiness factor as a
 * free, key-less approximation of real road distance, then derives time
 * from an assumed average okada speed. This is good enough to launch with.
 *
 * To upgrade later: replace the body of this function with a call to
 * Google's Distance Matrix API (or Mapbox Directions), which will give you
 * real road distance + live-traffic-aware duration. Nothing else in the
 * codebase needs to change since callers only care about the return shape.
 */
function estimateTrip(pickupCoords, destinationCoords) {
  const straightLineKm = haversineKm(pickupCoords, destinationCoords);

  const ROAD_WINDINESS_FACTOR = 1.35; // roads are never perfectly straight
  const distanceKm = Math.round(straightLineKm * ROAD_WINDINESS_FACTOR * 10) / 10;

  const AVERAGE_OKADA_SPEED_KPH = 28; // conservative for town traffic + stops
  const estimatedMinutes = Math.max(5, Math.round((distanceKm / AVERAGE_OKADA_SPEED_KPH) * 60));

  return { distanceKm, estimatedMinutes };
}

module.exports = { estimateTrip };
