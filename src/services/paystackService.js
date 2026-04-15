const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const paystackAPI = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json',
  },
});


/**
 * Initialize a Paystack transaction
 * Returns authorization_url to redirect user to payment page
 */
const initializeTransaction = async ({ email, amount, reference, metadata }) => {
  const response = await paystackAPI.post('/transaction/initialize', {
    email,
    amount: amount * 100, // Paystack uses kobo (multiply by 100)
    reference,
    metadata,
    callback_url: process.env.PAYSTACK_CALLBACK_URL,
  });

  return response.data.data; // { authorization_url, access_code, reference }
};


/**
 * Verify a Paystack transaction by reference
 */
const verifyTransaction = async (reference) => {
  const response = await paystackAPI.get(`/transaction/verify/${reference}`);
  return response.data.data; // { status, amount, reference, customer, ... }
};

module.exports = { initializeTransaction, verifyTransaction };