// Subscription tiers for B2B businesses.
// NOTE: businesses use Pickar's shared driver pool — there are no dedicated
// riders, so "limits" here are about order volume, dispatcher seats, and
// commission rate, not fleet size.

const BUSINESS_PLANS = {
  starter: {
    key: 'starter',
    label: 'Starter',
    monthlyFee: 25000, // NGN
    commissionRate: 0.15, // Pickar takes 15% per delivery
    monthlyDeliveryLimit: 100,
    dispatcherSeats: 1,
    batchSizeLimit: 20, // max orders per batch upload
    prioritySupport: false,
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    monthlyFee: 60000,
    commissionRate: 0.10,
    monthlyDeliveryLimit: 500,
    dispatcherSeats: 3,
    batchSizeLimit: 100,
    prioritySupport: false,
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    monthlyFee: 150000,
    commissionRate: 0.07,
    monthlyDeliveryLimit: null, // unlimited
    dispatcherSeats: null, // unlimited
    batchSizeLimit: 500,
    prioritySupport: true,
  },
};

const getPlan = (planKey) => BUSINESS_PLANS[planKey] || null;

module.exports = { BUSINESS_PLANS, getPlan };