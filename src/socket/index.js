const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');
const User = require('../models/user');
const ChatMessage = require('../models/ChatMessage');
const { Expo } = require('expo-server-sdk');
 
const expoClient = new Expo();
 
// Helper: send Expo push notification
const sendPushNotification = async (pushToken, title, body) => {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) return;
  try {
    await expoClient.sendPushNotificationsAsync([{
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: { type: 'chat' },
    }]);
  } catch (err) {
    console.error('[Push]', err.message);
  }
};

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ─────────────────────────────────────────────────────────────
    // USER
    // ─────────────────────────────────────────────────────────────

    // User joins their personal room so driver events reach them.
    // Accepts both { userId } object (new) and a plain userId string (legacy).
 socket.on('join_user_room', (data) => {
  const userId = typeof data === 'object' ? data.userId : data;
  if (userId) {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room user_${userId}`);
  }
});

socket.on('join_delivery_room', ({ deliveryId }) => {
  if (!deliveryId) return;
  socket.join(`delivery_${deliveryId}`);
});

    // ─────────────────────────────────────────────────────────────
    // DRIVER — online / offline / location
    // ─────────────────────────────────────────────────────────────

    // Driver comes online — saves socketId, GPS, status to DB.
    // lat & lng are REQUIRED so matchDriver's $near query can find them.
    socket.on('driver_online', async ({ driverId, lat, lng }) => {
      if (!driverId) return;
      await Driver.findByIdAndUpdate(driverId, {
        status: 'online',
        socketId: socket.id,
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });
      socket.join(`driver_${driverId}`);
      console.log(`Driver ${driverId} is online at [${lat}, ${lng}]`);
    });

    // Driver goes offline — clear socketId so matchDriver skips them.
    socket.on('driver_offline', async ({ driverId }) => {
      if (!driverId) return;
      await Driver.findByIdAndUpdate(driverId, {
        status: 'offline',
        socketId: null,
      });
      console.log(`Driver ${driverId} went offline`);
    });

    // Driver sends live GPS updates while on a trip.
    // Broadcasts location to the user currently tracking them.
  socket.on('driver_location_update', async ({ driverId, lat, lng }) => {
      if (!driverId) return;

      await Driver.findByIdAndUpdate(driverId, {
        location: { type: 'Point', coordinates: [lng, lat] },
      });

      const delivery = await Delivery.findOne({
        driver: driverId,
        status: { $in: ['driver_assigned', 'driver_arrived', 'in_transit'] },
      });

      if (delivery) {
        io.to(`user_${delivery.user}`).emit('driver_location', {
          location: { lat, lng },
          deliveryId: delivery._id,
        });
        io.to(`delivery_${delivery._id}`).emit('driver_location', {
          location: { lat, lng },
          deliveryId: delivery._id,
        });
      }
    });
    // ─────────────────────────────────────────────────────────────
    // DRIVER — trip response
    //
    // The driver app emits trip_response_${deliveryId} directly.
    // matchingService registered driverSocket.once(`trip_response_${id}`)
    // which fires when the CLIENT emits that exact event name.
    // No middleman handler needed here — it just works.
    //
    // NOTE: The old 'trip_response' handler that did socket.emit(...)
    // was REMOVED because socket.emit() sends TO the client, not to
    // server-side once() listeners. Driver now emits the specific
    // event name directly.
    // ─────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────
    // DRIVER — delivery lifecycle events
    // ─────────────────────────────────────────────────────────────

    // Driver marks package as picked up (after verifying pickup code).
    socket.on('mark_picked_up', async ({ deliveryId, deliveryCode }) => {
      const delivery = await Delivery.findByIdAndUpdate(
        deliveryId,
        {
          status: 'in_transit',
          deliveryCode: deliveryCode || Math.floor(1000 + Math.random() * 9000).toString(),
        },
        { new: true }
      );
      if (delivery) {
        io.to(`user_${delivery.user}`).emit('package_picked_up', {
          deliveryId,
          deliveryCode: delivery.deliveryCode,
          pickupTime: new Date().toISOString(),
        });
      }
    });

    socket.on('join_driver_room', ({ driverId }) => {
  socket.join(`driver_${driverId}`);
});

    // Driver marks delivery as complete.
    socket.on('mark_delivered', async ({ deliveryId, driverId }) => {
      const delivery = await Delivery.findByIdAndUpdate(
        deliveryId,
        { status: 'delivered' },
        { new: true }
      );

      if (delivery) {
        // Free up driver for next trip
        if (driverId) {
          await Driver.findByIdAndUpdate(driverId, { status: 'online' });
        }
        io.to(`user_${delivery.user}`).emit('package_delivered', { deliveryId });
      }
    });

    // ─────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────

    // When a driver socket disconnects unexpectedly, mark them offline
    // so matchDriver doesn't try to offer them trips.
    socket.on('disconnect', async () => {
      await Driver.findOneAndUpdate(
        { socketId: socket.id },
        { status: 'offline', socketId: null }
      );
      console.log(`Socket disconnected: ${socket.id}`);
    });

   // Join a delivery-specific chat room
socket.on('join_chat_room', async ({ deliveryId, userId }) => {
  if (!deliveryId) return;
  socket.join(`chat_${deliveryId}`);
  console.log(`[Chat] Socket ${socket.id} joined chat_${deliveryId}`);
});
 
// Send a message via socket
socket.on('send_message', async ({ deliveryId, senderId, senderType, message }) => {
  if (!deliveryId || !message?.trim()) return;
 
  try {
    const chatMessage = await ChatMessage.create({
      delivery: deliveryId,
      sender: senderId,
      senderType,
      message: message.trim(),
    });
 
    const payload = {
      _id: chatMessage._id,
      delivery: deliveryId,
      sender: senderId,
      senderType,
      message: chatMessage.message,
      createdAt: chatMessage.createdAt,
      read: false,
    };
 
    // Send to everyone in room EXCEPT the sender
    socket.to(`chat_${deliveryId}`).emit('new_message', payload);
 
    // Confirm back to sender — replaces temp message with real DB id
    socket.emit('message_sent', payload);
 
    // Send push notification to the OTHER party if they have a push token
    try {
    
      const delivery = await Delivery.findById(deliveryId).populate('driver');
 
      if (senderType === 'user') {
        // User sent message — notify the driver
        const driverUser = delivery?.driver?.user
          ? await User.findById(delivery.driver.user)
          : null;
        if (driverUser?.pushToken) {
          sendPushNotification(driverUser.pushToken, 'New message from customer', chatMessage.message);
        }
      } else {
        // Driver sent message — notify the user
        const user = delivery?.user
          ? await User.findById(delivery.user)
          : null;
        if (user?.pushToken) {
          sendPushNotification(user.pushToken, 'New message from your driver', chatMessage.message);
        }
      }
    } catch (notifErr) {
      console.error('[Chat] push notification error:', notifErr.message);
    }
  } catch (err) {
    console.error('[Chat] send_message error:', err.message);
    socket.emit('message_error', { error: 'Failed to send message' });
  }
});
 
// Mark messages as read
socket.on('mark_read', async ({ deliveryId, readerType }) => {
  try {
    // Mark messages sent by the OTHER party as read
    const senderType = readerType === 'driver' ? 'user' : 'driver';
    await ChatMessage.updateMany(
      { delivery: deliveryId, senderType, read: false },
      { read: true }
    );
    // Notify the sender their messages were read
    io.to(`chat_${deliveryId}`).emit('messages_read', { deliveryId, readerType });
  } catch (err) {
    console.error('[Chat] mark_read error:', err.message);
  }
});
  });
};


module.exports = initSocket;