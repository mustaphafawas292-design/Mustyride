const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },

    direction: {
      type: String,
      enum: ['customer_to_rider', 'rider_to_customer'],
      required: true,
    },

    ratedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ratedByRider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    targetRider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null },

    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true }
);

ratingSchema.index({ booking: 1, direction: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
