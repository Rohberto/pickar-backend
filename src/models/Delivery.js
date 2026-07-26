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
      // required only for consumer-initiated deliveries — business orders
      // are tagged with `business` instead and have no individual sender
      required: function () {
        return !this.business;
      },
    },

    // Set when this delivery came from a business batch order.
    // businessId is a reporting/billing tag only — it does NOT change how
    // matchDriver() finds a driver. Businesses use the shared driver pool.
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    createdByBusinessUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessUser',
      default: null,
    },

    // Public tracking link token (track.pickar.ng/:token) — set on every
    // delivery so the same tracking page works for consumer and business orders.
    trackingToken: {
      type: String,
      default: null,
      unique: true,
      sparse: true, // allows many nulls for existing docs before backfill
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
        'pending_payment', // business batch orders start here until billing is wired up
        'finding_driver',
        'driver_assigned',
        'driver_arrived',
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

module.exports = mongoose.models.Delivery || mongoose.model('Delivery', deliverySchema);