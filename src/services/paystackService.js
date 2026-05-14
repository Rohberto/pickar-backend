const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

const paystackHeaders = {
  Authorization: `Bearer ${PAYSTACK_SECRET}`,
  'Content-Type': 'application/json',
};

/**
 * Initialize a Paystack transaction for wallet top-up
 * Returns { authorizationUrl, reference, accessCode }
 */
const initializeTopup = async ({ email, amountNaira, channel = 'card' }) => {
  const amountKobo = Math.round(amountNaira * 100);

  // Map our method IDs to Paystack channel names
  const channelMap = {
    card: ['card'],
    transfer: ['bank_transfer'],
    verve: ['card'],      // Verve is a card type — Paystack handles it automatically
  };

  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: amountKobo,
      currency: 'NGN',
      channels: channelMap[channel] ?? ['card'],
      metadata: { type: 'wallet_topup' },
    },
    { headers: paystackHeaders }
  );

  if (!data.status) throw new Error(data.message || 'Failed to initialize payment');

  return {
    authorizationUrl: data.data.authorization_url,
    reference: data.data.reference,
    accessCode: data.data.access_code,
  };
};

/**
 * Verify a Paystack transaction after payment
 * Returns { success, amountNaira, reference }
 */
const verifyTransaction = async (reference) => {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${reference}`,
    { headers: paystackHeaders }
  );

  if (!data.status) throw new Error('Verification failed');

  const tx = data.data;
  if (tx.status !== 'success') {
    throw new Error(`Payment not successful: ${tx.status}`);
  }

  return {
    success: true,
    amountNaira: tx.amount / 100, // convert kobo → naira
    reference: tx.reference,
    channel: tx.channel,
    customerEmail: tx.customer?.email,
  };
};

/**
 * Resolve bank account — verify account number + bank code
 * Returns { accountName, accountNumber }
 */
const resolveBankAccount = async ({ accountNumber, bankCode }) => {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: paystackHeaders }
  );
  if (!data.status) throw new Error(data.message || 'Could not resolve account');
  return { accountName: data.data.account_name, accountNumber: data.data.account_number };
};

/**
 * Create a transfer recipient (needed before sending money to a driver)
 */
const createTransferRecipient = async ({ accountName, accountNumber, bankCode }) => {
  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transferrecipient`,
    { type: 'nuban', name: accountName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' },
    { headers: paystackHeaders }
  );
  if (!data.status) throw new Error(data.message || 'Could not create recipient');
  return data.data.recipient_code;
};

/**
 * Initiate a transfer to a driver's bank account
 */
const initiateTransfer = async ({ recipientCode, amountNaira, reason }) => {
  const amountKobo = Math.round(amountNaira * 100);
  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transfer`,
    {
      source: 'balance',
      amount: amountKobo,
      recipient: recipientCode,
      reason: reason || 'Pickar driver withdrawal',
    },
    { headers: paystackHeaders }
  );
  if (!data.status) throw new Error(data.message || 'Transfer failed');
  return { transferCode: data.data.transfer_code, status: data.data.status };
};

/**
 * Get list of Nigerian banks from Paystack
 */
const getBanks = async () => {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/bank?country=nigeria&perPage=100`,
    { headers: paystackHeaders }
  );
  return data.data || [];
};

/**
 * Verify Paystack webhook signature
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
};

module.exports = {
  initializeTopup,
  verifyTransaction,
  resolveBankAccount,
  createTransferRecipient,
  initiateTransfer,
  getBanks,
  verifyWebhookSignature,
};