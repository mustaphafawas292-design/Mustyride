const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { protect } = require('../middleware/auth');

router.get('/dashboard', protect('admin'), ctrl.getDashboard);

router.get('/riders/pending', protect('admin'), ctrl.listPendingRiders);
router.patch('/riders/:id/approve', protect('admin'), ctrl.approveRider);
router.patch('/riders/:id/reject', protect('admin'), ctrl.rejectRider);
router.patch('/riders/:id/suspend', protect('admin'), ctrl.suspendRider);
router.patch('/riders/:id/unsuspend', protect('admin'), ctrl.unsuspendRider);

router.get('/fraud-flags', protect('admin'), ctrl.listFraudFlags);
router.patch('/fraud-flags/:id', protect('admin'), ctrl.reviewFraudFlag);

router.get('/fare-config', protect('admin'), ctrl.getFareConfig);
router.patch('/fare-config', protect('admin'), ctrl.updateFareConfig);

module.exports = router;
