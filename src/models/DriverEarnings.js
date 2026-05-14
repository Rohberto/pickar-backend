const mongoose = require('mongoose');

// Tracks a driver's earnings balance (separate from user wallet)
const driverEarningsSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },    // lifetime earnings
    totalWithdrawn: { type: Number, default: 0 },  // lifetime withdrawals
    currency: { type: String, default: 'NGN' },
  },
  { timestamps: true }
);

// Driver's saved bank accounts for withdrawals
const bankAccountSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    bankName: { type: String, required: true },
    bankCode: { type: String, required: true },   // Paystack bank code
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true }, // verified account name
    isDefault: { type: Boolean, default: false },
    // Paystack recipient code for transfers
    paystackRecipientCode: { type: String, default: null },
  },
  { timestamps: true }
);

const DriverEarnings = mongoose.models.DriverEarnings || mongoose.model('DriverEarnings', driverEarningsSchema);
const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount', bankAccountSchema);

module.exports = { DriverEarnings, BankAccount };