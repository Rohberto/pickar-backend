const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  goOnline,
  goOffline,
  updateLocation,
  getNearbyDrivers,
  getDriverProfile,
} = require('../controllers/driverController');

router.use(protect);

router.post('/online', goOnline);
router.post('/offline', goOffline);
router.patch('/location', updateLocation);
router.get('/nearby', getNearbyDrivers);   // for map preview
router.get('/me', getDriverProfile);

module.exports = router;