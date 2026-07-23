const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customerAuthController');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

router.post('/signup', authLimiter, ctrl.signup);
router.post('/verify-otp', otpLimiter, ctrl.verifySignupOtp);
router.post('/login', authLimiter, ctrl.login);
router.post('/forgot-password', otpLimiter, ctrl.forgotPassword);
router.post('/reset-password', otpLimiter, ctrl.resetPassword);

router.get('/me', protect('customer'), ctrl.getProfile);
router.patch('/me', protect('customer'), ctrl.updateProfile);
router.post('/addresses', protect('customer'), ctrl.addSavedAddress);
router.delete('/addresses/:addressId', protect('customer'), ctrl.removeSavedAddress);

module.exports = router;
