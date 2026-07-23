const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const riderSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    homeAddress: { type: String, default: null },

    phoneVerified: { type: Boolean, default: false },

    // ----- Registration documents (module 1) -----
    // NOTE: no driver's licence field - most okada riders here don't carry one,
    // so verification instead relies on a face photo, bike photo, plate number,
    // and a means of ID (NIN slip, voter's card, etc).
    documents: {
      passportPhotoUrl: { type: String, default: null }, // rider's face
      bikePhotoUrl: { type: String, default: null },
      plateNumber: { type: String, default: null, trim: true },
      meansOfIdUrl: { type: String, default: null },
      meansOfIdType: { type: String, default: null },
    },

    // ----- Admin approval gate (module 1) -----
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    verificationNote: { type: String, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    approvedAt: { type: Date, default: null },

    // ----- Availability (module 16) -----
    availability: {
      type: String,
      enum: ['online', 'offline', 'busy', 'break'],
      default: 'offline',
    },
    availabilityUpdatedAt: { type: Date, default: Date.now },

    // ----- Live location (module 5) -----
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    currentSpeedKph: { type: Number, default: 0 },
    lastLocationAt: { type: Date, default: null },

    // ----- Wallet (module 6) -----
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },

    // ----- Ratings & performance (module 10) -----
    ratingAverage: { type: Number, default: 5, min: 1, max: 5 },
    ratingCount: { type: Number, default: 0 },
    completedDeliveries: { type: Number, default: 0 },
    totalDeliveryRequests: { type: Number, default: 0 }, // offered to this rider
    acceptedRequests: { type: Number, default: 0 },
    cancelledByRider: { type: Number, default: 0 },

    // ----- Fraud / trust (module 15) -----
    isSuspended: { type: Boolean, default: false },
    suspensionReason: { type: String, default: null },
    deviceFingerprints: [{ type: String }],

    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
  },
  { timestamps: true }
);

riderSchema.index({ currentLocation: '2dsphere' });

// Virtuals used by the matching algorithm's scoring (module 4)
riderSchema.virtual('acceptanceRate').get(function () {
  if (!this.totalDeliveryRequests) return 1;
  return this.acceptedRequests / this.totalDeliveryRequests;
});
riderSchema.set('toJSON', { virtuals: true });
riderSchema.set('toObject', { virtuals: true });

riderSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

riderSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** A rider is eligible to be matched only if all of these hold (module 4) */
riderSchema.methods.isEligibleForMatching = function () {
  return (
    this.verificationStatus === 'approved' &&
    this.availability === 'online' &&
    !this.isSuspended &&
    this.status === 'active'
  );
};

module.exports = mongoose.model('Rider', riderSchema);
