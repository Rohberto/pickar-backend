const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Admin Model
 * Completely separate from the User model — admins have no overlap
 * with sender/driver logic (no OTP, no documents, no isApproved).
 *
 * Roles:
 *   super_admin  — full access, can create other admins
 *   support      — read-only + can suspend users/drivers
 */
const adminSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned in queries unless explicitly selected
    },
    role: {
      type: String,
      enum: ['super_admin', 'support'],
      default: 'support',
    },
    photo: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null, // null = seeded via script
    },
  },
  { timestamps: true }
);

// Hash password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare entered password with stored hash
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);