const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');

const SEARCH_RADIUS_METERS = 50000; // 50km for testing — reduce to 5000 for production
const OFFER_TIMEOUT_MS = 15000;     // 15 seconds per driver
const MAX_CANDIDATES = 5;

/**
 * Main entry point — call this after pickup is confirmed
 * @param {String} deliveryId
 * @param {Object} io - socket.io server instance
 */
const matchDriver = async (deliveryId, io) => {
  // Populate user so their photo is available for trip_offer
  const delivery = await Delivery.findById(deliveryId).populate('user', 'fullName photo phone');
  if (!delivery) return;

  const [lng, lat] = [
    delivery.pickupAddress.coordinates.lng,
    delivery.pickupAddress.coordinates.lat,
  ];

  // Find nearest available drivers within radius
  const candidates = await Driver.find({
    status: 'online',
    socketId: { $ne: null },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: SEARCH_RADIUS_METERS,
      },
    },
  }).limit(MAX_CANDIDATES);

  console.log(`[matchDriver] Delivery ${deliveryId} — found ${candidates.length} candidates`);

  if (candidates.length === 0) {
    io.to(`user_${delivery.user._id}`).emit('no_drivers_available', {
      deliveryId,
      message: 'No drivers available nearby. Please try again shortly.',
    });
    await Delivery.findByIdAndUpdate(deliveryId, { status: 'pending' });
    return;
  }

  await offerToNext(delivery, candidates, 0, io);
};


/**
 * Recursively offers trip to each candidate with a timeout
 */
const offerToNext = (delivery, candidates, index, io) => {
  return new Promise(async (resolve) => {

    // Ran out of candidates — check if already assigned before giving up
    if (index >= candidates.length) {
      const fresh = await Delivery.findById(delivery._id);
      // KEY FIX: bail out for ANY status beyond finding_driver
      // Previously only checked 'driver_assigned' which caused "no drivers available"
      // to fire when status was 'driver_arrived' or 'in_transit'
      if (fresh && fresh.status !== 'finding_driver') return resolve();

      io.to(`user_${delivery.user._id ?? delivery.user}`).emit('no_drivers_available', {
        deliveryId: delivery._id,
        message: 'No drivers accepted your request. Please try again.',
      });
      await Delivery.findByIdAndUpdate(delivery._id, { status: 'pending' });
      return resolve();
    }

    const driver = candidates[index];

    // Skip if driver socket is gone
    const driverSocket = io.sockets.sockets.get(driver.socketId);
    if (!driverSocket) {
      console.log(`[offerToNext] Driver ${driver._id} socket gone — skipping`);
      return resolve(await offerToNext(delivery, candidates, index + 1, io));
    }

    console.log(`[offerToNext] Offering to driver ${driver._id} (${driver.name})`);

    // Send trip offer to driver — includes user photo so driver sees sender's pic
    io.to(driver.socketId).emit('trip_offer', {
      deliveryId: delivery._id,
      pickup: delivery.pickupAddress,
      destination: delivery.recipient.address,
      recipientName: delivery.recipient.name,
      recipientPhone: delivery.recipient.phone,
      userPhone: delivery.user?.phone ?? null,
      userPhoto: delivery.user?.photo ?? null,   // sender's profile picture
      packageType: delivery.packageType,
      price: delivery.price,
      rideType: delivery.rideType,
      timeoutSeconds: OFFER_TIMEOUT_MS / 1000,
    });

    // Let user know we're connecting
    io.to(`user_${delivery.user._id ?? delivery.user}`).emit('connecting_to_driver', {
      deliveryId: delivery._id,
      attempt: index + 1,
    });

    // Timeout — move to next driver if no response
    const timeout = setTimeout(async () => {
      console.log(`[offerToNext] Driver ${driver._id} timed out — trying next`);

      const fresh = await Delivery.findById(delivery._id);
      if (fresh && fresh.status !== 'finding_driver') return resolve();

      resolve(await offerToNext(delivery, candidates, index + 1, io));
    }, OFFER_TIMEOUT_MS);

    // Listen for driver's accept/decline response
    driverSocket.once(`trip_response_${delivery._id}`, async ({ accepted }) => {
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
 * Called when a driver accepts via socket response
 * (Note: driver can also accept via REST POST /deliveries/:id/assign-driver)
 */
const handleAccepted = async (delivery, driver, io) => {
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  await Driver.findByIdAndUpdate(driver._id, { status: 'busy' });
  await Delivery.findByIdAndUpdate(delivery._id, {
    status: 'driver_assigned',
    driver: driver._id,
    pickupCode,
  });

  const driverLocation = driver.location?.coordinates
    ? { lat: driver.location.coordinates[1], lng: driver.location.coordinates[0] }
    : null;

  // Notify user — includes driver photo
  io.to(`user_${delivery.user._id ?? delivery.user}`).emit('driver_assigned', {
    deliveryId: delivery._id,
    driver: {
      _id: driver._id,
      name: driver.name,
      phone: driver.phone,
      vehicle: driver.vehicle,
      rating: driver.rating,
      photo: driver.photo ?? null,   // driver's profile picture
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