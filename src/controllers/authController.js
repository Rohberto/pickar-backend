
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');

// Generate OTP
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @desc    Register user/driver
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const { fullName, email, phone, password, userType } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const userData = {
      fullName,
      email,
      phone,
      password,
      userType,
      otp,
      otpExpires,
    };

    // Add Cloudinary URLs for driver documents
    if (userType === 'driver') {
      if (req.files) {
        if (req.files.idDocument && req.files.idDocument[0]) {
          userData.idDocument = req.files.idDocument[0].path; // Cloudinary URL
        }
        if (req.files.proofOfAddress && req.files.proofOfAddress[0]) {
          userData.proofOfAddress = req.files.proofOfAddress[0].path; // Cloudinary URL
        }
      }

      // Validate that driver uploaded required documents
      if (!userData.idDocument || !userData.proofOfAddress) {
        return res.status(400).json({
          success: false,
          message: 'Driver must upload both ID document and proof of address',
        });
      }
    }

    const user = await User.create(userData);

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, fullName);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Delete user if email fails
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for OTP.',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          userType: user.userType,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account already verified',
      });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // Verify user
    user.isVerified = true;
    if (user.userType === 'driver') {
  const Driver = require('../models/driver');
  const existingDriver = await Driver.findOne({ user: user._id });
  if (!existingDriver) {
    await Driver.create({
      user: user._id,
      name: user.fullName,
      phone: user.phone,
      status: 'offline',
      location: {
        type: 'Point',
        coordinates: [3.3792, 6.5244], // default Lagos coords until they go online
      },
    });
  }
}
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          userType: user.userType,
          isVerified: user.isVerified,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account already verified',
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, user.fullName);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Login user/driver
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password, userType } = req.body;

    // Validate input
    if (!email || !password || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, and user type',
      });
    }

    // Check if user exists
    const user = await User.findOne({ email, userType }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email first',
        needsVerification: true,
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          userType: user.userType,
          isVerified: user.isVerified,
          isApproved: user.userType === 'driver' ? user.isApproved : undefined,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          userType: user.userType,
          isVerified: user.isVerified,
          idDocument: user.idDocument,
          proofOfAddress: user.proofOfAddress,
          isApproved: user.isApproved,
        },
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Logout
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
 
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide old and new password',
      });
    }
 
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters',
      });
    }
 
    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await user.comparePassword(oldPassword);
 
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Old password is incorrect',
      });
    }
 
    user.password = newPassword;
    await user.save(); // pre-save hook hashes the new password automatically
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
 
// @desc    Forgot password — sends OTP to email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
 
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide your email' });
    }
 
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal whether email exists — generic message
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, an OTP has been sent.',
      });
    }
 
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();
 
    await sendOTPEmail(email, otp, user.fullName);
 
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
 
// @desc    Reset password — verify OTP then set new password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
 
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
 
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }
 
    const user = await User.findOne({ email }).select('+otp +otpExpires +password');
 
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
 
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
 
    if (user.otpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP has expired' });
    }
 
    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save(); // pre-save hook hashes automatically
 
    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
 
