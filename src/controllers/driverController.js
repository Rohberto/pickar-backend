const Driver = require('../models/driver');

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