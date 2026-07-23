const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/callController');
const { protect } = require('../middleware/auth');

router.post('/rider', protect('customer'), ctrl.callRider);
router.post('/customer', protect('rider'), ctrl.callCustomer);
router.post('/support', protect('customer', 'rider'), ctrl.callSupport);

module.exports = router;
