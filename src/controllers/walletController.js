const { getOrCreateWallet, creditWallet } = require('../services/walletService');
const { initializeTopup, verifyTransaction, verifyWebhookSignature } = require('../services/paystackService');
const Transaction = require('../models/Transaction');
const User = require('../models/user');

// GET /api/wallet
exports.getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    res.json({ success: true, data: wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/wallet/transactions
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/wallet/initiate-topup
// Body: { amount } — amount in Naira
exports.initiateTopup = async (req, res) => {
  try {
    const { amount, channel } = req.body;   // ← destructure channel

    if (!amount || amount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum top-up is ₦100' });
    }

    const result = await initializeTopup({
      email: req.user.email,
      amountNaira: amount,
      channel: channel || 'card',   // ← pass it through
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/wallet/verify-topup
// Body: { reference } — Paystack transaction reference
exports.verifyTopup = async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ success: false, message: 'Reference required' });

    // Check not already processed
    const existing = await Transaction.findOne({ paystackReference: reference });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Transaction already processed' });
    }

    const verified = await verifyTransaction(reference);

    // Credit wallet
    const wallet = await creditWallet({
      userId: req.user._id,
      amount: verified.amountNaira,
      description: `Wallet top-up via ${verified.channel || 'Paystack'}`,
      paystackReference: reference,
    });

    res.json({
      success: true,
      message: `₦${verified.amountNaira.toLocaleString()} added to your wallet`,
      data: { balance: wallet.balance, amountAdded: verified.amountNaira },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/webhook/paystack
// Paystack sends payment events here — auto-credit on charge.success
exports.paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const { event, data } = req.body;

    if (event === 'charge.success') {
      const reference = data.reference;
      const existing = await Transaction.findOne({ paystackReference: reference });
      if (existing) return res.sendStatus(200); // already processed

     
      const user = await User.findOne({ email: data.customer.email });
      if (!user) return res.sendStatus(200);

      await creditWallet({
        userId: user._id,
        amount: data.amount / 100, // kobo → naira
        description: `Wallet top-up via ${data.channel}`,
        paystackReference: reference,
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Paystack Webhook]', err.message);
    res.sendStatus(500);
  }
};