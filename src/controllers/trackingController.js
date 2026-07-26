const Delivery = require('../models/Delivery');

// @desc    Get sanitized delivery info for the public tracking page
// @route   GET /api/track/:token
// @access  Public — no auth. Reachable by anyone with the link.
//
// SECURITY NOTE: pickupCode and deliveryCode are deliberately NOT returned
// here. Those are verification secrets shown only inside the sender/driver
// apps — exposing them on a public link would let anyone confirm a fake
// pickup/delivery.
exports.getTrackingInfo = async (req, res) => {
  try {
    const { token } = req.params;

    const delivery = await Delivery.findOne({ trackingToken: token }).populate(
      'driver',
      'name phone vehicle rating photo'
    );

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Tracking link not found or has expired',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        status: delivery.status,
        pickupLabel: delivery.pickupAddress?.label || null,
        destinationLabel: delivery.recipient?.address?.label || null,
        recipientName: delivery.recipient?.name || null,
        packageType: delivery.packageType,
        rideType: delivery.rideType,
        price: delivery.price,
        driver: delivery.driver
          ? {
              name: delivery.driver.name,
              vehicle: delivery.driver.vehicle,
              rating: delivery.driver.rating,
              photo: delivery.driver.photo || null,
            }
          : null,
        timeline: delivery.timeline,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      },
    });
  } catch (err) {
    console.error('getTrackingInfo error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};