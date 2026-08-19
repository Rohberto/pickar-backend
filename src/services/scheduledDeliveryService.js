const Delivery = require('../models/Delivery');
const { notifyDelivery } = require('../utils/notifyDelivery');
const { matchDriver } = require('./matchingService');

// How often we check for scheduled deliveries whose time has arrived.
// A delivery can be up to this long "late" starting its search — fine for
// a single-process sweep, no need for a real job queue at this scale.
const SWEEP_INTERVAL_MS = 30 * 1000;

/**
 * Finds every delivery sitting in 'scheduled' whose scheduledFor time has
 * arrived (or passed — e.g. server was down), flips it to 'finding_driver'
 * exactly the way start-search does for immediate deliveries, and kicks off
 * matchDriver() for it. This is the only place scheduled deliveries ever
 * transition out of 'scheduled' — confirmPickup deliberately leaves them
 * there instead of starting the search itself.
 */
const runScheduledSweep = async (io) => {
  try {
    const due = await Delivery.find({
      status: 'scheduled',
      scheduledFor: { $lte: new Date() },
    });

    for (const delivery of due) {
      const claimed = await Delivery.findOneAndUpdate(
        { _id: delivery._id, status: 'scheduled' },
        { status: 'finding_driver' },
        { new: true }
      );
      if (!claimed) continue; // raced with something else (e.g. user cancelled)

      console.log(`[scheduledDeliverySweep] Delivery ${delivery._id} scheduled time reached — starting search`);

      notifyDelivery(io, claimed, 'scheduled_search_started', {
        deliveryId: claimed._id,
        message: 'Your scheduled pickup time has arrived — finding you a driver...',
      });

      matchDriver(claimed._id, io).catch((err) =>
        console.error(`[scheduledDeliverySweep] matchDriver error for ${claimed._id}:`, err)
      );
    }
  } catch (err) {
    console.error('[scheduledDeliverySweep] sweep error:', err);
  }
};

/**
 * Call once at server startup (after io is created) to begin polling for
 * due scheduled deliveries for the lifetime of the process.
 */
const startScheduledDeliverySweep = (io) => {
  setInterval(() => runScheduledSweep(io), SWEEP_INTERVAL_MS);
  console.log(`[scheduledDeliverySweep] started — checking every ${SWEEP_INTERVAL_MS / 1000}s`);
};

module.exports = { startScheduledDeliverySweep };
