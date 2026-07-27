const { nanoid } = require('nanoid');
const Delivery = require('../models/Delivery');
const Business = require('../models/Business');
const { getRideType } = require('../config/rideTypes');
const { BUSINESS_PLANS, getPlan } = require('../config/businessPlans');

// @desc    List available subscription plans
// @route   GET /api/business/plans
// @access  Public
exports.getPlans = async (req, res) => {
  res.status(200).json({ success: true, data: Object.values(BUSINESS_PLANS) });
};

// @desc    Create a batch of deliveries in one request
// @route   POST /api/business/orders/batch
// @access  Private (business, approved + active)
// @body    { orders: [{ pickupAddress, recipientAddress, recipientName, recipientPhone, packageType, rideType }] }
//
// IMPORTANT — what this does NOT do yet:
// It does not charge the business. There's no Business wallet or Paystack
// billing wired up for per-delivery charges (Wallet is a User-only model
// right now). Orders are created with status 'pending_payment' so nothing
// fake happens — you'll need to decide how businesses pay (invoice at
// month-end vs. pay-per-batch) before these can flow into matchDriver().
exports.createBatchOrder = async (req, res) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orders must be a non-empty array',
      });
    }

    const plan = getPlan(req.business.plan);
    if (orders.length > plan.batchSizeLimit) {
      return res.status(400).json({
        success: false,
        message: `Your ${plan.label} plan allows a maximum of ${plan.batchSizeLimit} orders per batch`,
      });
    }

    if (plan.monthlyDeliveryLimit !== null) {
      const remaining = plan.monthlyDeliveryLimit - req.business.deliveriesThisCycle;
      if (orders.length > remaining) {
        return res.status(400).json({
          success: false,
          message: `This batch would exceed your monthly limit. ${remaining} deliveries remaining this cycle.`,
        });
      }
    }

    // Validate every order before creating any of them
    const validated = [];
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const {
        pickupAddress,
        recipientAddress,
        recipientName,
        recipientPhone,
        packageType,
        rideType,
      } = o;

      if (
        !pickupAddress ||
        !recipientAddress ||
        !recipientName ||
        !recipientPhone ||
        !packageType ||
        !rideType
      ) {
        return res.status(400).json({
          success: false,
          message: `Order at index ${i} is missing required fields`,
        });
      }

      const rideConfig = getRideType(rideType);
      if (!rideConfig) {
        return res.status(400).json({
          success: false,
          message: `Order at index ${i} has invalid rideType "${rideType}"`,
        });
      }

      validated.push({
        pickupAddress: { label: pickupAddress },
        recipient: {
          address: { label: recipientAddress },
          name: recipientName,
          phone: recipientPhone,
        },
        packageType,
        rideType,
        price: rideConfig.discountedPrice,
        agreedToInsurance: true,
        status: 'pending_payment',
        business: req.business._id,
        createdByBusinessUser: req.businessUser._id,
        trackingToken: nanoid(10),
      });
    }

    const created = await Delivery.insertMany(validated);

    await Business.findByIdAndUpdate(req.business._id, {
      $inc: { deliveriesThisCycle: created.length },
    });

    res.status(201).json({
      success: true,
      message: `${created.length} orders created`,
      data: created,
    });
  } catch (err) {
    console.error('createBatchOrder error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    List this business's deliveries, optionally filtered by status
// @route   GET /api/business/orders?status=&page=&limit=
// @access  Private (business)
exports.getDeliveries = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { business: req.business._id };
    if (status) filter.status = status;

    const deliveries = await Delivery.find(filter)
      .populate('driver', 'name phone vehicle rating')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Delivery.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: deliveries,
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Dashboard summary — counts by status, spend this cycle, plan info
// @route   GET /api/business/dashboard
// @access  Private (business)
exports.getDashboardStats = async (req, res) => {
  try {
    const businessId = req.business._id;

    const statusCounts = await Delivery.aggregate([
      { $match: { business: businessId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const counts = statusCounts.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    const spendAgg = await Delivery.aggregate([
      {
        $match: {
          business: businessId,
          status: { $nin: ['pending_payment', 'cancelled'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]);

    const plan = getPlan(req.business.plan);

    res.status(200).json({
      success: true,
      data: {
        plan: {
          key: plan.key,
          label: plan.label,
          monthlyDeliveryLimit: plan.monthlyDeliveryLimit,
          deliveriesThisCycle: req.business.deliveriesThisCycle,
        },
        subscriptionStatus: req.business.subscriptionStatus,
        deliveryCounts: counts,
        totalSpend: spendAgg[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};