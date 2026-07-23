const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

router.post('/estimate', protect('customer'), ctrl.estimateFare);
router.post('/', protect('customer'), ctrl.createBooking);
router.get('/offers/mine', protect('rider'), ctrl.listMyOffers);
router.get('/', protect('customer', 'rider'), ctrl.listMyBookings);
router.get('/:id', protect('customer', 'rider', 'admin'), ctrl.getBooking);
router.post('/:id/cancel', protect('customer', 'rider'), ctrl.cancelBooking);
router.post('/:id/confirm-receipt', protect('customer'), ctrl.confirmReceipt);
router.post('/:id/messages', protect('customer', 'rider'), ctrl.sendMessage);
router.get('/:id/messages', protect('customer', 'rider'), ctrl.getMessages);
router.post('/:id/pay-wallet', protect('customer'), ctrl.payWithWallet);

router.post('/:id/respond', protect('rider'), ctrl.respondToOffer);
router.patch('/:id/status', protect('rider'), ctrl.updateTripStatus);

module.exports = router;
