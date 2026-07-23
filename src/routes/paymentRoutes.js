const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.post('/initiate', protect('customer'), ctrl.initiate);
router.get('/verify/:txRef', protect('customer'), ctrl.verify);
router.post('/webhook', express.json({ type: '*/*' }), ctrl.webhook); // Flutterwave calls this directly, no auth header
router.post('/:id/refund', protect('admin'), ctrl.refund);

module.exports = router;
