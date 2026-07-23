const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect('customer', 'rider', 'admin'), ctrl.listMyNotifications);
router.patch('/:id/read', protect('customer', 'rider', 'admin'), ctrl.markAsRead);
router.patch('/read-all', protect('customer', 'rider', 'admin'), ctrl.markAllAsRead);

module.exports = router;
