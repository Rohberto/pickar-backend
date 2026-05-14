const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { protect } = require('../middleware/auth');
const { getMe, updateMe } = require('../controllers/userController');

router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);
router.patch('/push-token', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { pushToken: req.body.token });
  res.json({ success: true });
});

module.exports = router;