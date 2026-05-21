const User = require('../models/user');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Delivery = require('../models/Delivery');
const { refundEscrow } = require('../services/walletService');

// GET /api/users/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/users/me
exports.updateMe = async (req, res) => {
  try {
    const allowed = ['fullName', 'phone', 'photo'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteMe = async (req, res) => {
  try {
    const userId = req.user._id;
    const { reason } = req.body; // optional — for analytics
 
    // 1. Cancel any active deliveries and refund escrow to the user
    const activeDeliveries = await Delivery.find({
      user: userId,
      status: { $in: ['pending', 'finding_driver', 'driver_assigned', 'driver_arrived', 'in_transit'] },
    });
 
    for (const delivery of activeDeliveries) {
      // Refund escrow if funds were held
      if (delivery.price && delivery.status !== 'pending') {
        try {
          await refundEscrow({
            userId,
            amount: delivery.price,
            deliveryId: delivery._id,
          });
        } catch (_) {}
      }
 
      // Cancel the delivery and notify driver if one was assigned
      delivery.status = 'cancelled';
      await delivery.save();
 
      if (delivery.driver) {
        const io = req.app.get('io');
        if (io) {
          io.to(`driver_${delivery.driver}`).emit('trip_cancelled', {
            deliveryId: delivery._id,
            message: 'User deleted their account.',
          });
        }
        // Free up the driver
        const Driver = require('../models/driver');
        await Driver.findByIdAndUpdate(delivery.driver, { status: 'online' });
      }
    }
 
    // 2. Delete wallet
    await Wallet.findOneAndDelete({ user: userId });
 
    // 3. Delete transactions (optional — comment out to keep for financial records)
    await Transaction.deleteMany({ user: userId });
 
    // 4. Delete the user
    await User.findByIdAndDelete(userId);
 
    // 5. Log reason for analytics (optional — you can store in a separate collection)
    if (reason) {
      console.log(`Account deleted. UserId: ${userId}, Reason: ${reason}`);
    }
 
    res.json({ success: true, message: 'Account deleted successfully.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
 