const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ratingController');
const { protect } = require('../middleware/auth');

router.post('/', protect('customer', 'rider'), ctrl.submitRating);
router.get('/booking/:bookingId', protect('customer', 'rider', 'admin'), ctrl.getRatingsForBooking);

module.exports = router;
