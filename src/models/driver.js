const mongoose = require('mongoose');
const driverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    vehicle: {
      type: { type: String, enum: ['bike', 'truck']},
      plateNumber: { type: String },
    },

    // The specific ride type (see config/rideTypes.js) this driver
    // registered under — Standard / Eco Send / Express / Truck. Chosen
    // once at vehicle setup and locked from then on (enforced in
    // driverController.updateMe, not just hidden in the UI); vehicle.type
    // (bike/truck) is derived from it automatically and drives matching
    // the same way it always has.
    rideType: {
      type: String,
      enum: ['standard', 'eco_send', 'express', 'truck'],
      default: null,
    },
    // NOTE: this used to be a plain Number. ratingControllers.js (and the
    // admin/account/home screens) have always read/written it as
    // { average, count } — the schema just never caught up, so every
    // `Driver.findByIdAndUpdate(id, { 'rating.average': x, 'rating.count': y })`
    // after a real rating was silently dropped by Mongoose strict mode,
    // and every screen kept showing the default. Declaring it properly
    // here is what actually makes real ratings show up.
    rating: {
      average: { type: Number, default: 5.0 },
      count: { type: Number, default: 0 },
    },
    nationality: { type: String, default: null },
    stateOfOrigin: { type: String, default: null },
    residentialAddress: { type: String, default: null },

    status: {
      type: String,
      enum: ['offline', 'online', 'busy'],
      default: 'offline',
    },
    photo: {
      type: String,
      default: null,
    },

    // GeoJSON — required for $near queries
location: {
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point',
  },
  coordinates: {
    type: [Number],
    default: [3.3792, 6.5244],
  }, 
},

    socketId: { type: String, default: null }, // active socket connection
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 2dsphere index — enables geolocation queries
driverSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Driver', driverSchema);