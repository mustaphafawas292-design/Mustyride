const mongoose = require('mongoose');

const businessAccountSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    businessType: { type: String, enum: ['restaurant', 'pharmacy', 'supermarket', 'online_store', 'other'], default: 'other' },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    contactPhone: { type: String, required: true },
    contactEmail: { type: String, default: null },
    address: { type: String, default: null },

    // Staff members are User documents with business = this._id and businessRole set;
    // this array is a convenience index for quick "who works here" lookups.
    staff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    totalSpend: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },

    billingCycle: { type: String, enum: ['pay_as_you_go', 'weekly_invoice', 'monthly_invoice'], default: 'pay_as_you_go' },

    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BusinessAccount', businessAccountSchema);
