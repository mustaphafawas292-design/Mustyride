const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminAuthController');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

router.post('/login', authLimiter, ctrl.login);
router.post('/verify-2fa', otpLimiter, ctrl.verifyTwoFactor);
router.patch('/2fa/enable', protect('admin'), ctrl.enableTwoFactor);
router.patch('/2fa/disable', protect('admin'), ctrl.disableTwoFactor);

module.exports = router;
