
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const {
  signup,
  verifyOTP,
  resendOTP,
  login,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');

// Public routes
router.post(
  '/signup',
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'proofOfAddress', maxCount: 1 },
  ]),
  signup
);

router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/change-password', protect, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
