// ── src/routes/wallet.js ─────────────────────────────────────────
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getWallet,
  getTransactions,
  initiateTopup,
  verifyTopup,
} = require('../controllers/walletController');

router.get('/', protect, getWallet);
router.get('/transactions', protect, getTransactions);
router.post('/initiate-topup', protect, initiateTopup);
router.post('/verify-topup', protect, verifyTopup);

module.exports = router;

// ── src/routes/driverEarnings.js ─────────────────────────────────
// (save this as a separate file)
//
// const express = require('express');
// const router = express.Router();
// const { protect } = require('../middleware/auth');
// const {
//   getEarnings,
//   getBankList,
//   getBankAccounts,
//   addBankAccount,
//   removeBankAccount,
//   withdraw,
// } = require('../controllers/driverEarningsController');
//
// router.get('/earnings', protect, getEarnings);
// router.get('/banks', protect, getBankList);
// router.get('/bank-accounts', protect, getBankAccounts);
// router.post('/bank-accounts', protect, addBankAccount);
// router.delete('/bank-accounts/:id', protect, removeBankAccount);
// router.post('/withdraw', protect, withdraw);
//
// module.exports = router;