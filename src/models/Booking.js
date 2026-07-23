const mongoose = require('mongoose');

const pointSchema = {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true }, // [lng, lat]
};

const bookingSchema = new mongoose.Schema(
  {
    trackingId: { type: String, required: true, unique: true, index: true },

    // Who booked it
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessAccount', default: null },
    bookedByStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // What kind of job this is (module 2 & the "Bike Rides" service)
    serviceType: {
      type: String,
      enum: ['same_day_delivery', 'market_pickup', 'food_delivery', 'business_delivery'],
      required: true,
    },
    deliveryType: { type: String, enum: ['normal', 'express'], required: true },

    // Locations
    pickup: {
      address: { type: String, required: true },
      location: pointSchema,
    },
    destination: {
      address: { type: String, required: true },
      location: pointSchema,
    },

    // Delivery-only fields (ignored for bike_ride)
    receiverName: { type: String, default: null },
    receiverPhone: { type: String, default: null },
    packageDescription: { type: String, default: null },
    packageWeightKg: { type: Number, default: null },

    // Ride-only fields
    riderNotes: { type: String, default: null }, // optional delivery instructions for the rider

    // ----- Fare (module 3 & 18) -----
    fare: {
      distanceKm: { type: Number, required: true },
      estimatedMinutes: { type: Number, required: true },
      baseFare: { type: Number, required: true },
      distanceCharge: { type: Number, required: true },
      timeSurcharge: { type: Number, default: 0 },
      demandSurgeMultiplier: { type: Number, default: 1 },
      weightSurcharge: { type: Number, default: 0 },
      longDistanceSurcharge: { type: Number, default: 0 },
      speedTypeMultiplier: { type: Number, default: 1 },
      total: { type: Number, required: true },
      currency: { type: String, default: 'NGN' },
    },

    // ----- Payment -----
    paymentMethod: { type: String, enum: ['card', 'bank_transfer', 'wallet', 'cash'], required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },

    // ----- Assigned rider -----
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null },
    matchAttempts: { type: Number, default: 0 }, // how many riders were offered this job

    // ----- Status (module 2, 5, 17) -----
    status: {
      type: String,
      enum: [
        'awaiting_payment',
        'pending_match',
        'rider_assigned',
        'rider_arrived_pickup',
        'picked_up',
        'in_transit',
        'arrived_destination',
        'delivered',
        'cancelled_by_customer',
        'cancelled_by_rider',
        'no_riders_available',
        'failed',
      ],
      default: 'pending_match',
      index: true,
    },
    statusHistory: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        note: String,
      },
    ],

    cancellationReason: { type: String, default: null },
    cancelledBy: { type: String, enum: ['customer', 'rider', 'admin', null], default: null },

    // ----- Live tracking snapshot (module 5) -----
    // Full ping history lives in RiderLocationPing; this is just "latest known state"
    // for fast reads without a join.
    liveTracking: {
      riderLocation: pointSchema,
      speedKph: { type: Number, default: 0 },
      etaMinutes: { type: Number, default: null },
      progressPercent: { type: Number, default: 0, min: 0, max: 100 },
      updatedAt: { type: Date, default: null },
    },

    deliveredAt: { type: Date, default: null },

    // Customer gives this 4-digit code to the rider on handover; rider must
    // enter it correctly to mark the trip delivered - proves the package/ride
    // actually reached the right person.
    deliveryConfirmationCode: { type: String, default: null },

    // Escrow-style protection: the rider's earnings sit in their wallet's
    // pendingBalance (not withdrawable) until the customer confirms the
    // package arrived undamaged. If they report a problem instead, the money
    // stays held and a support ticket is opened automatically.
    receiptConfirmation: {
      type: String,
      enum: ['pending', 'confirmed_ok', 'reported_issue'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

bookingSchema.index({ 'pickup.location': '2dsphere' });
bookingSchema.index({ 'destination.location': '2dsphere' });
bookingSchema.index({ createdAt: -1 });

bookingSchema.methods.pushStatus = function (status, note = '') {
  this.status = status;
  this.statusHistory.push({ status, note, at: new Date() });
};

module.exports = mongoose.model('Booking', bookingSchema);
