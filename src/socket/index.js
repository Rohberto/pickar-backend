const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ---------- USER ----------
    // User joins their personal room for delivery updates
    socket.on('join_user_room', ({ userId }) => {
      socket.join(`user_${userId}`);
    });

    // ---------- DRIVER ----------
    // Driver comes online — saves socketId + updates status
    socket.on('driver_online', async ({ driverId, lat, lng }) => {
      await Driver.findByIdAndUpdate(driverId, {
        status: 'online',
        socketId: socket.id,
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });
      socket.join(`driver_${driverId}`);
      console.log(`Driver ${driverId} is online`);
    });

    // Driver updates their location in real-time
    socket.on('driver_location_update', async ({ driverId, lat, lng }) => {
      await Driver.findByIdAndUpdate(driverId, {
        location: { type: 'Point', coordinates: [lng, lat] },
      });

      // Broadcast driver location to the user tracking this driver
      const delivery = await Delivery.findOne({
        driver: driverId,
        status: { $in: ['driver_assigned', 'picked_up', 'in_transit'] },
      });

      if (delivery) {
        io.to(`user_${delivery.user}`).emit('driver_location', {
          lat,
          lng,
          deliveryId: delivery._id,
        });
      }
    });

    // Driver responds to a trip offer
    socket.on('trip_response', ({ deliveryId, driverId, accepted }) => {
      // This triggers the one-time listener in matchingService
      socket.emit(`trip_response_${deliveryId}`, { accepted });
    });

    // Driver marks delivery as picked up
    socket.on('mark_picked_up', async ({ deliveryId }) => {
      const delivery = await Delivery.findByIdAndUpdate(
        deliveryId,
        { status: 'picked_up' },
        { new: true }
      );
      if (delivery) {
        io.to(`user_${delivery.user}`).emit('package_picked_up', { deliveryId });
      }
    });

    // Driver marks delivery as delivered
    socket.on('mark_delivered', async ({ deliveryId, driverId }) => {
      const delivery = await Delivery.findByIdAndUpdate(
        deliveryId,
        { status: 'delivered' },
        { new: true }
      );

      if (delivery) {
        // Free up driver
        await Driver.findByIdAndUpdate(driverId, { status: 'online' });
        io.to(`user_${delivery.user}`).emit('package_delivered', { deliveryId });
      }
    });

    // Driver goes offline
    socket.on('driver_offline', async ({ driverId }) => {
      await Driver.findByIdAndUpdate(driverId, {
        status: 'offline',
        socketId: null,
      });
    });

    // Cleanup on disconnect
    socket.on('disconnect', async () => {
      await Driver.findOneAndUpdate(
        { socketId: socket.id },
        { status: 'offline', socketId: null }
      );
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = initSocket;