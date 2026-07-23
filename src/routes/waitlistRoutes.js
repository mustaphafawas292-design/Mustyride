const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/waitlistController');
const { protect } = require('../middleware/auth');

router.post('/', ctrl.join);
router.get('/count', ctrl.getCount);

router.get('/', protect('admin'), ctrl.listSignups);
router.patch('/:id/contacted', protect('admin'), ctrl.markContacted);

module.exports = router;
