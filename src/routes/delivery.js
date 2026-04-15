const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  initiateDelivery,
  getRideOptions,
  selectRide,
  confirmPickup,
  getDeliveryStatus,
  getDeliveryHistory,
  cancelDelivery,
} = require('../controllers/deliveryController');

// All delivery routes are protected
router.use(protect);

// POST /api/deliveries/initiate
// Step 1 — submit recipient details & package type
router.post('/initiate', initiateDelivery);

// GET /api/deliveries/ride-options
// Step 2 — fetch available ride types with pricing
// Must come before /:id routes to avoid "ride-options" being treated as an id
router.get('/ride-options', getRideOptions);

// GET /api/deliveries/history
// Home screen ride history
// Also must come before /:id routes
router.get('/history', getDeliveryHistory);

// POST /api/deliveries/:id/select-ride
// Step 3 — user picks truck/standard/eco_send/express
router.post('/:id/select-ride', selectRide);

// POST /api/deliveries/:id/confirm-pickup
// Step 4 — confirm pickup location, debit wallet, start driver matching
router.post('/:id/confirm-pickup', confirmPickup);

// GET /api/deliveries/:id/status
// Step 5 — frontend polls this on the "Connecting to a Driver" screen
router.get('/:id/status', getDeliveryStatus);

// POST /api/deliveries/:id/cancel
// Cancel before driver is assigned
router.post('/:id/cancel', cancelDelivery);

module.exports = router;