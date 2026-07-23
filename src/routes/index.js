const express = require('express');
const router = express.Router();

router.use('/auth/customer', require('./customerAuthRoutes'));
router.use('/auth/rider', require('./riderAuthRoutes'));
router.use('/auth/admin', require('./adminAuthRoutes'));

router.use('/bookings', require('./bookingRoutes'));
router.use('/tracking', require('./trackingRoutes'));
router.use('/wallet', require('./walletRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/ratings', require('./ratingRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/support', require('./supportRoutes'));
router.use('/calls', require('./callRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/business', require('./businessRoutes'));
router.use('/meta', require('./metaRoutes'));
router.use('/ai', require('./aiRoutes'));
router.use('/waitlist', require('./waitlistRoutes'));

router.get('/health', (req, res) => res.json({ success: true, message: 'MustyRide API is running.' }));

module.exports = router;
