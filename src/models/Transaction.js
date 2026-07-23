const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },

    type: {
      type: String,
      enum: [
        'delivery_earning', // rider: earned from a completed trip
        'commission_deduction', // rider: platform's cut
        'bonus', // rider: incentive credit
        'withdrawal', // rider: payout to bank
        'topup', // customer: added money
        'trip_payment', // customer: paid for a booking from wallet
        'refund', // customer: money back
        'promo_credit', // customer: promotional credit
      ],
      required: true,
    },

    amount: { type: Number, required: true }, // always positive; `direction` gives sign
    direction: { type: String, enum: ['credit', 'debit'], required: true },

    balanceAfter: { type: Number, required: true },

    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    relatedPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },

    status: { type: String, enum: ['pending', 'completed', 'failed', 'reversed'], default: 'completed' },
    note: { type: String, default: null },
    reference: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
