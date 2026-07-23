const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ['rider', 'customer'], required: true },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'ownerModel',
    },
    ownerModel: { type: String, required: true, enum: ['Rider', 'User'] },

    availableBalance: { type: Number, default: 0 }, // withdrawable / spendable now
    pendingBalance: { type: Number, default: 0 }, // e.g. earnings not yet cleared

    // Rider-only rollups (module 6) - harmless zero values for customer wallets
    totalEarnings: { type: Number, default: 0 },
    totalCommissionPaid: { type: Number, default: 0 },
    totalBonuses: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },

    // Customer-only rollups (module 7)
    totalToppedUp: { type: Number, default: 0 },
    totalPromoCredits: { type: Number, default: 0 },
    totalRefunded: { type: Number, default: 0 },

    currency: { type: String, default: 'NGN' },
  },
  { timestamps: true }
);

walletSchema.index({ owner: 1, ownerType: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', walletSchema);
