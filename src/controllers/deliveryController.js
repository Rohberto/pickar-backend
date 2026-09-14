const Delivery = require('../models/Delivery');
const { debitWallet } = require('../services/walletService');
const { releaseEscrowToDriver, refundEscrow } = require('../services/walletService');
const { notifyDelivery } = require('../utils/notifyDelivery');
const { calculateAllFares, calculateFare } = require('../services/pricingService');
const { RIDE_TYPES } = require('../config/rideTypes');
const { nanoid } = require('nanoid');

// Lagos-only cap — interstate delivery isn't live yet. Enforced server-side
// (not just in the app UI) using a padded bounding box around Lagos State,
// since a client-side-only cap can be bypassed by anyone hitting the API
// directly.
const LAGOS_BOUNDS = { minLat: 6.30, maxLat: 6.75, minLng: 2.65, maxLng: 4.35 };
const isWithinLagos = (coords) => {
  const lat = coords?.lat;
  const lng = coords?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  return (
    lat >= LAGOS_BOUNDS.minLat && lat <= LAGOS_BOUNDS.maxLat &&
    lng >= LAGOS_BOUNDS.minLng && lng <= LAGOS_BOUNDS.maxLng
  );
};

// Scheduled deliveries need enough lead time for the sweep to have a
// meaningful window to work with, and to stop someone "scheduling" a
// pickup for 90 seconds from now as a backdoor around the normal
// immediate-search flow.
const MIN_SCHEDULE_LEAD_MINUTES = 20;

// POST /api/deliveries/initiate
exports.initiateDelivery = async (req, res) => {
  try {
    const {
      pickupAddress,
      recipientAddress,
      recipientName,
      recipientPhone,
      packageType,
      weightKg,
      agreedToInsurance,
      scheduledFor,
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

    if (!isWithinLagos(pickupAddress?.coordinates) || !isWithinLagos(recipientAddress?.coordinates)) {
      return res.status(400).json({
        success: false,
        message: 'We currently only deliver within Lagos. Interstate delivery is coming soon.',
      });
    }

    let scheduledForDate = null;
    if (scheduledFor) {
      scheduledForDate = new Date(scheduledFor);
      const minAllowed = Date.now() + MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000;
      if (isNaN(scheduledForDate.getTime()) || scheduledForDate.getTime() < minAllowed) {
        return res.status(400).json({
          success: false,
          message: `Scheduled time must be at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes from now.`,
        });
      }
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
      weightKg: weightKg ? parseFloat(weightKg) : 1,
      agreedToInsurance,
      scheduledFor: scheduledForDate,
      trackingToken: nanoid(10),
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
    const { deliveryId } = req.query;

    let pickupCoords, dropoffCoords, weightKg;

    if (deliveryId) {
      const delivery = await Delivery.findById(deliveryId);
      if (!delivery) {
        return res.status(404).json({ success: false, message: 'Delivery not found' });
      }
      pickupCoords = delivery.pickupAddress.coordinates;
      dropoffCoords = delivery.recipient.address.coordinates;
      weightKg = delivery.weightKg ?? 1; // weight now travels with the delivery doc
    } else {
      // Fallback: allow direct coords in query for a pre-delivery quote screen
      // (no delivery doc exists yet, so no stored weight — defaults to 1kg)
      const { fromLat, fromLng, toLat, toLng } = req.query;
      if (!fromLat || !fromLng || !toLat || !toLng) {
        return res.status(400).json({
          success: false,
          message: 'deliveryId or fromLat/fromLng/toLat/toLng is required',
        });
      }
      pickupCoords = { lat: parseFloat(fromLat), lng: parseFloat(fromLng) };
      dropoffCoords = { lat: parseFloat(toLat), lng: parseFloat(toLng) };
      weightKg = 1;
    }

    const fares = calculateAllFares({ pickupCoords, dropoffCoords, weightKg });

    res.status(200).json({ success: true, data: fares });
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

    const existing = await Delivery.findOne({ _id: req.params.id, user: req.user._id });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    const fare = calculateFare({
      pickupCoords: existing.pickupAddress.coordinates,
      dropoffCoords: existing.recipient.address.coordinates,
      weightKg: existing.weightKg ?? 1,
      rideType,
    });

    // Status stops at ride_selected here — NOT finding_driver. Matching
    // only starts once the user actually reaches the finding-driver
    // screen and calls start-search below. This closes the race where a
    // fast driver could be offered and accept a trip before the user's
    // app had even navigated to the screen that shows it happening.
    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        rideType,
        price: fare.total,
        fareBreakdown: fare.breakdown,
        distanceKm: fare.distanceKm,
        pickupZone: fare.pickupZone,
        dropoffZone: fare.dropoffZone,
        estimatedArrival: fare.eta,
        status: 'ride_selected',
      },
      { new: true }
    );

    res.status(200).json({ success: true, data: delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/deliveries/:id/start-search
// Called by finding-driver.tsx on mount — this, not select-ride, is what
// actually kicks off matchDriver. Idempotent: if search already started
// (or the delivery has moved past finding_driver), it's a no-op so a
// remount or slow double-tap can't trigger two parallel searches.
exports.startSearch = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.id, user: req.user._id });
    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    if (delivery.status === 'ride_selected') {
      await Delivery.findByIdAndUpdate(delivery._id, { status: 'finding_driver' });
    } else if (delivery.status !== 'finding_driver') {
      // Already past this point (assigned, delivered, cancelled, etc.) —
      // nothing to start, just report current state back.
      return res.json({ success: true, data: delivery, alreadyStarted: true });
    }

    res.json({ success: true, message: 'Searching for a driver...' });

    const io = req.app.get('io');
    const { matchDriver } = require('../services/matchingService');
    matchDriver(delivery._id, io).catch((err) =>
      console.error('[startSearch] matchDriver error:', err)
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


// Statuses reached only after confirmPickup's debitWallet call has actually
// moved money into escrow. Cancelling before any of these (still 'pending',
// 'pending_payment', or 'ride_selected') means nothing was ever escrowed —
// refunding anyway would credit the wallet with money that was never taken.
const ESCROW_FUNDED_STATUSES = [
  'scheduled', 'finding_driver', 'no_driver_found',
  'driver_assigned', 'driver_arrived', 'picked_up', 'in_transit',
];

// POST /api/deliveries/:id/cancel
exports.cancelDelivery = async (req, res) => {
  try {
    // Read first so we know the PRE-cancel status (needed to decide whether
    // escrow was ever funded) and so a bad id 404s cleanly instead of
    // throwing when we try to read `.user`/`.price` off null. Previously
    // this called findByIdAndUpdate then immediately read `delivery.user`
    // on the line before the null-check even ran, throwing a TypeError on
    // typos'd ids instead of a 404 — and refunded escrow unconditionally,
    // which could credit a wallet for a delivery that was cancelled before
    // payment was ever debited into escrow.
    const existing = await Delivery.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false });

    const wasEscrowFunded = ESCROW_FUNDED_STATUSES.includes(existing.status);

    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );

    if (wasEscrowFunded) {
      await refundEscrow({ userId: delivery.user, amount: delivery.price, deliveryId: delivery._id });
    }

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

    // Debit wallet — payment happens here, at pickup confirmation, whether
    // the trip starts now or is scheduled for later. Deliberately does NOT
    // flip status to finding_driver or call matchDriver: that's
    // start-search's job, called by finding-driver.tsx once it has
    // actually mounted and is listening for a driver_assigned event. This
    // used to also trigger matchDriver right here, which meant a driver
    // could be matched and accept the trip before the user's app had even
    // navigated to the screen that shows it happening — the exact race
    // start-search's own design was meant to prevent. Leaving status
    // untouched (still ride_selected) means start-search does the one and
    // only transition to finding_driver.
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

    // Scheduled trip: don't send the user to finding-driver.tsx at all —
    // there's nothing to search for yet. Park it in 'scheduled' and let
    // scheduledDeliveryService's sweep flip it to finding_driver (and
    // actually call matchDriver) once scheduledFor arrives.
    const isFutureSchedule = delivery.scheduledFor && delivery.scheduledFor.getTime() > Date.now();
    if (isFutureSchedule) {
      const updated = await Delivery.findByIdAndUpdate(
        delivery._id,
        { status: 'scheduled' },
        { new: true }
      );
      return res.status(200).json({
        success: true,
        message: 'Payment confirmed — your delivery is scheduled.',
        scheduled: true,
        data: updated,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment confirmed — finding you a driver...',
      scheduled: false,
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

    // Notify user/business via socket
    const io = req.app.get('io');
    notifyDelivery(io, delivery, 'driver_arrived', {
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

    // Idempotent: if this delivery was already verified (e.g. a retry after
    // a flaky-network timeout on the driver's first successful call), reuse
    // the existing deliveryCode instead of minting a new one — regenerating
    // it here would silently invalidate the QR code already shown to the
    // recipient, causing a legit QR scan to fail with "wrong code".
    const alreadyVerified = !!delivery.deliveryCode;
    const deliveryCode = delivery.deliveryCode || Math.floor(1000 + Math.random() * 9000).toString();

    if (!alreadyVerified) {
      await Delivery.findByIdAndUpdate(req.params.id, {
        status: 'in_transit',
        deliveryCode,
      });

      // Notify user/business package has been picked up
      const io = req.app.get('io');
      notifyDelivery(io, delivery, 'package_picked_up', {
        deliveryId: delivery._id,
        deliveryCode,
        pickupTime: new Date().toISOString(),
      });
    }

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

    // Read first: (a) avoids dereferencing `.user`/`.price` on null before
    // the 404 check, same defect as cancelDelivery above, and (b) lets us
    // tell whether this delivery was ALREADY delivered, so a duplicate
    // call (retry, double-tap) can't release escrow to the driver twice.
    const existing = await Delivery.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Delivery not found' });
    const alreadyDelivered = existing.status === 'delivered';

    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { status: 'delivered' },
      { new: true }
    );

    if (!alreadyDelivered) {
      await releaseEscrowToDriver({ userId: delivery.user, driverId: delivery.driver, amount: delivery.price, deliveryId: delivery._id });
    }

    // Free up driver
    if (driverId) {
      const Driver = require('../models/driver');
      await Driver.findByIdAndUpdate(driverId, { status: 'online' });
    }

    // Notify user/business delivery is complete
    const io = req.app.get('io');
    notifyDelivery(io, delivery, 'package_delivered', {
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
        $in: ['scheduled', 'finding_driver', 'driver_assigned', 'driver_arrived', 'in_transit'],
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
    notifyDelivery(io, delivery, 'driver_assigned', {
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

// POST /api/deliveries/:id/find-driver
// Manual retry — this is what the "Keep Searching" button on
// finding-driver.tsx has been calling all along with no backend to hit.
exports.retryFindDriver = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.id, user: req.user._id });
    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }
    if (delivery.status !== 'finding_driver') {
      return res.status(400).json({
        success: false,
        message: `Cannot retry — delivery is currently ${delivery.status}`,
      });
    }

    res.json({ success: true, message: 'Searching for a driver again...' });

    const io = req.app.get('io');
    const { matchDriver } = require('../services/matchingService');
    matchDriver(delivery._id, io).catch((err) =>
      console.error('[retryFindDriver] matchDriver error:', err)
    );
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};