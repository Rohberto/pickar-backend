const { nanoid } = require('nanoid');
const Delivery = require('../models/Delivery');
const Business = require('../models/Business');
const { getRideType } = require('../config/rideTypes');
const { BUSINESS_PLANS, getPlan } = require('../config/businessPlans');
const { matchDriver } = require('../services/matchingService');

// @desc    List available subscription plans
// @route   GET /api/business/plans
// @access  Public
exports.getPlans = async (req, res) => {
  res.status(200).json({ success: true, data: Object.values(BUSINESS_PLANS) });
};

// @desc    Create a batch of deliveries in one request
// @route   POST /api/business/orders/batch
// @access  Private (business, approved + active)
// @body    { orders: [{
//   pickupAddress, pickupCoordinates?: {lat,lng},
//   recipientAddress, recipientCoordinates?: {lat,lng},
//   recipientName, recipientPhone, packageType, rideType
// }] }
//
// Businesses already pay via their monthly subscription (gated by
// requireActiveBusiness before this handler runs) — there is no separate
// per-order charge, so orders go straight to matching, same as a consumer
// delivery after wallet debit.
//
// COORDINATES CAVEAT: matchDriver() needs pickupAddress.coordinates to find
// nearby drivers. The current booking form only collects free-text
// addresses, so pickupCoordinates/recipientCoordinates will usually be
// missing. Orders without coordinates are created but NOT sent to
// matchDriver() — they're left at 'pending' rather than crashing or silently
// pretending to search. Wiring up an address autocomplete (Google Places)
// on the booking form so it captures lat/lng is the real fix.
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
        pickupCoordinates,
        recipientAddress,
        recipientCoordinates,
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

      const hasCoordinates =
        pickupCoordinates?.lat != null && pickupCoordinates?.lng != null;

      validated.push({
        pickupAddress: {
          label: pickupAddress,
          coordinates: hasCoordinates ? pickupCoordinates : undefined,
        },
        recipient: {
          address: {
            label: recipientAddress,
            coordinates:
              recipientCoordinates?.lat != null && recipientCoordinates?.lng != null
                ? recipientCoordinates
                : undefined,
          },
          name: recipientName,
          phone: recipientPhone,
        },
        packageType,
        rideType,
        price: rideConfig.discountedPrice,
        agreedToInsurance: true,
        // No coordinates yet → leave at 'pending' so matchDriver isn't called
        // on an address it can't search from. Has coordinates → straight to
        // 'finding_driver', matched right after insertMany below.
        status: hasCoordinates ? 'finding_driver' : 'pending',
        business: req.business._id,
        createdByBusinessUser: req.businessUser._id,
        trackingToken: nanoid(10),
      });
    }

    const created = await Delivery.insertMany(validated);

    await Business.findByIdAndUpdate(req.business._id, {
      $inc: { deliveriesThisCycle: created.length },
    });

    // Kick off matching for every order that has coordinates
    const io = req.app.get('io');
    const readyForMatching = created.filter((d) => d.status === 'finding_driver');
    readyForMatching.forEach((delivery) => matchDriver(delivery._id, io));

    const skippedCount = created.length - readyForMatching.length;

    res.status(201).json({
      success: true,
      message:
        skippedCount > 0
          ? `${created.length} orders created. ${skippedCount} are missing map coordinates and are waiting — matching hasn't started for those yet.`
          : `${created.length} orders created and matching has started.`,
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