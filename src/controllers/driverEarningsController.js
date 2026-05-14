const { DriverEarnings, BankAccount } = require('../models/DriverEarnings');
const Transaction = require('../models/Transaction');
const Driver = require('../models/driver');
const {
  resolveBankAccount,
  createTransferRecipient,
  initiateTransfer,
  getBanks,
} = require('../services/paystackService');
const { debitDriverEarnings } = require('../services/walletService');

// GET /api/drivers/earnings
exports.getEarnings = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

    let earnings = await DriverEarnings.findOne({ driver: driver._id });
    if (!earnings) earnings = await DriverEarnings.create({ driver: driver._id });

    // Today's stats
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayTransactions = await Transaction.find({
      driver: driver._id,
      type: 'earning',
      createdAt: { $gte: startOfDay },
    });

    const todayEarnings = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
    const todayRides = todayTransactions.length;

    // Recent transactions (last 20)
    const recentTransactions = await Transaction.find({ driver: driver._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('delivery', 'pickupAddress recipient price');

    const allTimeRides = await Transaction.countDocuments({
  driver: driver._id,
  type: 'earning',
});

    res.json({
      success: true,
      data: {
        balance: earnings.balance,
        totalEarned: earnings.totalEarned,
        totalWithdrawn: earnings.totalWithdrawn,
        todayEarnings,
        todayRides,
        recentTransactions,
        allTimeRides
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/drivers/banks
// Returns list of Nigerian banks from Paystack
exports.getBankList = async (req, res) => {
  try {
    const banks = await getBanks();
    res.json({ success: true, data: banks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/drivers/bank-accounts
exports.getBankAccounts = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false });

    const accounts = await BankAccount.find({ driver: driver._id }).sort({ isDefault: -1 });
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/drivers/bank-accounts
// Body: { bankName, bankCode, accountNumber }
exports.addBankAccount = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false });

    const { bankName, bankCode, accountNumber } = req.body;
    if (!bankName || !bankCode || !accountNumber) {
      return res.status(400).json({ success: false, message: 'All bank details required' });
    }

    // Verify account via Paystack
    const resolved = await resolveBankAccount({ accountNumber, bankCode });

    // Create Paystack transfer recipient
    const recipientCode = await createTransferRecipient({
      accountName: resolved.accountName,
      accountNumber,
      bankCode,
    });

    // Check if first account — set as default
    const count = await BankAccount.countDocuments({ driver: driver._id });

    const account = await BankAccount.create({
      driver: driver._id,
      bankName,
      bankCode,
      accountNumber,
      accountName: resolved.accountName,
      isDefault: count === 0,
      paystackRecipientCode: recipientCode,
    });

    res.status(201).json({ success: true, data: account });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/drivers/bank-accounts/:id
exports.removeBankAccount = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    await BankAccount.findOneAndDelete({ _id: req.params.id, driver: driver._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/drivers/withdraw
// Body: { amount, bankAccountId }
exports.withdraw = async (req, res) => {
  try {
    const { amount, bankAccountId } = req.body;

    if (!amount || amount < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦1,000' });
    }

    const driver = await Driver.findOne({ user: req.user._id });
    if (!driver) return res.status(404).json({ success: false });

    const bankAccount = await BankAccount.findOne({ _id: bankAccountId, driver: driver._id });
    if (!bankAccount) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    // Debit earnings immediately so balance reflects the request
    await debitDriverEarnings({ driverId: driver._id, amount });

    // Create a pending withdrawal record
    const withdrawal = await Transaction.findOneAndUpdate(
      { driver: driver._id, type: 'withdrawal', status: 'pending', amount },
      {
        driver: driver._id,
        type: 'withdrawal',
        amount,
        status: 'pending',
        description: `Withdrawal to ${bankAccount.bankName} – ${bankAccount.accountNumber}`,
      },
      { upsert: true, new: true }
    );

    // Try Paystack transfer — if it fails, mark as pending for manual review
    // instead of returning an error to the driver
    try {
      if (bankAccount.paystackRecipientCode) {
        const transfer = await initiateTransfer({
          recipientCode: bankAccount.paystackRecipientCode,
          amountNaira: amount,
          reason: 'Pickar driver withdrawal',
        });

        // Transfer initiated — update transaction with transfer code
        await Transaction.findByIdAndUpdate(withdrawal._id, {
          paystackReference: transfer.transferCode,
          paystackStatus: transfer.status,
          // 'otp' status means Paystack needs OTP — treat as pending
          status: transfer.status === 'success' ? 'success' : 'pending',
          description: `Withdrawal to ${bankAccount.bankName} – ${bankAccount.accountNumber} (${transfer.status})`,
        });
      }
    } catch (transferErr) {
      // Paystack failed — keep as pending for manual processing
      // Don't expose Paystack errors to the driver
      console.error('[Withdraw] Paystack transfer failed:', transferErr.message);
    }

    res.json({
      success: true,
      message: `Withdrawal of ₦${amount.toLocaleString()} is being processed. Funds will arrive in your ${bankAccount.bankName} account within 24 hours.`,
      data: { status: 'pending', amount, bankName: bankAccount.bankName },
    });

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/drivers/bank-accounts/verify
exports.verifyBankAccount = async (req, res) => {
  try {
    const { bankCode, accountNumber } = req.body;
    if (!bankCode || !accountNumber) {
      return res.status(400).json({ success: false, message: 'Bank code and account number required' });
    }
    const resolved = await resolveBankAccount({ accountNumber, bankCode });
    res.json({ success: true, data: { accountName: resolved.accountName, accountNumber } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};