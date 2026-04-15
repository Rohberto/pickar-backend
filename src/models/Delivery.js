const mongoose = require('mongoose');

const coordinatesSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },   // human-readable e.g "12 Olagbaiye Street, Mushin"
    coordinates: { type: coordinatesSchema },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Where the driver picks up the package
    pickupAddress: {
      type: addressSchema,
      required: true,
    },

    // Recipient info
    recipient: {
      address: { type: addressSchema, required: true },
      name: { type: String, required: true },
      phone: { type: String, required: true },
    },

    packageType: {
      type: String,
      enum: ['fragile', 'non_fragile'],
      required: true,
    },

    rideType: {
      type: String,
      enum: ['truck', 'standard', 'eco_send', 'express'],
    },

    price: {
      type: Number,
      default: 0,
    },

    agreedToInsurance: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: [
        'pending',          // just created, ride not selected yet
        'finding_driver',   // pickup confirmed, searching for driver
        'driver_assigned',  // driver accepted the trip
        'picked_up',        // driver has the package
        'in_transit',       // on the way to recipient
        'delivered',        // successfully delivered
        'cancelled',        // cancelled by user
      ],
      default: 'pending',
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },

    estimatedArrival: {
      type: Number, // in minutes
      default: null,
    },

    // Timestamps for each status change (useful for tracking)
    timeline: {
      driverAssignedAt: { type: Date },
      pickedUpAt: { type: Date },
      deliveredAt: { type: Date },
      cancelledAt: { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Delivery', deliverySchema);