const mongoose = require('mongoose');

/**
 * Every GPS ping a rider's app sends during an active booking. The Booking
 * document keeps only the *latest* snapshot (liveTracking) for fast reads;
 * this collection is the full trail, used for trip replay, ETA smoothing,
 * and fraud checks (e.g. impossible GPS jumps - module 15).
 */
const riderLocationPingSchema = new mongoose.Schema(
  {
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    speedKph: { type: Number, default: 0 },
    heading: { type: Number, default: null }, // degrees, optional
  },
  { timestamps: true }
);

riderLocationPingSchema.index({ location: '2dsphere' });
riderLocationPingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RiderLocationPing', riderLocationPingSchema);
