const crypto = require('crypto');
const User = require('../models/user');
const Transaction = require('../models/Transaction');
const { getOrCreateWallet, creditWallet } = require('../services/walletService');
const { initializeTransaction, verifyTransaction } = require('../services/paystackService');


// GET /api/wallet
// Returns wallet balance — powers the home screen balance display
exports.getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    res.json({ success: true, data: wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// POST /api/wallet/fund
// Step 1 — user taps "Add Fund", backend returns Paystack payment URL
exports.fundWallet = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum funding amount is ₦100',
      });
    }

    const user = await User.findById(req.user._id);

    // Generate a unique reference for this transaction
    const reference = `PICKAR-${req.user._id}-${Date.now()}`;

    const paystackData = await initializeTransaction({
      email: user.email,
      amount,
      reference,
      metadata: {
        userId: req.user._id.toString(),
        purpose: 'wallet_funding',
      },
    });

    // Save a pending transaction so we can match it on webhook
    const wallet = await getOrCreateWallet(req.user._id);
    await Transaction.create({
      user: req.user._id,
      wallet: wallet._id,
      type: 'credit',
      purpose: 'wallet_funding',
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // will update after payment
      reference,
      paystackStatus: 'pending',
      description: `Wallet funding of ₦${amount.toLocaleString()}`,
    });

    res.json({
      success: true,
      message: 'Payment initialized',
      data: {
        authorizationUrl: paystackData.authorization_url,
        reference: paystackData.reference,
        accessCode: paystackData.access_code,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// GET /api/wallet/verify/:reference
// Step 2 — called after user returns from Paystack payment page
// Acts as a fallback in case webhook is delayed
exports.verifyFunding = async (req, res) => {
  try {
    const { reference } = req.params;

    // Check if already processed (webhook may have beaten us here)
    const existing = await Transaction.findOne({ reference });
    if (existing && existing.paystackStatus === 'success') {
      const wallet = await getOrCreateWallet(req.user._id);
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: { wallet },
      });
    }

    // Verify with Paystack
    const paystackData = await verifyTransaction(reference);

    if (paystackData.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Payment not successful',
      });
    }

    const amount = paystackData.amount / 100; // convert from kobo

    const { wallet, transaction } = await creditWallet({
      userId: req.user._id,
      amount,
      reference,
      description: `Wallet funded with ₦${amount.toLocaleString()}`,
    });

    res.json({
      success: true,
      message: `₦${amount.toLocaleString()} added to your wallet`,
      data: { wallet, transaction },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// POST /api/wallet/webhook
// Paystack calls this automatically after every payment
// IMPORTANT: This route must be excluded from auth middleware
exports.paystackWebhook = async (req, res) => {
  try {
    // Step 1 — Verify the request is genuinely from Paystack
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;

    // Step 2 — Only handle successful charges
    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;

      // Check if already processed (avoid double crediting)
      const existing = await Transaction.findOne({
        reference,
        paystackStatus: 'success',
      });

      if (existing) {
        return res.sendStatus(200); // already handled
      }

      const userId = metadata.userId;
      const amountInNaira = amount / 100;

      await creditWallet({
        userId,
        amount: amountInNaira,
        reference,
        purpose: 'wallet_funding',
        description: `Wallet funded with ₦${amountInNaira.toLocaleString()}`,
      });

      // Update the pending transaction record
      await Transaction.findOneAndUpdate(
        { reference },
        { paystackStatus: 'success' }
      );
    }

    // Always respond 200 to Paystack quickly
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
  }
};


// GET /api/wallet/transactions
// Transaction history for the wallet screen
exports.getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('delivery', 'recipient.address status');

    const total = await Transaction.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};