const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, index: true }, // phone or email
    actorType: { type: String, enum: ['customer', 'rider', 'admin'], required: true },
    purpose: {
      type: String,
      enum: ['signup_verification', 'login_2fa', 'forgot_password'],
      required: true,
    },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-cleanup

module.exports = mongoose.model('Otp', otpSchema);
