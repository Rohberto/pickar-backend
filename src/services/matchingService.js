const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');

const SEARCH_RADIUS_METERS = 50000; // 50km for testing — reduce to 5000 for production
const OFFER_TIMEOUT_MS = 30000;     // 30 seconds per driver (increased from 15)
const MAX_CANDIDATES = 5;

/**
 * Main entry point — call this after pickup is confirmed
 */
const matchDriver = async (deliveryId, io) => {
  const delivery = await Delivery.findById(deliveryId)
    .populate('user', 'fullName photo phone');
  if (!delivery) return;

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
    // Keep as finding_driver NOT pending/cancelled — user can retry from home screen
    await Delivery.findByIdAndUpdate(deliveryId, { status: 'finding_driver' });

    io.to(`user_${delivery.user._id}`).emit('no_drivers_available', {
      deliveryId,
      canRetry: true,
      message: delivery.rideType === 'truck'
        ? 'No truck drivers available nearby. Tap to search again.'
        : 'No drivers available nearby. Tap to search again.',
    });
    return;
  }

  await offerToNext(delivery, candidates, 0, io);
};


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

      io.to(`user_${delivery.user._id ?? delivery.user}`).emit('no_drivers_available', {
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
    io.to(`user_${delivery.user._id ?? delivery.user}`).emit('connecting_to_driver', {
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
    'timeline.driverAssignedAt': new Date(),
  });

  const driverLocation = driver.location?.coordinates
    ? { lat: driver.location.coordinates[1], lng: driver.location.coordinates[0] }
    : null;

  // Notify user — works even if they navigated away since home screen
  // polls checkActiveDelivery on focus and will show a "Driver Found!" alert
  io.to(`user_${delivery.user._id ?? delivery.user}`).emit('driver_assigned', {
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


module.exports = { matchDriver };