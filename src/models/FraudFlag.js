const mongoose = require('mongoose');

const fraudFlagSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'fake_booking_pattern',
        'gps_jump_implausible',
        'repeated_cancellations',
        'suspicious_account',
        'duplicate_device',
        'payment_anomaly',
      ],
      required: true,
    },

    subjectType: { type: String, enum: ['customer', 'rider'], required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'subjectModel' },
    subjectModel: { type: String, required: true, enum: ['User', 'Rider'] },

    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { jumpKm: 40, seconds: 5 }
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },

    status: { type: String, enum: ['open', 'reviewing', 'confirmed', 'dismissed'], default: 'open' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewNote: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FraudFlag', fraudFlagSchema);
