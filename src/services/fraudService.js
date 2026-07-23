const { FraudFlag, RiderLocationPing } = require('../models');
const { haversineKm } = require('../utils/geo');

/** Flags GPS pings that imply physically impossible speed (spoofed location). */
async function checkGpsJump(rider, newCoords) {
  const lastPing = await RiderLocationPing.findOne({ rider: rider._id }).sort({ createdAt: -1 });
  if (!lastPing) return null;

  const seconds = (Date.now() - lastPing.createdAt.getTime()) / 1000;
  if (seconds < 1) return null;

  const jumpKm = haversineKm(lastPing.location.coordinates, newCoords);
  const impliedSpeedKph = (jumpKm / seconds) * 3600;

  const MAX_PLAUSIBLE_KPH = 120; // generous ceiling for a bike + margin for GPS drift
  if (impliedSpeedKph > MAX_PLAUSIBLE_KPH) {
    return FraudFlag.create({
      type: 'gps_jump_implausible',
      subjectType: 'rider',
      subject: rider._id,
      subjectModel: 'Rider',
      details: { jumpKm: Math.round(jumpKm * 10) / 10, seconds: Math.round(seconds), impliedSpeedKph: Math.round(impliedSpeedKph) },
      severity: 'high',
    });
  }
  return null;
}

/** Flags accounts (customer or rider) with an unusually high cancellation rate. */
async function checkRepeatedCancellations(subject, subjectType, cancelledCount, totalCount) {
  if (totalCount < 5) return null; // not enough data yet
  const rate = cancelledCount / totalCount;

  if (rate > 0.4) {
    return FraudFlag.create({
      type: 'repeated_cancellations',
      subjectType,
      subject: subject._id,
      subjectModel: subjectType === 'rider' ? 'Rider' : 'User',
      details: { cancelledCount, totalCount, rate: Math.round(rate * 100) / 100 },
      severity: rate > 0.6 ? 'high' : 'medium',
    });
  }
  return null;
}

/** Flags a new account sharing a device fingerprint with an already-flagged/suspended account. */
async function checkDuplicateDevice(Model, subjectType, subject, deviceFingerprint) {
  if (!deviceFingerprint) return null;

  const duplicate = await Model.findOne({
    _id: { $ne: subject._id },
    deviceFingerprints: deviceFingerprint,
  });

  if (duplicate) {
    return FraudFlag.create({
      type: 'duplicate_device',
      subjectType,
      subject: subject._id,
      subjectModel: subjectType === 'rider' ? 'Rider' : 'User',
      details: { deviceFingerprint, matchedAccountId: duplicate._id },
      severity: 'medium',
    });
  }
  return null;
}

module.exports = { checkGpsJump, checkRepeatedCancellations, checkDuplicateDevice };
