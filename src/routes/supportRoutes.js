const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/supportController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/tickets', protect('customer', 'rider'), ctrl.createTicket);
router.get('/tickets', protect('customer', 'rider', 'admin'), ctrl.listTickets);
router.get('/tickets/:id', protect('customer', 'rider', 'admin'), ctrl.getTicket);
router.post('/tickets/:id/messages', protect('customer', 'rider', 'admin'), ctrl.addMessage);
router.post('/tickets/:id/attachments', protect('customer', 'rider'), upload.array('photos', 5), ctrl.addAttachment);
router.patch('/tickets/:id/resolve', protect('admin'), ctrl.resolveTicket);

module.exports = router;
