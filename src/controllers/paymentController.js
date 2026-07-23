const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const { Payment, Booking } = require('../models');
const { initiatePayment, verifyTransaction } = require('../services/flutterwaveService');
const walletService = require('../services/walletService');
const { notifyCustomer } = require('../services/notificationService');
const { generateRef } = require('../utils/generateRef');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/payments/initiate   body: { purpose, amount, bookingId? }
const initiate = asyncHandler(async (req, res) => {
  const { purpose, amount, bookingId } = req.body;
  if (!['trip_payment', 'wallet_topup'].includes(purpose)) throw new ApiError(400, 'Invalid payment purpose.');
  if (!amount || amount <= 0) throw new ApiError(400, 'A valid amount is required.');

  const txRef = generateRef('FLW-');
  const payment = await Payment.create({
    booking: bookingId || null,
    customer: req.actor._id,
    purpose,
    method: 'card',
    provider: 'flutterwave',
    amount,
    flwTxRef: txRef,
  });

  const flwResponse = await initiatePayment({
    txRef,
    amount,
    customerEmail: req.actor.email || `${req.actor.phone}@mustyride.ng`,
    customerPhone: req.actor.phone,
    customerName: req.actor.fullName,
    redirectUrl: `${process.env.CLIENT_URL.replace(/\/+$/, '')}/payment-callback.html`,
  });

  return success(res, 200, 'Payment initiated.', { checkoutUrl: flwResponse.data?.link, paymentId: payment._id });
});

// GET /api/payments/verify/:txRef  - frontend calls this after Flutterwave redirects back
const verify = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ flwTxRef: req.params.txRef });
  if (!payment) throw new ApiError(404, 'Payment record not found.');

  const flwResult = await verifyTransaction(req.query.transaction_id);
  const flwData = flwResult.data;

  payment.flwTransactionId = String(flwData.id);
  payment.flwStatus = flwData.status;
  payment.status = flwData.status === 'successful' && flwData.amount >= payment.amount ? 'successful' : 'failed';
  await payment.save();

  if (payment.status === 'successful') {
    await handleSuccessfulPayment(payment);
  }

  return success(res, 200, 'Payment verified.', { payment });
});

// POST /api/payments/webhook  - Flutterwave server-to-server notification (more reliable than redirect)
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!signature || signature !== process.env.FLW_WEBHOOK_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
  }

  const event = req.body;
  const txRef = event.data?.tx_ref;
  const payment = await Payment.findOne({ flwTxRef: txRef });
  if (!payment) return res.status(200).json({ success: true }); // ack anyway, nothing to do

  payment.rawWebhookPayload = event;
  payment.flwTransactionId = String(event.data?.id);
  payment.flwStatus = event.data?.status;

  if (event.data?.status === 'successful' && payment.status !== 'successful') {
    payment.status = 'successful';
    await payment.save();
    await handleSuccessfulPayment(payment);
  } else {
    await payment.save();
  }

  return res.status(200).json({ success: true });
});

async function handleSuccessfulPayment(payment) {
  if (payment.purpose === 'wallet_topup') {
    const wallet = await require('../models').Wallet.findOne({ owner: payment.customer, ownerType: 'customer' });
    if (wallet) await walletService.credit(wallet, { type: 'topup', amount: payment.amount, relatedPayment: payment._id });
  }

  if (payment.purpose === 'trip_payment' && payment.booking) {
    const booking = await Booking.findById(payment.booking);
    if (booking) {
      booking.paymentStatus = 'paid';
      booking.payment = payment._id;

      // This booking was waiting on payment before we'd dispatch a rider
      // (card/bank transfer bookings) - now that it's confirmed paid, start
      // matching for real.
      if (booking.status === 'awaiting_payment') {
        booking.pushStatus('pending_match', 'Payment confirmed, searching for a rider');
        await booking.save();

        const { offerToNextRider } = require('../services/matchingService');
        const offer = await offerToNextRider(booking);
        if (!offer) {
          booking.pushStatus('no_riders_available', 'No eligible riders nearby at booking time');
          await booking.save();
        }
      } else {
        await booking.save();
      }
    }
  }

  const customer = await require('../models').User.findById(payment.customer);
  if (customer) {
    await notifyCustomer(customer, 'payment_successful', {
      title: 'Payment successful',
      message: `Your payment of ₦${payment.amount.toLocaleString()} was successful.`,
      relatedBooking: payment.booking,
    });
  }
}

// POST /api/payments/:id/refund  - admin or support-triggered refund
const refund = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found.');
  if (payment.status !== 'successful') throw new ApiError(400, 'Only successful payments can be refunded.');

  payment.status = 'refunded';
  payment.refundStatus = 'processed';
  payment.refundReason = req.body.reason || null;
  await payment.save();

  const wallet = await require('../models').Wallet.findOne({ owner: payment.customer, ownerType: 'customer' });
  if (wallet) {
    await walletService.credit(wallet, {
      type: 'refund',
      amount: payment.amount,
      relatedPayment: payment._id,
      note: req.body.reason,
    });
  }

  return success(res, 200, 'Refund processed to customer wallet.', { payment });
});

module.exports = { initiate, verify, webhook, refund };
