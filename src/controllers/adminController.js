const Admin = require('../models/Admin');
const User = require('../models/user');
const Driver = require('../models/driver');
const Delivery = require('../models/Delivery');
const Transaction = require('../models/Transaction');
const { DriverEarnings } = require('../models/DriverEarnings');
const jwt = require('jsonwebtoken');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateAdminToken = (adminId) => {
  return jwt.sign({ adminId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

const formatAdmin = (admin) => ({
  id: admin._id,
  fullName: admin.fullName,
  email: admin.email,
  role: admin.role,
  photo: admin.photo,
  isActive: admin.isActive,
  lastLogin: admin.lastLogin,
  createdAt: admin.createdAt,
});

const zeroFillDailyDeliveries = (rawDaily, days) => {
  const byDate = new Map(rawDaily.map((d) => [d._id, d]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const existing = byDate.get(dateStr);
    result.push({
      _id: dateStr,
      total: existing?.total || 0,
      ongoing: existing?.ongoing || 0,
      revenue: existing?.revenue || 0,
    });
  }
  return result;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/auth/login
 * Admin login — returns adminId-scoped JWT
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const admin = await Admin.findOne({ email }).select('+password');

    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Contact a super admin.',
      });
    }

    // Update last login timestamp
    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    const token = generateAdminToken(admin._id);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: { admin: formatAdmin(admin), token },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/admin/auth/me
 * Returns the currently logged-in admin's profile
 */
exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: { admin: formatAdmin(req.admin) },
  });
};

/**
 * POST /api/admin/auth/create
 * super_admin only — create another admin account
 */
exports.createAdmin = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'fullName, email, and password are required.',
      });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An admin with this email already exists.',
      });
    }

    const admin = await Admin.create({
      fullName,
      email,
      password,
      role: role || 'support',
      createdBy: req.admin._id,
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created.',
      data: { admin: formatAdmin(admin) },
    });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Dashboard Overview ───────────────────────────────────────────────────────

/**
 * GET /api/admin/dashboard
 * Powers the Overview screen — stats cards + delivery analytics + recent lists
 * Query params:
 *   period  — 'today' | '7d' | '30d' (default: '30d')
 */
exports.getDashboard = async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    const periodMap = { today: 1, '7d': 7, '30d': 30 };
    const days = periodMap[period] || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [
      totalUsers,
      activeUsers,
      totalDrivers,
      activeDrivers,
      completedDeliveries,
      ongoingDeliveries,
      cancelledDeliveries,
      totalDeliveries,
      revenueAgg,
      recentUsers,
      recentDeliveries,
      dailyDeliveries,
    ] = await Promise.all([
      // User stats
      User.countDocuments({ userType: 'user' }),
      User.countDocuments({ userType: 'user', isSuspended: { $ne: true } }),

      // Driver stats
      User.countDocuments({ userType: 'driver' }),
      Driver.countDocuments({ status: 'online' }),

      // Delivery stats
      Delivery.countDocuments({ status: 'delivered' }),
      Delivery.countDocuments({ status: { $in: ['driver_assigned', 'driver_arrived', 'in_transit'] } }),
      Delivery.countDocuments({ status: 'cancelled' }),
      Delivery.countDocuments({}),

      // Revenue — sum of all delivered deliveries
      Delivery.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),

      // Recent users (for sidebar panel)
   User.find({ userType: 'user' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('fullName email phone photo createdAt'),

      // Recent deliveries (for ride management table)
      Delivery.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'fullName')
        .populate({ path: 'driver', populate: { path: 'user', select: 'fullName' } })
        .select('status createdAt price'),

      // Daily delivery counts for the analytics chart
Delivery.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: 1 },
            ongoing: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['driver_assigned', 'driver_arrived', 'in_transit']] },
                  1,
                  0,
                ],
              },
            },
            revenue: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$price', 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: {
        stats: {
          completedDeliveries,
          ongoingDeliveries,
          activeDrivers,
          totalRevenue,
          totalUsers,
          activeUsers,
          inactiveUsers: totalUsers - activeUsers,
          totalDrivers,
          cancelledDeliveries,
          totalDeliveries,
        },
    deliveryAnalytics: zeroFillDailyDeliveries(dailyDeliveries, days),
        recentUsers,
        recentDeliveries: recentDeliveries.map((d) => ({
          id: d._id,
          driverName: d.driver?.name || '—',
          userName: d.user?.fullName || '—',
          status: d.status,
          date: d.createdAt,
          price: d.price,
        })),
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── User Management ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Paginated list of senders with stats cards
 * Query: page, limit, status (active|inactive|suspended), search
 */
exports.getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter
    const filter = { userType: 'user' };
    if (status === 'suspended') filter.isSuspended = true;
    else if (status === 'active') filter.isSuspended = { $ne: true };
    else if (status === 'inactive') filter.isSuspended = false;

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total, totalCount, activeCount, suspendedCount] =
      await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .select('fullName email phone photo isSuspended createdAt'),

        User.countDocuments(filter),

       User.countDocuments({ userType: 'user' }),
        User.countDocuments({ userType: 'user', isSuspended: { $ne: true } }),
        User.countDocuments({ userType: 'user', isSuspended: true }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          total: totalCount,
          active: activeCount,
          inactive: totalCount - activeCount - suspendedCount,
          suspended: suspendedCount,
        },
        users,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/admin/users/:id
 * Single user profile with delivery history summary
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, userType: 'user' });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const [totalRides, totalSpent, recentDeliveries] = await Promise.all([
      Delivery.countDocuments({ user: user._id }),
      Delivery.aggregate([
        { $match: { user: user._id, status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),
      Delivery.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({ path: 'driver', select: 'name vehicle' })
        .select('status price createdAt pickupAddress recipient'),
    ]);

    res.status(200).json({
      success: true,
      data: {
        user,
        stats: {
          totalRides,
          totalSpent: totalSpent[0]?.total || 0,
        },
        recentDeliveries,
      },
    });
  } catch (err) {
    console.error('Get user by ID error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PATCH /api/admin/users/:id/suspend
 * Toggle suspension on a sender account
 * Body: { suspend: true | false, reason?: string }
 */
exports.toggleUserSuspension = async (req, res) => {
  try {
    const { suspend, reason } = req.body;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, userType: 'user' },
      {
        isSuspended: suspend,
        suspensionReason: suspend ? (reason || 'Suspended by admin') : null,
      },
      { new: true }
    ).select('fullName email isSuspended suspensionReason');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: suspend ? 'User suspended.' : 'User unsuspended.',
      data: { user },
    });
  } catch (err) {
    console.error('Toggle suspension error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Driver Management ────────────────────────────────────────────────────────

/**
 * GET /api/admin/drivers
 * Paginated driver list with stats
 * Query: page, limit, status (active|inactive|pending|suspended), search
 */
exports.getDrivers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build filter on User (drivers are userType: 'driver')
    const userFilter = { userType: 'driver' };
    if (status === 'suspended') userFilter.isSuspended = true;
    else if (status === 'pending') {
      userFilter.isApproved = false;
      userFilter.isSuspended = { $ne: true };
    } else if (status === 'active') {
      userFilter.isApproved = true;
      userFilter.isSuspended = { $ne: true };
    } else if (status === 'inactive') {
      userFilter.isApproved = false;
    }

    if (search) {
      userFilter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const matchingUsers = await User.find(userFilter).select('_id');
    const userIds = matchingUsers.map((u) => u._id);

    const [drivers, total, totalDrivers, activeCount, pendingCount] =
      await Promise.all([
        Driver.find({ user: { $in: userIds } })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate('user', 'fullName email phone isApproved isSuspended createdAt'),

        Driver.countDocuments({ user: { $in: userIds } }),
        Driver.countDocuments({}),
        Driver.countDocuments({}).then(async () =>
          User.countDocuments({ userType: 'driver', isApproved: true, isSuspended: { $ne: true } })
        ),
        User.countDocuments({ userType: 'driver', isApproved: false, isSuspended: { $ne: true } }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          total: totalDrivers,
          active: activeCount,
          pending: pendingCount,
        },
        drivers: drivers.map((d) => ({
          id: d._id,
          userId: d.user._id,
          name: d.name,
          email: d.user.email,
          phone: d.phone,
          photo: d.photo,
          vehicle: d.vehicle,
          rating: d.rating,
          status: d.status,
          isApproved: d.user.isApproved,
          isSuspended: d.user.isSuspended,
          createdAt: d.user.createdAt,
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) {
    console.error('Get drivers error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/admin/drivers/:id
 * Full driver profile — personal info, KYC docs, earnings, vehicle, trips stats
 */
exports.getDriverById = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).populate(
      'user',
      'fullName email phone isApproved isSuspended idDocument proofOfAddress createdAt'
    );

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found.' });
    }

    const [totalTrips, earnings, recentDeliveries, recentTransactions] = await Promise.all([
      Delivery.countDocuments({ driver: driver._id, status: 'delivered' }),
      DriverEarnings.findOne({ driver: driver._id }),
      Delivery.find({ driver: driver._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('status price pickupAddress recipient createdAt'),
      Transaction.find({ driver: driver._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('type amount status createdAt description'),
    ]);

    const yearsOfService = (
      (Date.now() - new Date(driver.user.createdAt).getTime()) /
      (1000 * 60 * 60 * 24 * 365)
    ).toFixed(1);

    res.status(200).json({
      success: true,
      data: {
        driver: {
          id: driver._id,
          name: driver.name,
          email: driver.user.email,
          phone: driver.phone,
          photo: driver.photo,
          vehicle: driver.vehicle,
          rating: driver.rating,
          status: driver.status,
          isApproved: driver.user.isApproved,
          isSuspended: driver.user.isSuspended,
          idDocument: driver.user.idDocument,
          proofOfAddress: driver.user.proofOfAddress,
          createdAt: driver.user.createdAt,
        },
        stats: {
          totalTrips,
          averageRating: driver.rating,
          yearsOfService: parseFloat(yearsOfService),
          totalEarned: earnings?.totalEarned || 0,
          currentBalance: earnings?.balance || 0,
        },
        recentDeliveries: recentDeliveries.map((d) => ({
          id: d._id,
          status: d.status,
          price: d.price,
          pickupAddress: d.pickupAddress?.label,
          dropoffAddress: d.recipient?.address?.label,
          date: d.createdAt,
        })),
        recentTransactions: recentTransactions.map((t) => ({
          id: t._id,
          type: t.type,
          amount: t.amount,
          status: t.status,
          description: t.description,
          date: t.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('Get driver by ID error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
/**
 * PATCH /api/admin/drivers/:id/approval
 * Approve, reject, or pend a driver application
 * Body: { action: 'approve' | 'reject' | 'pend', reason?: string }
 *
 * Maps to the Approve / Pend / Reject buttons on the driver profile screen
 */
exports.updateDriverApproval = async (req, res) => {
  try {
    const { action, reason } = req.body;

    if (!['approve', 'reject', 'pend'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "action must be 'approve', 'reject', or 'pend'.",
      });
    }

    const driver = await Driver.findById(req.params.id).populate('user');

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found.' });
    }

    const updateMap = {
      approve: { isApproved: true, isSuspended: false, approvalStatus: 'approved', approvalReason: null },
      reject:  { isApproved: false, approvalStatus: 'rejected', approvalReason: reason || 'Application rejected.' },
      pend:    { isApproved: false, approvalStatus: 'pending',  approvalReason: reason || null },
    };

    await User.findByIdAndUpdate(driver.user._id, updateMap[action]);

    res.status(200).json({
      success: true,
      message: `Driver ${action}d successfully.`,
      data: {
        driverId: driver._id,
        userId: driver.user._id,
        action,
      },
    });
  } catch (err) {
    console.error('Driver approval error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PATCH /api/admin/drivers/:id/suspend
 * Toggle suspension on a driver
 * Body: { suspend: true | false, reason?: string }
 */
exports.toggleDriverSuspension = async (req, res) => {
  try {
    const { suspend, reason } = req.body;

    const driver = await Driver.findById(req.params.id).populate('user');

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found.' });
    }

    await User.findByIdAndUpdate(driver.user._id, {
      isSuspended: suspend,
      suspensionReason: suspend ? (reason || 'Suspended by admin') : null,
    });

    // If suspending, force them offline
    if (suspend) {
      await Driver.findByIdAndUpdate(driver._id, { status: 'offline', socketId: null });
    }

    res.status(200).json({
      success: true,
      message: suspend ? 'Driver suspended and taken offline.' : 'Driver unsuspended.',
    });
  } catch (err) {
    console.error('Toggle driver suspension error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Deliveries / Rides ───────────────────────────────────────────────────────

/**
 * GET /api/admin/deliveries
 * Full paginated delivery list — powers both the Rides and Delivery Rides screens
 * Query: page, limit, status, search, dateFrom, dateTo
 */
exports.getDeliveries = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, dateFrom, dateTo } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};

    if (status) {
      const statusMap = {
        completed: 'delivered',
        ongoing: ['driver_assigned', 'driver_arrived', 'in_transit'],
        cancelled: 'cancelled',
        pending: 'pending',
      };
      const mapped = statusMap[status];
      filter.status = Array.isArray(mapped) ? { $in: mapped } : mapped;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    // Search on populated fields — we resolve user/driver IDs first
    if (search) {
      const [matchUsers, matchDriverUsers] = await Promise.all([
        User.find({ fullName: { $regex: search, $options: 'i' } }).select('_id'),
        User.find({ fullName: { $regex: search, $options: 'i' }, userType: 'driver' }).select('_id'),
      ]);

      let driverIds = [];
      if (matchDriverUsers.length) {
        const drivers = await Driver.find({ user: { $in: matchDriverUsers.map((u) => u._id) } }).select('_id');
        driverIds = drivers.map((d) => d._id);
      }

      filter.$or = [
        { user: { $in: matchUsers.map((u) => u._id) } },
        { driver: { $in: driverIds } },
      ];
    }

    const [deliveries, total, completedCount, ongoingCount, cancelledCount, totalDeliveries] =
      await Promise.all([
        Delivery.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate('user', 'fullName email phone photo')
          .populate({ path: 'driver', populate: { path: 'user', select: 'fullName' } })
          .select('status price createdAt pickupAddress recipient rideType'),

        Delivery.countDocuments(filter),
        Delivery.countDocuments({ status: 'delivered' }),
        Delivery.countDocuments({ status: { $in: ['driver_assigned', 'driver_arrived', 'in_transit'] } }),
        Delivery.countDocuments({ status: 'cancelled' }),
        Delivery.countDocuments({}),
      ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          completed: completedCount,
          ongoing: ongoingCount,
          cancelled: cancelledCount,
          total: totalDeliveries,
        },
        deliveries: deliveries.map((d) => ({
          id: d._id,
          userName: d.user?.fullName || '—',
          userPhoto: d.user?.photo || null,
          driverName: d.driver?.name || '—',
          driverId: d.driver?._id || null,
          status: d.status,
          price: d.price,
          rideType: d.rideType,
          pickupAddress: d.pickupAddress?.label,
          destinationAddress: d.recipient?.address?.label,
          date: d.createdAt,
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) {
    console.error('Get deliveries error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/admin/deliveries/:id
 * Full delivery detail — powers the Live Tracking / Delivery Detail screen
 * Returns tracking timeline, driver info, user info, recipient info
 */
exports.getDeliveryById = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id)
      .populate('user', 'fullName email phone photo')
      .populate({
        path: 'driver',
        select: 'name phone photo vehicle rating location status',
        populate: { path: 'user', select: 'fullName email' },
      });

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found.' });
    }

    // Build a human-readable tracking timeline
    const timeline = [];
    const statusOrder = [
      { status: 'pending',         label: 'Order placed' },
      { status: 'driver_assigned', label: 'Driver assigned' },
      { status: 'driver_arrived',  label: 'Driver arrived at pickup' },
      { status: 'in_transit',      label: 'Package picked up for delivery' },
      { status: 'delivered',       label: 'Package delivered' },
    ];

    const currentIdx = statusOrder.findIndex((s) => s.status === delivery.status);
    statusOrder.forEach((step, idx) => {
      timeline.push({
        label: step.label,
        completed: idx <= currentIdx,
        current: idx === currentIdx,
      });
    });

    res.status(200).json({
      success: true,
      data: {
        delivery: {
          id: delivery._id,
          status: delivery.status,
          price: delivery.price,
          rideType: delivery.rideType,
          packageType: delivery.packageType,
          pickupAddress: delivery.pickupAddress,
          recipient: delivery.recipient,
          createdAt: delivery.createdAt,
          updatedAt: delivery.updatedAt,
        },
        driver: delivery.driver
          ? {
              id: delivery.driver._id,
              name: delivery.driver.name,
              phone: delivery.driver.phone,
              photo: delivery.driver.photo,
              vehicle: delivery.driver.vehicle,
              rating: delivery.driver.rating,
              location: delivery.driver.location,
              status: delivery.driver.status,
            }
          : null,
        user: delivery.user
          ? {
              id: delivery.user._id,
              fullName: delivery.user.fullName,
              email: delivery.user.email,
              phone: delivery.user.phone,
              photo: delivery.user.photo,
            }
          : null,
        timeline,
      },
    });
  } catch (err) {
    console.error('Get delivery by ID error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/payments
 * Payments history — date, driver, user, amount, status
 * Query: page, limit, status (completed|pending), dateFrom, dateTo
 */
exports.getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { status: 'delivered' }; // only delivered rides have a settled payment

    if (dateFrom || dateTo) {
      filter.updatedAt = {};
      if (dateFrom) filter.updatedAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.updatedAt.$lte = new Date(dateTo);
    }

    // If admin filters by payment status — we'd normally have a separate
    // Transaction model; for now we piggyback on delivery status
    if (status === 'pending') {
      filter.status = { $in: ['driver_assigned', 'driver_arrived', 'in_transit'] };
    }

    const [payments, total, totalRevenue, driverPayoutsAgg, commissionAgg] =
      await Promise.all([
        Delivery.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate('user', 'fullName')
          .populate({ path: 'driver', select: 'name' })
          .select('price status updatedAt'),

        Delivery.countDocuments(filter),

        // Total platform revenue
        Delivery.aggregate([
          { $match: { status: 'delivered' } },
          { $group: { _id: null, total: { $sum: '$price' } } },
        ]),

        // Driver payouts (80% of price — adjust commission rate as needed)
        Delivery.aggregate([
          { $match: { status: 'delivered' } },
          { $group: { _id: null, total: { $sum: { $multiply: ['$price', 0.8] } } } },
        ]),

        // Platform commission (20%)
        Delivery.aggregate([
          { $match: { status: 'delivered' } },
          { $group: { _id: null, total: { $sum: { $multiply: ['$price', 0.2] } } } },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalRevenue: totalRevenue[0]?.total || 0,
          driverPayouts: driverPayoutsAgg[0]?.total || 0,
          commissionEarned: commissionAgg[0]?.total || 0,
        },
        payments: payments.map((p) => ({
          id: p._id,
          date: p.updatedAt,
          driverName: p.driver?.name || '—',
          userName: p.user?.fullName || '—',
          amount: p.price,
          status: p.status === 'delivered' ? 'completed' : 'pending',
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Migrations ───────────────────────────────────────────────────────────────

/**
 * POST /api/admin/migrations/ratings
 * super_admin only — one-time migration to convert flat numeric rating
 * values on Driver documents to the { average, count } object structure.
 *
 * Safe to run multiple times — only touches drivers where rating is still
 * a plain number (BSON type 'double' / 'int').
 */
exports.migrateRatings = async (req, res) => {
  try {
    // Only fetch drivers whose rating field is still a raw number
    const drivers = await Driver.find({ rating: { $type: 'number' } });

    let updated = 0;
    for (const driver of drivers) {
      const oldRating = typeof driver.rating === 'number' ? driver.rating : 0;
      await Driver.findByIdAndUpdate(
        driver._id,
        { $set: { rating: { average: oldRating, count: 0 } } },
        { strict: false }
      );
      updated++;
    }

    console.log(`[Migration] migrateRatings — updated ${updated} driver(s) by admin ${req.admin.email}`);

    res.json({
      success: true,
      message: `Migration complete. ${updated} driver(s) updated.`,
      updated,
    });
  } catch (err) {
    console.error('migrateRatings error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};