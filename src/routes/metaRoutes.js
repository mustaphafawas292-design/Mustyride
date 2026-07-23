const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/metaController');

router.get('/commission', ctrl.getCommissionNotice);

module.exports = router;
