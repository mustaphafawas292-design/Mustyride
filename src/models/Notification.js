const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ['customer', 'rider', 'admin'], required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'recipientModel' },
    recipientModel: { type: String, required: true, enum: ['User', 'Rider', 'Admin'] },

    // Matches the automatic triggers in module 11
    event: {
      type: String,
      enum: [
        'booking_received',
        'rider_accepted',
        'rider_arrived',
        'package_picked_up',
        'package_delivered',
        'ride_started',
        'ride_completed',
        'payment_successful',
        'payment_failed',
        'withdrawal_approved',
        'withdrawal_rejected',
        'booking_cancelled',
        'rider_approved',
        'rider_rejected',
        'complaint_response',
        'new_message',
        'promo',
      ],
      required: true,
    },

    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    channel: { type: [String], enum: ['in_app', 'sms', 'email', 'push'], default: ['in_app'] },
    read: { type: Boolean, default: false },
    sentSuccessfully: { type: Boolean, default: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
