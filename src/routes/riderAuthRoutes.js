const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/riderAuthController');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');

router.post('/signup', authLimiter, ctrl.signup);
router.post('/verify-otp', otpLimiter, ctrl.verifySignupOtp);
router.post('/login', authLimiter, ctrl.login);
router.post('/forgot-password', otpLimiter, ctrl.forgotPassword);
router.post('/reset-password', otpLimiter, ctrl.resetPassword);

router.post(
  '/documents',
  protect('rider'),
  upload.fields([
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'bikePhoto', maxCount: 1 },
    { name: 'meansOfId', maxCount: 1 },
  ]),
  ctrl.uploadDocuments
);

router.get('/me', protect('rider'), ctrl.getProfile);
router.patch('/me', protect('rider'), ctrl.updateProfile);
router.patch('/availability', protect('rider'), ctrl.updateAvailability);

module.exports = router;
