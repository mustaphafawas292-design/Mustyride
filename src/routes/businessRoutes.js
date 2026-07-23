const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/businessController');
const { protect } = require('../middleware/auth');

router.post('/', protect('customer'), ctrl.createBusinessAccount);
router.post('/staff', protect('customer'), ctrl.addStaffMember);
router.get('/deliveries', protect('customer'), ctrl.listBusinessDeliveries);
router.get('/spending', protect('customer'), ctrl.getSpendingSummary);
router.get('/invoice', protect('customer'), ctrl.getInvoiceData);

module.exports = router;
