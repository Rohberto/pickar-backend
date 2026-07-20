const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/adminAuth');

// ─── Public ───────────────────────────────────────────────────────────────────
router.post('/auth/login', ctrl.login);

// ─── All routes below require a valid admin JWT ───────────────────────────────
router.use(protect);

// Auth
router.get('/auth/me', ctrl.getMe);
router.post('/auth/create', restrictTo('super_admin'), ctrl.createAdmin);

// Dashboard
router.get('/dashboard', ctrl.getDashboard);

// Users (senders)
router.get('/users', ctrl.getUsers);
router.get('/users/:id', ctrl.getUserById);
router.patch('/users/:id/suspend', ctrl.toggleUserSuspension);

// Drivers
router.get('/drivers', ctrl.getDrivers);
router.get('/drivers/:id', ctrl.getDriverById);
router.patch('/drivers/:id/approval', ctrl.updateDriverApproval);
router.patch('/drivers/:id/suspend', ctrl.toggleDriverSuspension);

// Deliveries / Rides
router.get('/deliveries', ctrl.getDeliveries);
router.get('/deliveries/:id', ctrl.getDeliveryById);


// Payments
router.get('/payments', ctrl.getPayments);
router.get('/payments/stats', ctrl.getPaymentStats);
router.get('/payments/topups', ctrl.getWalletTopups);
router.get('/payments/withdrawals', ctrl.getWithdrawals);
router.patch('/payments/withdrawals/:id/approve', restrictTo('super_admin'), ctrl.approveWithdrawal);
router.patch('/payments/withdrawals/:id/reject', ctrl.rejectWithdrawal);

// ─── Migrations (super_admin only) ───────────────────────────────────────────
router.post('/migrations/ratings', restrictTo('super_admin'), ctrl.migrateRatings);

module.exports = router;