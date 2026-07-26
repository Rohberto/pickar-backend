const jwt = require('jsonwebtoken');
const BusinessUser = require('../models/BusinessUser');
const Business = require('../models/Business');

// Verifies the dispatcher's JWT, attaches req.businessUser and req.business.
// Also blocks access if the business isn't approved or is suspended, so you
// don't have to repeat that check in every controller.
exports.protectBusiness = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const businessUser = await BusinessUser.findById(decoded.id);
    if (!businessUser) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, dispatcher account not found',
      });
    }

    const business = await Business.findById(businessUser.business);
    if (!business) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, business account not found',
      });
    }

    if (business.isSuspended) {
      return res.status(403).json({
        success: false,
        message: 'This business account has been suspended',
      });
    }

    req.businessUser = businessUser;
    req.business = business;
    next();
  } catch (error) {
    console.error('protectBusiness error:', error);
    res.status(401).json({
      success: false,
      message: 'Not authorized, token failed',
    });
  }
};

// Use after protectBusiness on routes that require an approved, active
// subscription (e.g. creating deliveries) — separate from just being logged in,
// since a dispatcher can log in to see their pending status before approval.
exports.requireActiveBusiness = (req, res, next) => {
  if (!req.business.isApproved) {
    return res.status(403).json({
      success: false,
      message: 'Your business account is pending approval',
    });
  }
  if (req.business.subscriptionStatus !== 'active') {
    return res.status(403).json({
      success: false,
      message: 'Your subscription is not active. Please complete billing to continue.',
    });
  }
  next();
};

// Restrict certain actions (e.g. inviting dispatchers, billing) to the owner
exports.requireOwner = (req, res, next) => {
  if (req.businessUser.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only the business owner can perform this action',
    });
  }
  next();
};