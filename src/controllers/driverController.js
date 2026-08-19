const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');

// POST /api/drivers/online
exports.goOnline = async (req, res) => {
  try {
    if (!req.user.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. You cannot go online yet.',
      });
    }
    if (req.user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended.',
      });
    }

    const { lat, lng } = req.body;
    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      { status: 'online', location: { type: 'Point', coordinates: [lng, lat] } },
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
    const { candidateFilterFor } = require('../services/matchingService');

    const drivers = await Driver.find({
      status: 'online',
      ...candidateFilterFor(rideType),
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

// GET /api/drivers/rides
// Powers the "Rides" tab on the driver app — was completely stubbed out
// on the frontend with no endpoint behind it at all.
exports.getRideHistory = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    const deliveries = await Delivery.find({ driver: driver._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'fullName phone')
      .populate('business', 'name');

    res.json({ success: true, count: deliveries.length, data: deliveries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/drivers/me
exports.updateMe = async (req, res) => {
  try {
    const existing = await Driver.findOne({ user: req.user._id });
    if (!existing) return res.status(404).json({ success: false, message: 'Driver profile not found' });

    const allowed = ['name', 'phone', 'photo', 'nationality', 'stateOfOrigin', 'residentialAddress'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // ── Ride type registration — pick one of the real user-facing ride
    // types (standard/eco_send/express/truck), one time only, then
    // locked. vehicle.type (bike/truck) is derived from it and drives
    // matching exactly as it always has — this whole block is just about
    // WHICH specific ride type gets recorded, and making sure it can't
    // be changed after the fact from either this or the account screen.
    if (req.body.rideType !== undefined || req.body.vehicle !== undefined) {
      const requestedPlate = req.body.vehicle?.plateNumber ?? req.body.plateNumber;

      if (existing.rideType) {
        // Already registered — plate number (new vehicle, same class)
        // can still change; the ride type itself cannot.
        if (req.body.rideType && req.body.rideType !== existing.rideType) {
          return res.status(400).json({
            success: false,
            message: 'Your ride type is locked once registered and cannot be changed. Contact support if this needs to change.',
          });
        }
        if (requestedPlate) {
          updates.vehicle = { type: existing.vehicle?.type, plateNumber: String(requestedPlate).toUpperCase() };
        }
      } else {
        // First-time registration
        const { RIDE_TYPES } = require('../config/rideTypes');
        const rateCard = RIDE_TYPES.find((r) => r.type === req.body.rideType);
        if (!rateCard) {
          return res.status(400).json({ success: false, message: 'Please select a valid ride type.' });
        }
        if (!requestedPlate) {
          return res.status(400).json({ success: false, message: 'Plate number is required.' });
        }
        updates.rideType = rateCard.type;
        updates.vehicle = { type: rateCard.vehicleClass, plateNumber: String(requestedPlate).toUpperCase() };
      }
    }

    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};