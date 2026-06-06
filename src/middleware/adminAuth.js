const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

/**
 * protect
 * Verifies the Bearer token and attaches req.admin.
 * Uses a separate token namespace so admin tokens can never
 * be used on user/driver routes and vice versa.
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorised. No token provided.',
      });
    }

    // Verify token — uses same JWT_SECRET but decoded payload has adminId field
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.adminId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type.',
      });
    }

    const admin = await Admin.findById(decoded.adminId);

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Admin account not found or deactivated.',
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Not authorised. Token invalid or expired.',
    });
  }
};

/**
 * restrictTo(...roles)
 * Usage:  router.delete('/admins/:id', protect, restrictTo('super_admin'), ...)
 * Blocks access if the logged-in admin's role is not in the allowed list.
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires one of: ${roles.join(', ')}.`,
      });
    }
    next();
  };
};