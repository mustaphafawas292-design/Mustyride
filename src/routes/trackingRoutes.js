const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/trackingController');
const { protect } = require('../middleware/auth');

router.post('/ping', protect('rider'), ctrl.submitPing);
router.get('/by-code/:trackingId', ctrl.getLiveTrackingByCode); // public - no auth needed
router.get('/:bookingId', protect('customer', 'rider', 'admin'), ctrl.getLiveTracking);

module.exports = router;
