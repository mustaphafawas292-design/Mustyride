const asyncHandler = require('express-async-handler');
const { Wallet, Transaction } = require('../models');
const walletService = require('../services/walletService');
const { initiateTransfer } = require('../services/flutterwaveService');
const { generateRef } = require('../utils/generateRef');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// GET /api/wallet/me
const getMyWallet = asyncHandler(async (req, res) => {
  const ownerType = req.actorRole === 'rider' ? 'rider' : 'customer';
  const wallet = await walletService.getOrCreateWallet(req.actor, ownerType);
  return success(res, 200, 'Wallet fetched.', { wallet });
});

// GET /api/wallet/me/transactions
const listMyTransactions = asyncHandler(async (req, res) => {
  const ownerType = req.actorRole === 'rider' ? 'rider' : 'customer';
  const wallet = await walletService.getOrCreateWallet(req.actor, ownerType);
  const transactions = await Transaction.find({ wallet: wallet._id }).sort({ createdAt: -1 }).limit(200);
  return success(res, 200, 'Transactions fetched.', { transactions });
});

// GET /api/wallet/me/summary  (daily/weekly earnings - module 6)
const getEarningsSummary = asyncHandler(async (req, res) => {
  if (req.actorRole !== 'rider') throw new ApiError(403, 'Only riders have earnings summaries.');

  const wallet = await walletService.getOrCreateWallet(req.actor, 'rider');
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const [dailyAgg, weeklyAgg] = await Promise.all([
    Transaction.aggregate([
      { $match: { wallet: wallet._id, type: 'delivery_earning', createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { wallet: wallet._id, type: 'delivery_earning', createdAt: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return success(res, 200, 'Earnings summary fetched.', {
    dailyEarnings: dailyAgg[0]?.total || 0,
    weeklyEarnings: weeklyAgg[0]?.total || 0,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    totalEarnings: wallet.totalEarnings,
    totalBonuses: wallet.totalBonuses,
  });
});

// POST /api/wallet/customer/withdraw   body: { amount, bankCode, accountNumber }
// Lets a customer pull money back out of their wallet - e.g. if they topped
// up more than they needed, or just want it back "in case of anything".
const requestCustomerWithdrawal = asyncHandler(async (req, res) => {
  if (req.actorRole !== 'customer') throw new ApiError(403, 'Only customers can use this endpoint.');
  const { amount, bankCode, accountNumber } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'A valid amount is required.');

  const wallet = await walletService.getOrCreateWallet(req.actor, 'customer');
  if (wallet.availableBalance < amount) throw new ApiError(400, 'Insufficient wallet balance.');

  const reference = generateRef('WD-');

  await walletService.debit(wallet, { type: 'refund', amount, note: `Customer withdrawal ${reference}` });

  try {
    const transferResult = await initiateTransfer({
      reference,
      bankCode,
      accountNumber,
      amount,
      narration: 'MustyRide wallet withdrawal',
    });
    return success(res, 200, 'Withdrawal initiated.', { transferResult });
  } catch (err) {
    await walletService.credit(wallet, { type: 'refund', amount, note: `Reversal of failed withdrawal ${reference}` });
    throw new ApiError(502, 'Withdrawal could not be initiated. Your balance has been restored.');
  }
});

// POST /api/wallet/rider/withdraw   body: { amount, bankCode, accountNumber }
const requestWithdrawal = asyncHandler(async (req, res) => {
  if (req.actorRole !== 'rider') throw new ApiError(403, 'Only riders can withdraw.');
  const { amount, bankCode, accountNumber } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'A valid amount is required.');

  const wallet = await walletService.getOrCreateWallet(req.actor, 'rider');
  if (wallet.availableBalance < amount) throw new ApiError(400, 'Insufficient balance.');

  const reference = generateRef('WD-');

  // Debit first so the balance can't be double-spent while the transfer is pending.
  await walletService.debit(wallet, { type: 'withdrawal', amount, note: `Withdrawal ${reference}` });

  try {
    const transferResult = await initiateTransfer({
      reference,
      bankCode,
      accountNumber,
      amount,
      narration: 'MustyRide rider payout',
    });
    return success(res, 200, 'Withdrawal initiated.', { transferResult });
  } catch (err) {
    // Refund the wallet if the transfer call itself failed outright.
    await walletService.credit(wallet, { type: 'withdrawal', amount, note: `Reversal of failed withdrawal ${reference}` });
    throw new ApiError(502, 'Withdrawal could not be initiated. Your balance has been restored.');
  }
});

// POST /api/wallet/customer/topup/confirm  - called after Flutterwave payment succeeds (see paymentController)
// Exposed here only for completeness; the actual credit happens in paymentController's webhook handler.
const getWallet = getMyWallet;

module.exports = { getMyWallet, listMyTransactions, getEarningsSummary, requestWithdrawal, requestCustomerWithdrawal, getWallet };
