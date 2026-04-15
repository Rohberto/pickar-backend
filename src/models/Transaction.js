const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        'wallet_funding',   // user added money
        'delivery_payment', // deducted for a trip
        'refund',           // refund after cancellation
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    // Paystack specific
    reference: {
      type: String,
      unique: true,
      sparse: true, // allows null for debit transactions
    },
    paystackStatus: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },

    // Linked delivery (for debit transactions)
    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
    },

    description: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);