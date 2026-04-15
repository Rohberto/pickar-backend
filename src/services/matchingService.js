const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');

const SEARCH_RADIUS_METERS = 5000; // 5km
const OFFER_TIMEOUT_MS = 15000;    // 15 seconds per driver
const MAX_CANDIDATES = 5;

/**
 * Main entry point — call this after pickup is confirmed
 * @param {String} deliveryId
 * @param {Object} io - socket.io server instance
 */
const matchDriver = async (deliveryId, io) => {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) return;

  const [lng, lat] = [
    delivery.pickupAddress.coordinates.lng,
    delivery.pickupAddress.coordinates.lat,
  ];

  // Find nearest available drivers within radius
  const candidates = await Driver.find({
    status: 'online',
    socketId: { $ne: null }, // must be connected
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: SEARCH_RADIUS_METERS,
      },
    },
  }).limit(MAX_CANDIDATES);

  if (candidates.length === 0) {
    // No drivers available — notify user
    io.to(`user_${delivery.user}`).emit('no_drivers_available', {
      deliveryId,
      message: 'No drivers available nearby. Please try again shortly.',
    });

    await Delivery.findByIdAndUpdate(deliveryId, { status: 'pending' });
    return;
  }

  // Offer to candidates one by one
  await offerToNext(delivery, candidates, 0, io);
};


/**
 * Recursively offers trip to each candidate with a timeout
 */
const offerToNext = (delivery, candidates, index, io) => {
  return new Promise(async (resolve) => {
    if (index >= candidates.length) {
      // All candidates exhausted
      io.to(`user_${delivery.user}`).emit('no_drivers_available', {
        deliveryId: delivery._id,
        message: 'No drivers accepted your request. Please try again.',
      });
      await Delivery.findByIdAndUpdate(delivery._id, { status: 'pending' });
      return resolve();
    }

    const driver = candidates[index];

    // Emit trip offer to driver's socket
    io.to(driver.socketId).emit('trip_offer', {
      deliveryId: delivery._id,
      pickup: delivery.pickupAddress,
      destination: delivery.recipient.address,
      packageType: delivery.packageType,
      price: delivery.price,
      rideType: delivery.rideType,
      timeoutSeconds: OFFER_TIMEOUT_MS / 1000,
    });

    // Notify user we're connecting
    io.to(`user_${delivery.user}`).emit('connecting_to_driver', {
      deliveryId: delivery._id,
      attempt: index + 1,
    });

    // Set timeout — move to next driver if no response
    const timeout = setTimeout(async () => {
      console.log(`Driver ${driver._id} timed out. Trying next...`);
      resolve(await offerToNext(delivery, candidates, index + 1, io));
    }, OFFER_TIMEOUT_MS);

    // Listen for driver's response via a one-time event on their socket
    const driverSocket = io.sockets.sockets.get(driver.socketId);
    if (!driverSocket) {
      clearTimeout(timeout);
      return resolve(await offerToNext(delivery, candidates, index + 1, io));
    }

    driverSocket.once(`trip_response_${delivery._id}`, async ({ accepted }) => {
      clearTimeout(timeout);

      if (accepted) {
        await handleAccepted(delivery, driver, io);
        resolve();
      } else {
        // Driver rejected — try next
        resolve(await offerToNext(delivery, candidates, index + 1, io));
      }
    });
  });
};


/**
 * Called when a driver accepts the trip
 */
const handleAccepted = async (delivery, driver, io) => {
  // Mark driver as busy
  await Driver.findByIdAndUpdate(driver._id, { status: 'busy' });

  // Assign driver to delivery
  const updated = await Delivery.findByIdAndUpdate(
    delivery._id,
    { status: 'driver_assigned', driver: driver._id },
    { new: true }
  ).populate('driver', 'name phone vehicle rating location');

  // Notify user
  io.to(`user_${delivery.user}`).emit('driver_assigned', {
    deliveryId: delivery._id,
    driver: {
      id: driver._id,
      name: driver.name,
      phone: driver.phone,
      vehicle: driver.vehicle,
      rating: driver.rating,
      location: driver.location.coordinates,
    },
  });

  // Confirm to driver
  io.to(driver.socketId).emit('trip_confirmed', {
    deliveryId: delivery._id,
    pickup: updated.pickupAddress,
    destination: updated.recipient.address,
    recipientName: updated.recipient.name,
    recipientPhone: updated.recipient.phone,
    price: updated.price,
  });
};

module.exports = { matchDriver };