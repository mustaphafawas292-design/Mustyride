const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    purpose: {
      type: String,
      enum: ['trip_payment', 'wallet_topup', 'rider_withdrawal', 'refund'],
      required: true,
    },

    method: { type: String, enum: ['card', 'bank_transfer', 'wallet', 'cash'], required: true },
    provider: { type: String, enum: ['flutterwave', 'wallet', 'cash', null], default: null },

    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },

    // Flutterwave-specific
    flwTxRef: { type: String, default: null, unique: true, sparse: true }, // our reference sent to FLW
    flwTransactionId: { type: String, default: null }, // FLW's own transaction id
    flwStatus: { type: String, default: null }, // raw status string from FLW

    status: {
      type: String,
      enum: ['pending', 'successful', 'failed', 'refunded', 'reversed'],
      default: 'pending',
      index: true,
    },

    refundStatus: { type: String, enum: ['not_requested', 'requested', 'processed', 'rejected'], default: 'not_requested' },
    refundReason: { type: String, default: null },

    rawWebhookPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
