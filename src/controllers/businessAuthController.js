const jwt = require('jsonwebtoken');
const Business = require('../models/Business');
const BusinessUser = require('../models/BusinessUser');
const { getPlan } = require('../config/businessPlans');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @desc    Register a business + its first dispatcher (owner) in one go
// @route   POST /api/business-auth/signup
// @access  Public
// NOTE: no OTP/email-verification step yet — unlike the User signup flow,
// this goes straight to "pending admin approval". Wire up sendOTPEmail
// here later if you want parity with the sender/driver flow.
exports.signup = async (req, res) => {
  try {
    const {
      businessName,
      businessEmail,
      businessPhone,
      industry,
      plan,
      fullName,
      email,
      password,
    } = req.body;

    if (!businessName || !businessEmail || !businessPhone || !fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const existingBusiness = await Business.findOne({ businessEmail });
    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: 'A business is already registered with this email',
      });
    }

    const existingUser = await BusinessUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A dispatcher account already exists with this email',
      });
    }

    const selectedPlan = getPlan(plan) || getPlan('starter');

    const business = await Business.create({
      businessName,
      businessEmail,
      businessPhone,
      industry,
      plan: selectedPlan.key,
      commissionRate: selectedPlan.commissionRate,
      subscriptionStatus: 'pending', // flips to 'active' once billing is wired up
      isApproved: false, // admin approves, same as drivers
    });

    const businessUser = await BusinessUser.create({
      business: business._id,
      fullName,
      email,
      password,
      role: 'owner',
    });

    const token = generateToken(businessUser._id);

    res.status(201).json({
      success: true,
      message: 'Business registered. Awaiting admin approval before you can create orders.',
      data: {
        business: {
          id: business._id,
          businessName: business.businessName,
          plan: business.plan,
          isApproved: business.isApproved,
          subscriptionStatus: business.subscriptionStatus,
        },
        businessUser: {
          id: businessUser._id,
          fullName: businessUser.fullName,
          email: businessUser.email,
          role: businessUser.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Business signup error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// @desc    Dispatcher login
// @route   POST /api/business-auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    const businessUser = await BusinessUser.findOne({ email }).select('+password');
    if (!businessUser) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordCorrect = await businessUser.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const business = await Business.findById(businessUser.business);
    if (!business) {
      return res.status(404).json({ success: false, message: 'Business account not found' });
    }

    if (business.isSuspended) {
      return res.status(403).json({ success: false, message: 'This business account has been suspended' });
    }

    const token = generateToken(businessUser._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        business: {
          id: business._id,
          businessName: business.businessName,
          plan: business.plan,
          isApproved: business.isApproved,
          subscriptionStatus: business.subscriptionStatus,
        },
        businessUser: {
          id: businessUser._id,
          fullName: businessUser.fullName,
          email: businessUser.email,
          role: businessUser.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Business login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get current dispatcher + business
// @route   GET /api/business-auth/me
// @access  Private (business)
exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      business: req.business,
      businessUser: {
        id: req.businessUser._id,
        fullName: req.businessUser.fullName,
        email: req.businessUser.email,
        role: req.businessUser.role,
      },
    },
  });
};