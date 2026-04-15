const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getWallet,
  fundWallet,
  verifyFunding,
  paystackWebhook,
  getTransactions,
} = require('../controllers/walletController');

// ⚠️ Webhook must come BEFORE protect middleware
// Paystack calls this with raw body — no auth token
router.post('/webhook', paystackWebhook);

// All routes below are protected
router.use(protect);

router.get('/', getWallet);
router.post('/fund', fundWallet);
router.get('/verify/:reference', verifyFunding);
router.get('/transactions', getTransactions);

module.exports = router;