const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
  
user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    type: {
      type: String,
      enum: [
        'topup',           // User added funds via Paystack
        'delivery_debit',  // User paid for delivery
        'escrow_hold',     // Funds moved to escrow
        'escrow_release',  // Escrow released to driver earnings
        'refund',          // Delivery cancelled — refund to user
        'withdrawal',      // Driver withdrew to bank
        'earning',         // Driver earned from completed delivery
      ],
      required: true,
    },

    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },

    description: { type: String },

    // Paystack reference (for topups)
    paystackReference: { type: String, default: null },
    paystackStatus: { type: String, default: null },

    // Linked delivery
    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
    },

    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'success',
    },

    // Balance after this transaction (snapshot)
    balanceAfter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);