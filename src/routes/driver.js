const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  goOnline,
  goOffline,
  updateLocation,
  getNearbyDrivers,
  getDriverProfile,
  getActiveTrip,
  getActiveTrips,
  updateMe
} = require('../controllers/driverController');
const {
  getEarnings,
  getBankList,
  getBankAccounts,
  addBankAccount,
  removeBankAccount,
  withdraw,
  verifyBankAccount
} = require('../controllers/driverEarningsController');
const User = require('../models/user');
const Driver = require('../models/driver');


router.use(protect);
router.post('/bank-accounts/verify', protect, verifyBankAccount);
router.post('/online', goOnline);
router.post('/offline', goOffline);
router.patch('/location', updateLocation);
router.get('/nearby', getNearbyDrivers);   // for map preview
router.get('/me', getDriverProfile);
router.patch('/push-token', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushToken: req.body.token });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get('/active-trips', getActiveTrips); // plural — returns all
// GET /api/drivers/active-trip
// Returns the current in-progress delivery assigned to this driver
router.get('/active-trip', getActiveTrip);

router.get('/earnings', protect, getEarnings);
router.get('/banks', protect, getBankList);
router.get('/bank-accounts', protect, getBankAccounts);
router.post('/bank-accounts', protect, addBankAccount);
router.delete('/bank-accounts/:id', protect, removeBankAccount);
router.post('/withdraw', protect, withdraw);
 


// Add this line alongside your existing driver routes
router.patch('/me', protect, updateMe);

module.exports = router;