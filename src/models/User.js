const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const savedAddressSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // "Home", "Work", etc.
    address: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
  },
  { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },

    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },

    avatarUrl: { type: String, default: null },
    savedAddresses: [savedAddressSchema],

    // ----- Business account support (module 19) -----
    accountType: { type: String, enum: ['individual', 'business_owner', 'business_staff'], default: 'individual' },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessAccount', default: null },
    businessRole: { type: String, enum: ['owner', 'manager', 'staff', null], default: null },

    // ----- Wallet convenience pointer (module 7) -----
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },

    // ----- Rating summary (module 10 - riders rate customers too) -----
    ratingAverage: { type: Number, default: 5, min: 1, max: 5 },
    ratingCount: { type: Number, default: 0 },

    // ----- Fraud / trust (module 15) -----
    isSuspended: { type: Boolean, default: false },
    suspensionReason: { type: String, default: null },
    deviceFingerprints: [{ type: String }],

    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
  },
  { timestamps: true }
);

userSchema.index({ 'savedAddresses.location': '2dsphere' });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
