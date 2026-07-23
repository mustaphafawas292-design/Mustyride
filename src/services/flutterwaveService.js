const axios = require('axios');

const flw = axios.create({
  baseURL: 'https://api.flutterwave.com/v3',
  headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
});

/** Initiates a card/bank-transfer payment and returns the checkout link to redirect the customer to. */
async function initiatePayment({ txRef, amount, customerEmail, customerPhone, customerName, redirectUrl }) {
  const res = await flw.post('/payments', {
    tx_ref: txRef,
    amount,
    currency: 'NGN',
    redirect_url: redirectUrl,
    customer: { email: customerEmail, phonenumber: customerPhone, name: customerName },
    customizations: { title: 'MustyRide', description: 'Payment for delivery/ride booking' },
  });
  return res.data; // res.data.data.link is the checkout URL
}

/** Verifies a transaction by Flutterwave's transaction ID (call this from your webhook/redirect handler). */
async function verifyTransaction(flwTransactionId) {
  const res = await flw.get(`/transactions/${flwTransactionId}/verify`);
  return res.data; // res.data.data.status should be 'successful'
}

/** Pays a rider's withdrawal request out to their bank account. */
async function initiateTransfer({ reference, bankCode, accountNumber, amount, narration }) {
  const res = await flw.post('/transfers', {
    reference,
    account_bank: bankCode,
    account_number: accountNumber,
    amount,
    currency: 'NGN',
    narration,
  });
  return res.data;
}

module.exports = { initiatePayment, verifyTransaction, initiateTransfer };
