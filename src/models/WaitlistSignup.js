const mongoose = require('mongoose');

/**
 * Pre-launch interest gauge: a simple public "join the waitlist" signup,
 * separate from real customer/rider accounts. No auth required to submit -
 * the whole point is to make it frictionless so you get an honest read on
 * how much interest exists before investing further in full launch.
 */
const waitlistSignupSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },

    // What they'd use MustyRide for, so you can gauge which side (customer
    // demand vs rider supply) needs more attention before launch.
    interestType: { type: String, enum: ['customer', 'rider', 'both'], default: 'customer' },

    town: { type: String, trim: true, default: null }, // which Osun town they're in - helps you prioritize launch areas

    // Where they heard about it / came from, useful once you start running
    // different promo channels and want to see what's actually converting.
    source: { type: String, trim: true, default: 'direct' },

    contacted: { type: Boolean, default: false }, // for your own follow-up tracking once you do launch
  },
  { timestamps: true }
);

waitlistSignupSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model('WaitlistSignup', waitlistSignupSchema);
