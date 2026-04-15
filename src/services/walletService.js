const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

/**
 * Get or create wallet for a user
 */
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId });
  }
  return wallet;
};


/**
 * Credit a wallet (after successful Paystack payment)
 */
const creditWallet = async ({ userId, amount, reference, purpose = 'wallet_funding', description }) => {
  const wallet = await getOrCreateWallet(userId);

  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore + amount;

  // Update wallet balance
  wallet.balance = balanceAfter;
  await wallet.save();

  // Record transaction
  const transaction = await Transaction.create({
    user: userId,
    wallet: wallet._id,
    type: 'credit',
    purpose,
    amount,
    balanceBefore,
    balanceAfter,
    reference,
    paystackStatus: 'success',
    description: description || `Wallet funded with ₦${amount.toLocaleString()}`,
  });

  return { wallet, transaction };
};


/**
 * Debit a wallet (when user pays for a delivery)
 */
const debitWallet = async ({ userId, amount, deliveryId, purpose = 'delivery_payment', description }) => {
  const wallet = await getOrCreateWallet(userId);

  if (wallet.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore - amount;

  wallet.balance = balanceAfter;
  await wallet.save();

  const transaction = await Transaction.create({
    user: userId,
    wallet: wallet._id,
    type: 'debit',
    purpose,
    amount,
    balanceBefore,
    balanceAfter,
    delivery: deliveryId || null,
    paystackStatus: 'success',
    description: description || `Payment of ₦${amount.toLocaleString()} for delivery`,
  });

  return { wallet, transaction };
};

module.exports = { getOrCreateWallet, creditWallet, debitWallet };