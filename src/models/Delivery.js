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
    // NOTE: no `default: null` here on purpose — initiateDelivery now
    // generates this with nanoid() at creation time. Explicitly defaulting
    // to null caused an E11000 duplicate key error on the sparse unique
    // index once a second doc landed with a real null instead of an
    // absent field. Leave this field's absence, not a null, as the
    // sparse-index escape hatch for any doc created outside that flow.
    trackingToken: {
      type: String,
      unique: true,
      sparse: true,
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

    // Estimated package weight in kg — drives weightFee in pricingService
    // and filters which ride types are even offered (see maxWeightKg in
    // config/rideTypes.js). Defaults to 1kg if never set.
    weightKg: {
      type: Number,
      default: 1,
    },

    rideType: {
      type: String,
      enum: ['truck', 'standard', 'eco_send', 'express'],
    },

    price: {
      type: Number,
      default: 0,
    },

    // Full fare breakdown from pricingService at the moment select-ride
    // was called — baseFee, distanceFee, weightFee, zoneFee, any
    // discount/premium adjustment, and any active surge fees. Kept for
    // the cost-per-delivery reporting metric down the line.
    fareBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    distanceKm: {
      type: Number,
      default: null,
    },

    pickupZone: {
      type: String,
      default: null,
    },

    dropoffZone: {
      type: String,
      default: null,
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
        'no_driver_found',  // overall search window elapsed with no match — terminal until user retries
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

    // When the driver search first began — set once, never reset by
    // retries, so matchDriver can enforce an overall giving-up window
    // (MAX_SEARCH_DURATION_MS) instead of searching forever in bursts.
    searchStartedAt: {
      type: Date,
      default: null,
    },

    // True while matchDriver is actively running for this delivery —
    // prevents two concurrent triggers (manual retry + a driver coming
    // online at the same moment) from both offering it out at once.
    matchingInProgress: {
      type: Boolean,
      default: false,
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