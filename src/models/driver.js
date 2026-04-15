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
      type: { type: String, enum: ['bike', 'truck'], required: true },
      plateNumber: { type: String, required: true },
    },
    rating: { type: Number, default: 5.0 },

    status: {
      type: String,
      enum: ['offline', 'online', 'busy'], // busy = on a trip
      default: 'offline',
    },

    // GeoJSON — required for $near queries
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
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