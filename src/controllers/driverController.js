const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');

// POST /api/drivers/online
exports.goOnline = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      {
        status: 'online',
        location: { type: 'Point', coordinates: [lng, lat] },
      },
      { new: true }
    );
    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/drivers/offline
exports.goOffline = async (req, res) => {
  try {
    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      { status: 'offline', socketId: null },
      { new: true }
    );
    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/drivers/location
exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await Driver.findOneAndUpdate(
      { user: req.user._id },
      { location: { type: 'Point', coordinates: [lng, lat] } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/drivers/nearby?lat=&lng=&rideType=
// Shows available drivers on the map before booking
exports.getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, rideType } = req.query;

    const filter = {
      status: 'online',
      ...(rideType === 'truck' && { 'vehicle.type': 'truck' }),
      ...(rideType !== 'truck' && { 'vehicle.type': 'bike' }),
    };

    const drivers = await Driver.find({
      ...filter,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: 5000,
        },
      },
    }).select('name vehicle rating location');

    res.json({ success: true, count: drivers.length, data: drivers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/drivers/me
exports.getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

//get active trips 
exports.getActiveTrip = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    const Delivery = require('../models/Delivery');
    const delivery = await Delivery.findOne({
      driver: driver._id,
      status: { $in: ['driver_assigned', 'driver_arrived', 'in_transit'] },
    }).populate('user', 'fullName phone photo');

    res.json({ success: true, data: delivery ?? null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getActiveTrips = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false });

    // Return ALL active deliveries sorted oldest first
    // (oldest = process first)
    const deliveries = await Delivery.find({
      driver: driver._id,
      status: { $in: ['driver_assigned', 'driver_arrived', 'in_transit'] },
    })
      .sort({ createdAt: 1 })
      .populate('user', 'fullName phone');

    res.json({ success: true, data: deliveries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/drivers/me
exports.updateMe = async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'photo', 'vehicle'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found' });

    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};