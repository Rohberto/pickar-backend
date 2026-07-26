const express = require('express');
const router = express.Router();
const { getTrackingInfo } = require('../controllers/trackingController');

// Public — no auth middleware on this router at all
router.get('/:token', getTrackingInfo);

module.exports = router;