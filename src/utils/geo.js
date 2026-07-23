/**
 * Haversine formula: straight-line distance between two [lng, lat] points, in km.
 * This is used as the default distance engine so the platform works with zero
 * external API keys. Swap src/services/distanceService.js to call Google's
 * Distance Matrix API later for real road-distance/traffic-aware estimates.
 */
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

module.exports = { haversineKm };
