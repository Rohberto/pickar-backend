const ChatMessage = require('../models/ChatMessage');
const Delivery = require('../models/Delivery');
const Driver = require('../models/driver');

// GET /api/chat/:deliveryId
// Returns full message history for a delivery
exports.getMessages = async (req, res) => {
  try {
    const { deliveryId } = req.params;

    // Verify requester is part of this delivery
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    const messages = await ChatMessage.find({ delivery: deliveryId })
      .sort({ createdAt: 1 })
      .limit(200);

    // Mark unread messages as read for the requester
    const driver = await Driver.findOne({ user: req.user._id });
    const isDriver = !!driver;
    const readerType = isDriver ? 'user' : 'driver'; // mark opposite side as read

    await ChatMessage.updateMany(
      { delivery: deliveryId, senderType: readerType, read: false },
      { read: true }
    );

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/chat/:deliveryId
// REST fallback for sending a message (socket is primary)
exports.sendMessage = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty' });
    }

    const driver = await Driver.findOne({ user: req.user._id });
    const senderType = driver ? 'driver' : 'user';

    const chatMessage = await ChatMessage.create({
      delivery: deliveryId,
      sender: req.user._id,
      senderType,
      message: message.trim(),
    });

    // Emit via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${deliveryId}`).emit('new_message', chatMessage);
    }

    res.status(201).json({ success: true, data: chatMessage });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/chat/:deliveryId/unread
// Returns unread message count for the requester
exports.getUnreadCount = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const driver = await Driver.findOne({ user: req.user._id });
    const isDriver = !!driver;
    // Count messages sent by the OTHER party that haven't been read
    const senderType = isDriver ? 'user' : 'driver';
    const count = await ChatMessage.countDocuments({
      delivery: deliveryId,
      senderType,
      read: false,
    });
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};