const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getMessages, sendMessage, getUnreadCount } = require('../controllers/chatController');

router.get('/:deliveryId', protect, getMessages);
router.post('/:deliveryId', protect, sendMessage);
router.get('/:deliveryId/unread', protect, getUnreadCount);

module.exports = router;