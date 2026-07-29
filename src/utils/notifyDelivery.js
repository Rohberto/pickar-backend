// Single source of truth for "who gets notified about this delivery."
// Consumer deliveries have delivery.user → notify user_${userId}.
// Business deliveries have delivery.business instead → notify
// business_${businessId}. A delivery only ever has one or the other
// (see Delivery.js: user is required unless business is set), so this
// never double-notifies.
//
// Used by matchingService.js, deliveryController.js, and socket/index.js
// so there's exactly one place that knows the room-naming convention —
// previously every file called `io.to(user_${delivery.user._id})` directly,
// which is what crashed on business orders (no delivery.user to read _id from).
const notifyDelivery = (io, delivery, event, payload) => {
  const userId = delivery.user?._id ?? delivery.user;
  if (userId) {
    io.to(`user_${userId}`).emit(event, payload);
    return;
  }

  const businessId = delivery.business?._id ?? delivery.business;
  if (businessId) {
    io.to(`business_${businessId}`).emit(event, payload);
  }
};

module.exports = { notifyDelivery };