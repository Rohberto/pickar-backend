const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { DriverEarnings } = require('../models/DriverEarnings');

/**
 * Get or create a wallet for a user
 */
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId });
  return wallet;
};

/**
 * Credit user wallet (after Paystack top-up)
 */
const creditWallet = async ({ userId, amount, description, paystackReference, deliveryId }) => {
  const wallet = await getOrCreateWallet(userId);
  wallet.balance += amount;
  await wallet.save();

  await Transaction.create({
    user: userId,
    type: 'topup',
    amount,
    description: description || `Wallet top-up of ₦${amount.toLocaleString()}`,
    paystackReference: paystackReference || null,
    paystackStatus: 'success',
    delivery: deliveryId || null,
    status: 'success',
    balanceAfter: wallet.balance,
  });

  return wallet;
};

/**
 * Debit user wallet AND move funds to escrow
 * Called on confirmPickup — holds money until delivery completes
 */
const debitWallet = async ({ userId, amount, deliveryId, description }) => {
  const wallet = await getOrCreateWallet(userId);

  if (wallet.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  wallet.balance -= amount;
  wallet.escrowBalance += amount;
  await wallet.save();

  await Transaction.create({
    user: userId,
    type: 'escrow_hold',
    amount,
    description: description || `Payment held in escrow for delivery`,
    delivery: deliveryId || null,
    status: 'success',
    balanceAfter: wallet.balance,
  });

  return wallet;
};

/**
 * Release escrow to driver earnings when delivery completes
 * Called from markDelivered
 * Applies platform commission (10%) — adjust as needed
 */
const PLATFORM_COMMISSION = 0.10; // 10%

const releaseEscrowToDriver = async ({ userId, driverId, amount, deliveryId }) => {
  // Clear escrow from user wallet
  const wallet = await getOrCreateWallet(userId);
  wallet.escrowBalance = Math.max(0, wallet.escrowBalance - amount);
  await wallet.save();

  // Calculate driver payout after commission
  const commission = Math.round(amount * PLATFORM_COMMISSION);
  const driverPayout = amount - commission;

  // Credit driver earnings
  let earnings = await DriverEarnings.findOne({ driver: driverId });
  if (!earnings) earnings = await DriverEarnings.create({ driver: driverId });

  earnings.balance += driverPayout;
  earnings.totalEarned += driverPayout;
  await earnings.save();

  // Record transactions
  await Transaction.create({
    user: userId,
    type: 'escrow_release',
    amount,
    description: 'Escrow released — delivery completed',
    delivery: deliveryId || null,
    status: 'success',
    balanceAfter: wallet.balance,
  });

  await Transaction.create({
    driver: driverId,
    type: 'earning',
    amount: driverPayout,
    description: `Delivery earning (after ${PLATFORM_COMMISSION * 100}% commission)`,
    delivery: deliveryId || null,
    status: 'success',
    balanceAfter: earnings.balance,
  });

  return { driverPayout, commission };
};

/**
 * Refund escrow to user wallet (on delivery cancellation)
 */
const refundEscrow = async ({ userId, amount, deliveryId }) => {
  const wallet = await Wallet.findOne({ user: userId });
  if (!wallet) return;

  wallet.escrowBalance = Math.max(0, wallet.escrowBalance - amount);
  wallet.balance += amount;
  await wallet.save();

  await Transaction.create({
    user: userId,
    type: 'refund',
    amount,
    description: 'Refund — delivery cancelled',
    delivery: deliveryId || null,
    status: 'success',
    balanceAfter: wallet.balance,
  });

  return wallet;
};

/**
 * Debit driver earnings for a withdrawal
 */
const debitDriverEarnings = async ({ driverId, amount, deliveryId }) => {
  const earnings = await DriverEarnings.findOne({ driver: driverId });
  if (!earnings) throw new Error('Driver earnings account not found');
  if (earnings.balance < amount) throw new Error('Insufficient earnings balance');

  earnings.balance -= amount;
  earnings.totalWithdrawn += amount;
  await earnings.save();

  await Transaction.create({
    driver: driverId,
    type: 'withdrawal',
    amount,
    description: `Withdrawal of ₦${amount.toLocaleString()}`,
    delivery: deliveryId || null,
    status: 'pending', // pending until transfer confirms
    balanceAfter: earnings.balance,
  });

  return earnings;
};

module.exports = {
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  releaseEscrowToDriver,
  refundEscrow,
  debitDriverEarnings,
};