const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { protect } = require('../middleware/auth');
const { getMe, updateMe, deleteMe } = require('../controllers/userController');

router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);
router.delete('/me', protect, deleteMe);
router.patch('/push-token', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { pushToken: req.body.token });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;