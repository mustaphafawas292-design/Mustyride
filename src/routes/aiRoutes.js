const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiController');
const { authLimiter } = require('../middleware/rateLimiter');

// Public - no login needed to ask for help, but rate-limited since each
// call costs money once a real API key is set.
router.post('/chat', authLimiter, ctrl.chat);

module.exports = router;
