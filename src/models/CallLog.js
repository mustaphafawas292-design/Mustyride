const mongoose = require('mongoose');

/**
 * Logs every in-app call (module 12 - "call support") whether it's
 * customer-to-rider, customer-to-support, or rider-to-support. The actual
 * audio bridging happens via a voice provider (see src/services/callService.js);
 * this model just keeps the audit trail.
 */
const callLogSchema = new mongoose.Schema(
  {
    initiatedByType: { type: String, enum: ['customer', 'rider'], required: true },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'initiatedByModel' },
    initiatedByModel: { type: String, required: true, enum: ['User', 'Rider'] },

    target: { type: String, enum: ['rider', 'customer', 'support'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null }, // null when target is 'support'

    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    provider: { type: String, default: null },
    providerCallId: { type: String, default: null },
    maskedNumberUsed: { type: String, default: null },

    status: { type: String, enum: ['initiated', 'ringing', 'connected', 'ended', 'failed'], default: 'initiated' },
    durationSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CallLog', callLogSchema);
