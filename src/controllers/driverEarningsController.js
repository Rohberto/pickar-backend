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
// POST /api/drivers/withdraw
// Body: { amount, bankAccountId }
// Debits earnings immediately and files a request — admin approval now
// required before any Paystack transfer is attempted.
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

    const { earnings } = await debitDriverEarnings({
      driverId: driver._id,
      amount,
      bankAccountId: bankAccount._id,
      description: `Withdrawal requested to ${bankAccount.bankName} – ${bankAccount.accountNumber}`,
    });

    res.json({
      success: true,
      message: `Withdrawal request of ₦${amount.toLocaleString()} submitted for admin approval.`,
      data: { status: 'pending', amount, balance: earnings.balance, bankName: bankAccount.bankName },
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