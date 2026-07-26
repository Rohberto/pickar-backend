const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const businessUserSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    fullName: {
      type: String,
      required: [true, 'Please provide your full name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 8,
      select: false,
    },
    // 'owner' created the Business account; 'dispatcher' was invited by an owner
    role: {
      type: String,
      enum: ['owner', 'dispatcher'],
      default: 'owner',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

businessUserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

businessUserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports =
  mongoose.models.BusinessUser || mongoose.model('BusinessUser', businessUserSchema);