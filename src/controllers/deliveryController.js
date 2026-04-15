const Delivery = require('../models/Delivery');
const { matchDriver } = require('../services/matchingService');
const { debitWallet } = require('../services/walletService');

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
      },
      { new: true }
    );

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found',
      });
    }

    res.status(200).json({ success: true, data: delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// GET /api/deliveries/:id/status
// Frontend polls this while on the "Connecting to a Driver" screen
exports.getDeliveryStatus = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('driver', 'name phone vehicle rating location');

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found',
      });
    }

    res.status(200).json({ success: true, data: delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    const delivery = await Delivery.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        // Can only cancel before a driver is assigned
        status: { $in: ['pending', 'finding_driver'] },
      },
      {
        status: 'cancelled',
        'timeline.cancelledAt': new Date(),
      },
      { new: true }
    );

    if (!delivery) {
      return res.status(400).json({
        success: false,
        message: 'Delivery not found or cannot be cancelled at this stage',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Delivery cancelled successfully',
      data: delivery,
    });
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
      message: 'Finding a driver for you...',
      data: delivery,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};