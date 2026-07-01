const Delivery = require('../models/Delivery');
const { matchDriver } = require('../services/matchingService');
const { debitWallet } = require('../services/walletService');
const { releaseEscrowToDriver, refundEscrow } = require('../services/walletService');

// Pricing config per ride type (can move to DB later)
const RIDE_TYPES = [
  {
    type: 'truck',
    label: 'Truck',
    description: 'Best for house loads',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: 11,
  },
  {
    type: 'standard',
    label: 'Standard',
    description: 'Regular bike delivery',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: 5,
  },
  {
    type: 'eco_send',
    label: 'Eco Send',
    description: 'Budget-friendly option',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: 5,
  },
  {
    type: 'express',
    label: 'Express',
    description: 'Delivers quickly',
    basePrice: 8500,
    discountedPrice: 6000,
    eta: null,
  },
];


// POST /api/deliveries/initiate
exports.initiateDelivery = async (req, res) => {
  try {
    const {
      pickupAddress,
      recipientAddress,
      recipientName,
      recipientPhone,
      packageType,
      agreedToInsurance,
    } = req.body;

    if (
      !pickupAddress ||
      !recipientAddress ||
      !recipientName ||
      !recipientPhone ||
      !packageType
    ) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    if (!agreedToInsurance) {
      return res.status(400).json({
        success: false,
        message: 'You must agree to the insurance policy',
      });
    }

    const delivery = await Delivery.create({
      user: req.user._id,
      pickupAddress,
      recipient: {
        address: recipientAddress,
        name: recipientName,
        phone: recipientPhone,
      },
      packageType,
      agreedToInsurance,
    });

    res.status(201).json({
      success: true,
      message: 'Delivery initiated',
      data: delivery,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// GET /api/deliveries/ride-options
// Frontend calls this to display the "Choose a ride" screen
exports.getRideOptions = async (req, res) => {
  try {
    // Future: accept ?fromLat=&fromLng=&toLat=&toLng= 
    // and calculate dynamic pricing via Google Maps Distance Matrix API
    res.status(200).json({
      success: true,
      data: RIDE_TYPES,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// POST /api/deliveries/:id/select-ride
exports.selectRide = async (req, res) => {
  try {
    const { rideType } = req.body;

    const validTypes = RIDE_TYPES.map((r) => r.type);
    if (!validTypes.includes(rideType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ride type selected',
      });
    }

    const selected = RIDE_TYPES.find((r) => r.type === rideType);

    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        rideType,
        price: selected.discountedPrice,
        estimatedArrival: selected.eta,
        status: 'finding_driver',
      },
      { new: true }
    );

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found',
      });
    }

    // Respond to client immediately — don't await matchDriver
    // matchDriver runs in the background and notifies via socket
    res.status(200).json({ success: true, data: delivery });

    // Trigger driver matching — works for all ride types including truck
    const { matchDriver } = require('../services/matchingService');
    const io = req.app.get('io');
    matchDriver(delivery._id, io).catch((err) =>
      console.error('[selectRide] matchDriver error:', err)
    );

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// GET /api/deliveries/:id/status
// Frontend polls this while on the "Connecting to a Driver" screen
exports.getDeliveryStatus = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id)
      .populate('driver', 'name phone vehicle rating location photo')
      .populate('user', 'name phone photo');

    console.log(`[getDeliveryStatus] ID: ${req.params.id} | Found: ${!!delivery} | Requester: ${req.user?._id}`);

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    // TEMPORARY - Allow both user and driver
    res.status(200).json({ success: true, data: delivery });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// GET /api/deliveries/history
// Powers the "Ride history" section on the home screen
exports.getDeliveryHistory = async (req, res) => {
  try {
    const deliveries = await Delivery.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('driver', 'name phone vehicle');

    res.status(200).json({
      success: true,
      count: deliveries.length,
      data: deliveries,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// POST /api/deliveries/:id/cancel
exports.cancelDelivery = async (req, res) => {
  try {
    // Remove the status restriction — allow cancel from any active state
    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
await refundEscrow({ userId: delivery.user, amount: delivery.price, deliveryId: delivery._id });
    if (!delivery) return res.status(404).json({ success: false });

    const io = req.app.get('io');

    if (delivery.driver) {
      const Driver = require('../models/driver');
      await Driver.findByIdAndUpdate(delivery.driver, { status: 'online' });
      io.to(`driver_${delivery.driver}`).emit('trip_cancelled', {
        deliveryId: delivery._id,
        message: 'The user has cancelled this trip.',
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.confirmPickup = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    if (!delivery.rideType) {
      return res.status(400).json({
        success: false,
        message: 'Please select a ride type before confirming pickup',
      });
    }

    // Debit wallet before matching a driver
    try {
      await debitWallet({
        userId: req.user._id,
        amount: delivery.price,
        deliveryId: delivery._id,
        description: `Payment for ${delivery.rideType} delivery`,
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message, // "Insufficient wallet balance"
      });
    }

    // Update status after successful payment
    delivery.status = 'finding_driver';
    await delivery.save();

    // Kick off driver matching
    const io = req.app.get('io');
    matchDriver(delivery._id, io);

    res.status(200).json({
      success: true,
      message: 'Searching for a driver for you...',
      data: delivery,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
// POST /api/deliveries/:id/driver-arrived
exports.driverArrived = async (req, res) => {
  try {
    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { status: 'driver_arrived' },
      { new: true }
    );
    console.log(`[driverArrived] Updated delivery status to driver_arrived for delivery ${req.params.id}`);
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });
 console.log(`[driverArrived] Emitting to user_${delivery.user}`);
    // Notify user via socket
    const io = req.app.get('io');
    io.to(`user_${delivery.user}`).emit('driver_arrived', {
      deliveryId: delivery._id,
    });

    res.json({ success: true, data: delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/deliveries/:id/verify-pickup
// Driver enters the pickup code shown by the user
exports.verifyPickupCode = async (req, res) => {
  try {
    const { pickupCode } = req.body;
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    if (delivery.pickupCode !== pickupCode) {
      return res.status(400).json({ success: false, message: 'Invalid pickup code' });
    }

    // Generate delivery code for recipient verification
    const deliveryCode = Math.floor(1000 + Math.random() * 9000).toString();

    await Delivery.findByIdAndUpdate(req.params.id, {
      status: 'in_transit',
      deliveryCode,
    });

    // Notify user package has been picked up
    const io = req.app.get('io');
    io.to(`user_${delivery.user}`).emit('package_picked_up', {
      deliveryId: delivery._id,
      deliveryCode,
      pickupTime: new Date().toISOString(),
    });

    res.json({ success: true, data: { deliveryCode } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/deliveries/:id/verify-delivery
// Driver enters the delivery code confirmed by the recipient
exports.verifyDeliveryCode = async (req, res) => {
  try {
    const { deliveryCode } = req.body;
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    if (delivery.deliveryCode !== deliveryCode) {
      return res.status(400).json({ success: false, message: 'Invalid delivery code' });
    }

    res.json({ success: true, message: 'Code verified' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/deliveries/:id/delivered
exports.markDelivered = async (req, res) => {
  try {
    const { driverId } = req.body;
    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { status: 'delivered' },
      { new: true }
    );
await releaseEscrowToDriver({ userId: delivery.user, driverId: delivery.driver, amount: delivery.price, deliveryId: delivery._id });
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    // Free up driver
    if (driverId) {
      const Driver = require('../models/driver');
      await Driver.findByIdAndUpdate(driverId, { status: 'online' });
    }

    // Notify user delivery is complete
    const io = req.app.get('io');
    io.to(`user_${delivery.user}`).emit('package_delivered', {
      deliveryId: delivery._id,
    });

    res.json({ success: true, data: delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getActiveDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      user: req.user._id,
      status: {
        $in: ['finding_driver', 'driver_assigned', 'driver_arrived', 'in_transit'],
      },
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: delivery ?? null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
// POST /api/deliveries/:id/assign-driver
// Called by real driver app on accept
exports.assignDriver = async (req, res) => {
  try {
    const Driver = require('../models/driver');

    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

    await Delivery.findByIdAndUpdate(req.params.id, {
      status: 'driver_assigned',
      driver: driver._id,
      pickupCode,
    });

    if (driver.status !== 'busy') {
      await Driver.findByIdAndUpdate(driver._id, { status: 'busy' });
    }

    const driverLocation = driver.location?.coordinates
      ? { lat: driver.location.coordinates[1], lng: driver.location.coordinates[0] }
      : null;

    const io = req.app.get('io');
    io.to(`user_${delivery.user}`).emit('driver_assigned', {
      deliveryId: delivery._id,
      driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicle: driver.vehicle,
        rating: driver.rating,
        photo: driver.photo ?? null,  
      },
      pickupCode,
      eta: '20 mins',
      driverLocation,
    });

    res.json({ success: true, data: { pickupCode } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// ADD TO: src/controllers/deliveryController.js
// ─────────────────────────────────────────────────────────────────

exports.cancelStuck = async (req, res) => {
  try {
    // Cancel all deliveries stuck in finding_driver or pending for this user
    const result = await Delivery.updateMany(
      {
        user: req.user._id,
        status: { $in: ['finding_driver', 'pending'] },
      },
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Cancelled by user — stuck in search',
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} delivery(s) cancelled.`,
      cancelled: result.modifiedCount,
    });
  } catch (err) {
    console.error('[cancelStuck] error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// ─────────────────────────────────────────────────────────────────
// ADD TO: src/routes/delivery.js
// (alongside your other delivery routes)
// ─────────────────────────────────────────────────────────────────

// router.post('/cancel-stuck', protect, deliveryController.cancelStuck);