const express = require('express');
const router = express.Router();
const {
  getPlans,
  createBatchOrder,
  getDeliveries,
  getDashboardStats,
} = require('../controllers/businessController');
const { protectBusiness, requireActiveBusiness } = require('../middleware/businessAuth');

// Public — shown on signup/pricing page
router.get('/plans', getPlans);

// Everything below requires a logged-in dispatcher
router.use(protectBusiness);

router.get('/dashboard', getDashboardStats);
router.get('/orders', getDeliveries);

// Creating orders additionally requires the business to be approved + active
router.post('/orders/batch', requireActiveBusiness, createBatchOrder);

module.exports = router;