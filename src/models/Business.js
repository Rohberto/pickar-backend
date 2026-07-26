const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, 'Please provide a business name'],
      trim: true,
    },
    businessEmail: {
      type: String,
      required: [true, 'Please provide a business email'],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    businessPhone: {
      type: String,
      required: [true, 'Please provide a business phone number'],
    },
    // e.g. 'e-commerce', 'restaurant', 'pharmacy', 'logistics'
    industry: {
      type: String,
      default: 'other',
    },
    address: {
      label: { type: String },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },

    // ── Subscription ──────────────────────────────────────────────
    plan: {
      type: String,
      enum: ['starter', 'growth', 'enterprise'],
      default: 'starter',
    },
    subscriptionStatus: {
      type: String,
      enum: ['pending', 'active', 'past_due', 'cancelled'],
      default: 'pending',
    },
    subscriptionStartedAt: { type: Date, default: null },
    subscriptionExpiresAt: { type: Date, default: null },
    paystackSubscriptionCode: { type: String, default: null },
    paystackCustomerCode: { type: String, default: null },

    // Snapshot of the commission rate at signup time — plan config can
    // change later without silently altering rates for existing businesses.
    commissionRate: {
      type: Number,
      default: 0.15,
    },

    // ── Admin approval gate (same pattern as Driver approval) ──────
    isApproved: {
      type: Boolean,
      default: false,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },

    // Running total for the current billing cycle — reset on renewal.
    deliveriesThisCycle: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Business || mongoose.model('Business', businessSchema);