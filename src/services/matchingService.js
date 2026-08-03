const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');
const { notifyDelivery } = require('../utils/notifyDelivery');

const SEARCH_RADIUS_METERS = 50000; // 50km for testing — reduce to 5000 for production
const OFFER_TIMEOUT_MS = 30000;     // 30 seconds per driver
const MAX_CANDIDATES = 5;
const MAX_SEARCH_DURATION_MS = 3 * 60 * 1000; // give up for good after 3 minutes total

/**
 * Main entry point — call this after pickup is confirmed, and also any
 * time we want to retry matching for a delivery already sitting in
 * finding_driver (manual retry button, or a driver coming online later).
 */
const matchDriver = async (deliveryId, io) => {
  // Atomically claim this delivery for matching so two concurrent triggers
  // (retry button + a driver coming online at the same moment) can't both
  // start offering it out simultaneously.
  const claimed = await Delivery.findOneAndUpdate(
    { _id: deliveryId, status: 'finding_driver', matchingInProgress: { $ne: true } },
    { matchingInProgress: true },
    { new: true }
  );
  if (!claimed) return; // already being matched right now, or not in a matchable state

  const delivery = await Delivery.findById(deliveryId)
    .populate('user', 'fullName photo phone')
    .populate('business', '_id');

  if (!delivery) {
    await Delivery.findByIdAndUpdate(deliveryId, { matchingInProgress: false }).catch(() => {});
    return;
  }

  // First time this delivery starts searching — stamp when the clock began.
  // Retries must NOT reset this, or a delivery could search forever in
  // short bursts without ever hitting the overall cap.
  if (!delivery.searchStartedAt) {
    delivery.searchStartedAt = new Date();
    await Delivery.findByIdAndUpdate(deliveryId, { searchStartedAt: delivery.searchStartedAt });
  }

  const searchElapsedMs = Date.now() - new Date(delivery.searchStartedAt).getTime();
  if (searchElapsedMs > MAX_SEARCH_DURATION_MS) {
    await Delivery.findByIdAndUpdate(deliveryId, {
      status: 'no_driver_found',
      matchingInProgress: false,
    });
    notifyDelivery(io, delivery, 'search_timeout', {
      deliveryId,
      message: 'We could not find a driver for this delivery. Please try again.',
    });
    return;
  }

  const [lng, lat] = [
    delivery.pickupAddress.coordinates.lng,
    delivery.pickupAddress.coordinates.lat,
  ];

  // ── Vehicle filter ────────────────────────────────────────────────
  // Truck bookings (house loads) only go to truck drivers.
  // Everything else only goes to bike drivers.
  const vehicleFilter = delivery.rideType === 'truck'
    ? { 'vehicle.type': 'truck' }
    : { 'vehicle.type': 'bike' };

  const candidates = await Driver.find({
    status: 'online',
    socketId: { $ne: null },
    ...vehicleFilter,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: SEARCH_RADIUS_METERS,
      },
    },
  }).limit(MAX_CANDIDATES);

  console.log(
    `[matchDriver] Delivery ${deliveryId} — rideType: ${delivery.rideType ?? 'standard'} — found ${candidates.length} ${delivery.rideType === 'truck' ? 'truck' : 'bike'} drivers`
  );

  if (candidates.length === 0) {
    // Keep as finding_driver, not cancelled — user can retry, and
    // matchWaitingDeliveryForDriver will pick this up automatically when
    // a compatible driver next comes online.
    await Delivery.findByIdAndUpdate(deliveryId, {
      status: 'finding_driver',
      matchingInProgress: false,
    });

    notifyDelivery(io, delivery, 'no_drivers_available', {
      deliveryId,
      canRetry: true,
      message: delivery.rideType === 'truck'
        ? 'No truck drivers available nearby. Tap to search again.'
        : 'No drivers available nearby. Tap to search again.',
    });
    return;
  }

  await offerToNext(delivery, candidates, 0, io);
  await Delivery.findByIdAndUpdate(deliveryId, { matchingInProgress: false }).catch(() => {});
};


/**
 * Called whenever a driver comes online — finds the single oldest delivery
 * still stuck in finding_driver that this driver is a fit for (right
 * vehicle type, within radius) and re-runs matching for it. This is what
 * closes the gap where a delivery created before any driver was online
 * would otherwise never see a driver who logs on afterward.
 */
const matchWaitingDeliveryForDriver = async (driverId, io) => {
  const driver = await Driver.findById(driverId);
  if (!driver || !driver.location?.coordinates) return;

  const [lng, lat] = driver.location.coordinates;
  const vehicleType = driver.vehicle?.type; // 'bike' | 'truck'
  const rideTypeFilter = vehicleType === 'truck' ? 'truck' : { $ne: 'truck' };

  const waitingDelivery = await Delivery.findOne({
    status: 'finding_driver',
    matchingInProgress: { $ne: true },
    rideType: rideTypeFilter,
  }).sort({ createdAt: 1 }); // oldest first — first come, first served

  if (!waitingDelivery) return;

  // Rough haversine check since Delivery.pickupAddress isn't geo-indexed —
  // this is a quick filter, not a precision distance calc.
  const pickupLat = waitingDelivery.pickupAddress?.coordinates?.lat;
  const pickupLng = waitingDelivery.pickupAddress?.coordinates?.lng;
  if (pickupLat == null || pickupLng == null) return;

  const distanceMeters = haversineMeters(lat, lng, pickupLat, pickupLng);
  if (distanceMeters > SEARCH_RADIUS_METERS) return;

  console.log(
    `[matchWaitingDeliveryForDriver] Driver ${driverId} online — retrying match for waiting delivery ${waitingDelivery._id}`
  );

  await matchDriver(waitingDelivery._id, io);
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/**
 * Recursively offers trip to each candidate with a timeout
 */
const offerToNext = (delivery, candidates, index, io) => {
  return new Promise(async (resolve) => {

    // All candidates exhausted
    if (index >= candidates.length) {
      const fresh = await Delivery.findById(delivery._id);
      if (fresh && fresh.status !== 'finding_driver') return resolve();

      // Keep as finding_driver so user can retry — don't cancel
      await Delivery.findByIdAndUpdate(delivery._id, { status: 'finding_driver' });

      notifyDelivery(io, delivery, 'no_drivers_available', {
        deliveryId: delivery._id,
        canRetry: true,
        message: delivery.rideType === 'truck'
          ? 'No truck drivers accepted your request. Tap to search again.'
          : 'No drivers accepted your request. Tap to search again.',
      });
      return resolve();
    }

    const driver = candidates[index];

    // Skip driver if socket is gone
    const driverSocket = io.sockets.sockets.get(driver.socketId);
    if (!driverSocket) {
      console.log(`[offerToNext] Driver ${driver._id} socket gone — skipping`);
      return resolve(await offerToNext(delivery, candidates, index + 1, io));
    }

    console.log(`[offerToNext] Offering to driver ${driver._id} (${driver.name})`);

    // Send trip offer to driver
    io.to(driver.socketId).emit('trip_offer', {
      deliveryId: delivery._id,
      pickup: delivery.pickupAddress,
      destination: delivery.recipient.address,
      recipientName: delivery.recipient.name,
      recipientPhone: delivery.recipient.phone,
      userPhone: delivery.user?.phone ?? null,
      userPhoto: delivery.user?.photo ?? null,
      packageType: delivery.packageType,
      price: delivery.price,
      rideType: delivery.rideType,
      timeoutSeconds: OFFER_TIMEOUT_MS / 1000,
    });

    // Notify user we found a candidate
    notifyDelivery(io, delivery, 'connecting_to_driver', {
      deliveryId: delivery._id,
      attempt: index + 1,
    });

    let settled = false;

    // Timeout — driver didn't respond in time
    const timeout = setTimeout(async () => {
      if (settled) return;
      settled = true;

      // Remove the listener so it doesn't fire after we've moved on
      driverSocket.removeAllListeners(`trip_response_${delivery._id}`);

      console.log(`[offerToNext] Driver ${driver._id} timed out — trying next`);

      const fresh = await Delivery.findById(delivery._id);
      if (fresh && fresh.status !== 'finding_driver') return resolve();

      resolve(await offerToNext(delivery, candidates, index + 1, io));
    }, OFFER_TIMEOUT_MS);

    // Listen for driver's response
    driverSocket.once(`trip_response_${delivery._id}`, async ({ accepted }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (accepted) {
        await handleAccepted(delivery, driver, io);
        resolve();
      } else {
        console.log(`[offerToNext] Driver ${driver._id} declined`);

        const fresh = await Delivery.findById(delivery._id);
        if (fresh && fresh.status !== 'finding_driver') return resolve();

        resolve(await offerToNext(delivery, candidates, index + 1, io));
      }
    });
  });
};


/**
 * Called when a driver accepts
 * Works whether user is on finding-driver screen or has navigated away —
 * user home screen will detect driver_assigned status via checkActiveDelivery
 */
const handleAccepted = async (delivery, driver, io) => {
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  await Driver.findByIdAndUpdate(driver._id, { status: 'busy' });
  await Delivery.findByIdAndUpdate(delivery._id, {
    status: 'driver_assigned',
    driver: driver._id,
    pickupCode,
    matchingInProgress: false,
    'timeline.driverAssignedAt': new Date(),
  });

  const driverLocation = driver.location?.coordinates
    ? { lat: driver.location.coordinates[1], lng: driver.location.coordinates[0] }
    : null;

  // Notify user — works even if they navigated away since home screen
  // polls checkActiveDelivery on focus and will show a "Driver Found!" alert
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

  // Confirm to driver
  io.to(driver.socketId).emit('trip_confirmed', {
    deliveryId: delivery._id,
    pickup: delivery.pickupAddress,
    destination: delivery.recipient?.address,
    price: delivery.price,
    pickupCode,
  });

  console.log(`[handleAccepted] Delivery ${delivery._id} assigned to driver ${driver._id}`);
};


module.exports = { matchDriver, matchWaitingDeliveryForDriver };