const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');
const { notifyDelivery } = require('../utils/notifyDelivery');
const { RIDE_TYPES } = require('../config/rideTypes');

// TEMP: widened to 100km for testing. Revert to bike:8000, truck:20000
// before shipping — bikes/mopeds can't reasonably be offered a pickup
// that far away in production.
const SEARCH_RADIUS_METERS_BY_VEHICLE = {
  bike: 100000,
  truck: 100000,
};
const searchRadiusFor = (rideType) =>
  rideType === 'truck' ? SEARCH_RADIUS_METERS_BY_VEHICLE.truck : SEARCH_RADIUS_METERS_BY_VEHICLE.bike;

const vehicleClassFor = (rideType) =>
  RIDE_TYPES.find((r) => r.type === rideType)?.vehicleClass || 'bike';

// Drivers now register under one specific ride type (standard/eco_send/
// express/truck — see driverController.updateMe) and only get offered
// deliveries of that exact type. Drivers created before this existed have
// no rideType stored (null) — those fall back to the old bike-vs-truck-only
// distinction via vehicle.type so they keep working until they re-register.
const candidateFilterFor = (rideType) => {
  const normalizedType = rideType || 'standard';
  return {
    $or: [
      { rideType: normalizedType },
      { rideType: null, 'vehicle.type': vehicleClassFor(normalizedType) },
    ],
  };
};

const OFFER_TIMEOUT_MS = 15000;     // 15 seconds per driver — was 30s, which let
                                     // a single full offer round (5 candidates)
                                     // burn 2.5 of the 3-minute search budget.
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

  // Everything from here down is wrapped in try/finally — no matter what
  // throws, times out, or returns early, matchingInProgress ALWAYS gets
  // reset to false at the end. Previously this was reset manually at each
  // exit point, which meant any unexpected throw left the flag stuck at
  // true forever — silently blocking every future retry and every
  // driver-comes-online trigger for that delivery, with zero error shown
  // anywhere. This was the root cause of "select ride does nothing" and
  // "driver coming online doesn't auto-match."
  try {
    const delivery = await Delivery.findById(deliveryId)
      .populate('user', 'fullName photo phone')
      .populate('business', '_id');

    if (!delivery) return;

    // First time this delivery starts searching — stamp when the clock
    // began. Retries must NOT reset this, or a delivery could search
    // forever in short bursts without ever hitting the overall cap.
    if (!delivery.searchStartedAt) {
      delivery.searchStartedAt = new Date();
      await Delivery.findByIdAndUpdate(deliveryId, { searchStartedAt: delivery.searchStartedAt });

      // Proactively give up after MAX_SEARCH_DURATION_MS instead of only
      // checking the clock the next time something happens to call
      // matchDriver again (a retry, or a driver coming online). Without
      // this, a delivery with no further trigger could sit in
      // "finding_driver" forever — never actually failing, just silently
      // stuck — since nothing else was watching the clock.
      scheduleSearchTimeout(deliveryId, io);
    }

    const searchElapsedMs = Date.now() - new Date(delivery.searchStartedAt).getTime();
    if (searchElapsedMs > MAX_SEARCH_DURATION_MS) {
      await Delivery.findByIdAndUpdate(deliveryId, { status: 'no_driver_found' });
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

    // ── Ride type filter ────────────────────────────────────────────────
    // Only offered to drivers registered for this exact ride type (with a
    // legacy bike/truck fallback for drivers who haven't re-registered).
    const candidates = await Driver.find({
      status: 'online',
      socketId: { $ne: null },
      ...candidateFilterFor(delivery.rideType),
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: searchRadiusFor(delivery.rideType),
        },
      },
    }).limit(MAX_CANDIDATES);

    console.log(
      `[matchDriver] Delivery ${deliveryId} — rideType: ${delivery.rideType ?? 'standard'} — found ${candidates.length} matching driver(s)`
    );

    if (candidates.length === 0) {
      // Keep as finding_driver, not cancelled — user can retry, and
      // matchWaitingDeliveryForDriver will pick this up automatically when
      // a compatible driver next comes online.
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
  } catch (err) {
    console.error(`[matchDriver] unexpected error for delivery ${deliveryId}:`, err);
  } finally {
    await Delivery.findByIdAndUpdate(deliveryId, { matchingInProgress: false }).catch((err) =>
      console.error(`[matchDriver] failed to release matchingInProgress for ${deliveryId}:`, err)
    );
  }
};

/**
 * Fires once, MAX_SEARCH_DURATION_MS after a delivery's search clock
 * started. If the delivery is still sitting in finding_driver at that
 * point (no driver accepted, nothing else re-triggered a resolution), it's
 * flipped to no_driver_found and the user is notified — instead of relying
 * on some future retry/driver-online event to happen to notice the clock
 * ran out. In-process timer, so a server restart clears it; matchDriver's
 * own lazy check at the top still catches those on the next trigger, so
 * this is a proactive improvement layered on top of that, not a
 * replacement for it.
 */
const scheduleSearchTimeout = (deliveryId, io) => {
  setTimeout(async () => {
    try {
      const delivery = await Delivery.findById(deliveryId);
      if (!delivery || delivery.status !== 'finding_driver') return; // already resolved

      await Delivery.findByIdAndUpdate(deliveryId, { status: 'no_driver_found' });
      notifyDelivery(io, delivery, 'search_timeout', {
        deliveryId,
        message: 'We could not find a driver for this delivery. Please try again.',
      });
      console.log(`[scheduleSearchTimeout] Delivery ${deliveryId} auto-timed-out after ${MAX_SEARCH_DURATION_MS}ms`);
    } catch (err) {
      console.error(`[scheduleSearchTimeout] error for ${deliveryId}:`, err);
    }
  }, MAX_SEARCH_DURATION_MS);
};


/**
 * Called whenever a driver comes online — finds the single oldest delivery
 * still stuck in finding_driver that this driver is a fit for (right
 * vehicle type, within radius) and re-runs matching for it.
 */
const matchWaitingDeliveryForDriver = async (driverId, io) => {
  const driver = await Driver.findById(driverId);
  if (!driver || !driver.location?.coordinates) return;

  const [lng, lat] = driver.location.coordinates;

  // Driver registered under a specific ride type → only look for waiting
  // deliveries of that exact type. Legacy driver with no rideType stored
  // yet → fall back to the old bike/truck-only distinction.
  const rideTypeFilter = driver.rideType
    ? driver.rideType
    : driver.vehicle?.type === 'truck' ? 'truck' : { $ne: 'truck' };

  const waitingDelivery = await Delivery.findOne({
    status: 'finding_driver',
    matchingInProgress: { $ne: true },
    rideType: rideTypeFilter,
  }).sort({ createdAt: 1 }); // oldest first — first come, first served

  if (!waitingDelivery) return;

  const pickupLat = waitingDelivery.pickupAddress?.coordinates?.lat;
  const pickupLng = waitingDelivery.pickupAddress?.coordinates?.lng;
  if (pickupLat == null || pickupLng == null) return;

  const distanceMeters = haversineMeters(lat, lng, pickupLat, pickupLng);
  if (distanceMeters > searchRadiusFor(waitingDelivery.rideType)) return;

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

    // Notify user we found a candidate — this is what should clear any
    // "no drivers found" banner on the frontend, since a real offer is
    // now in flight.
    notifyDelivery(io, delivery, 'connecting_to_driver', {
      deliveryId: delivery._id,
      attempt: index + 1,
    });

    let settled = false;

    // Timeout — driver didn't respond in time
    const timeout = setTimeout(async () => {
      if (settled) return;
      settled = true;

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
        try {
          await handleAccepted(delivery, driver, io);
        } catch (err) {
          console.error(`[offerToNext] handleAccepted failed for delivery ${delivery._id}:`, err);
        }
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
 */
const handleAccepted = async (delivery, driver, io) => {
  const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();

  await Driver.findByIdAndUpdate(driver._id, { status: 'busy' });
  try {
    await Delivery.findByIdAndUpdate(delivery._id, {
      status: 'driver_assigned',
      driver: driver._id,
      pickupCode,
      'timeline.driverAssignedAt': new Date(),
    });
  } catch (err) {
    // The driver write above already succeeded — without this, a failure
    // here leaves the driver stuck "busy" forever with no delivery
    // actually assigned to them (no future matchDriver call would ever
    // include them as a candidate again). Revert so they're immediately
    // matchable again instead of silently lost from the pool.
    await Driver.findByIdAndUpdate(driver._id, { status: 'online' }).catch(() => {});
    throw err;
  }

  const driverLocation = driver.location?.coordinates
    ? { lat: driver.location.coordinates[1], lng: driver.location.coordinates[0] }
    : null;

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

  io.to(driver.socketId).emit('trip_confirmed', {
    deliveryId: delivery._id,
    pickup: delivery.pickupAddress,
    destination: delivery.recipient?.address,
    price: delivery.price,
    pickupCode,
  });

  console.log(`[handleAccepted] Delivery ${delivery._id} assigned to driver ${driver._id}`);
};


module.exports = { matchDriver, matchWaitingDeliveryForDriver, candidateFilterFor };