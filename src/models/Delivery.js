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
    'pending',
    'finding_driver',
    'driver_assigned',
    'driver_arrived',  // ← add this
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled',
  ],
  default: 'pending',
},

// 4-digit code user shows driver at pickup
pickupCode: {
  type: String,
  default: null,
},

// 4-digit code recipient shows driver at drop-off
deliveryCode: {
  type: String,
  default: null,
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