const Rating   = require('../models/Rating');
const Driver   = require('../models/driver');
const Delivery = require('../models/Delivery');
const User     = require('../models/user');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// POST /api/deliveries/:id/rate
exports.rateDelivery = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    if (delivery.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not your delivery' });
    }

    if (delivery.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Delivery not yet completed' });
    }

    const newRating = await Rating.findOneAndUpdate(
      { delivery: delivery._id },
      {
        delivery: delivery._id,
        driver: delivery.driver,
        user: req.user._id,
        rating,
        comment: comment ?? '',
      },
      { upsert: true, new: true, returnDocument: 'after' }
    );

    // Recalculate driver average
    const allRatings = await Rating.find({ driver: delivery.driver });
    const average = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
    const rounded = Math.round(average * 10) / 10;

    await Driver.findByIdAndUpdate(delivery.driver, {
      'rating.average': rounded,
      'rating.count':   allRatings.length,
    });

    // ── Send push notification to driver ──────────────────────────
    // Drivers log in as users so their push token is on the User model
    try {
      const driver = await Driver.findById(delivery.driver);
      if (driver?.user) {
        const driverUser = await User.findById(driver.user);
        if (driverUser?.pushToken && Expo.isExpoPushToken(driverUser.pushToken)) {
          const stars = '⭐'.repeat(rating);
          const message = comment?.trim()
            ? `${stars}\n"${comment.trim()}"`
            : stars;

          await expo.sendPushNotificationsAsync([{
            to: driverUser.pushToken,
            sound: 'default',
            title: `You received a ${rating}-star rating!`,
            body: message,
            data: { type: 'rating', deliveryId: delivery._id, rating },
          }]);
        }
      }
    } catch (notifErr) {
      // Don't fail the rating if notification fails
      console.error('[Rating] push notification failed:', notifErr.message);
    }

    res.json({ success: true, data: newRating });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};