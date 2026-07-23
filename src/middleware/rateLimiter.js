const rateLimit = require('express-rate-limit');

// Loose limiter for general auth traffic
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

// Tighter limiter specifically for OTP requests, since these cost money (SMS) and
// are a common fraud/abuse vector (module 15).
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please wait before requesting another.' },
});

module.exports = { authLimiter, otpLimiter };
