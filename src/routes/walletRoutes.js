const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

router.get('/me', protect('customer', 'rider'), ctrl.getMyWallet);
router.get('/me/transactions', protect('customer', 'rider'), ctrl.listMyTransactions);
router.get('/me/summary', protect('rider'), ctrl.getEarningsSummary);
router.post('/rider/withdraw', protect('rider'), ctrl.requestWithdrawal);
router.post('/customer/withdraw', protect('customer'), ctrl.requestCustomerWithdrawal);

module.exports = router;
