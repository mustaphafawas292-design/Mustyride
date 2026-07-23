const { Wallet, Transaction } = require('../models');
const { generateRef } = require('../utils/generateRef');
const ApiError = require('../utils/ApiError');

async function getOrCreateWallet(owner, ownerType) {
  const ownerModel = ownerType === 'rider' ? 'Rider' : 'User';
  let wallet = await Wallet.findOne({ owner: owner._id, ownerType });
  if (!wallet) {
    wallet = await Wallet.create({ owner: owner._id, ownerType, ownerModel });
    owner.wallet = wallet._id;
    await owner.save();
  }
  return wallet;
}

/** Credits a wallet and writes the matching ledger entry. Rolls up totals per type. */
async function credit(wallet, { type, amount, relatedBooking = null, relatedPayment = null, note = null }) {
  if (amount <= 0) throw new ApiError(400, 'Credit amount must be positive.');

  wallet.availableBalance += amount;
  if (type === 'delivery_earning') wallet.totalEarnings += amount;
  if (type === 'bonus') wallet.totalBonuses += amount;
  if (type === 'topup') wallet.totalToppedUp += amount;
  if (type === 'refund') wallet.totalRefunded += amount;
  if (type === 'promo_credit') wallet.totalPromoCredits += amount;
  await wallet.save();

  return Transaction.create({
    wallet: wallet._id,
    type,
    amount,
    direction: 'credit',
    balanceAfter: wallet.availableBalance,
    relatedBooking,
    relatedPayment,
    note,
    reference: generateRef('TXN-'),
  });
}

/** Debits a wallet, throwing if there isn't enough available balance. */
async function debit(wallet, { type, amount, relatedBooking = null, relatedPayment = null, note = null }) {
  if (amount <= 0) throw new ApiError(400, 'Debit amount must be positive.');
  if (wallet.availableBalance < amount) throw new ApiError(400, 'Insufficient wallet balance.');

  wallet.availableBalance -= amount;
  if (type === 'commission_deduction') wallet.totalCommissionPaid += amount;
  if (type === 'withdrawal') wallet.totalWithdrawn += amount;
  await wallet.save();

  return Transaction.create({
    wallet: wallet._id,
    type,
    amount,
    direction: 'debit',
    balanceAfter: wallet.availableBalance,
    relatedBooking,
    relatedPayment,
    note,
    reference: generateRef('TXN-'),
  });
}

/**
 * Pays a rider for a trip into ESCROW (pendingBalance, not withdrawable yet)
 * and takes the platform's commission at the same time. The net amount only
 * becomes withdrawable once the customer confirms the package arrived intact
 * (see releasePendingEarnings) - this is the anti-tampering/anti-scam safety
 * net: a rider can't run off with a bad delivery's money.
 */
async function payRiderForTrip(riderWallet, { fareTotal, commissionRate, relatedBooking }) {
  const commissionAmount = Math.round(fareTotal * commissionRate);
  const netPaid = fareTotal - commissionAmount;

  riderWallet.pendingBalance += netPaid;
  riderWallet.totalEarnings += fareTotal;
  riderWallet.totalCommissionPaid += commissionAmount;
  await riderWallet.save();

  await Transaction.create({
    wallet: riderWallet._id,
    type: 'delivery_earning',
    amount: netPaid,
    direction: 'credit',
    balanceAfter: riderWallet.pendingBalance, // reflects pending, not available, while held
    relatedBooking,
    status: 'pending', // flips to 'completed' when releasePendingEarnings runs
    note: `Held pending customer confirmation (${Math.round(commissionRate * 100)}% commission already deducted)`,
    reference: generateRef('TXN-'),
  });

  return { fareTotal, commissionAmount, netPaid };
}

/**
 * Moves a rider's held earnings for a specific booking from pendingBalance
 * into availableBalance (withdrawable), once the customer confirms the
 * package was fine. Returns the released amount, or null if there was
 * nothing pending for that booking (already released, or never held).
 */
async function releasePendingEarnings(riderWallet, relatedBooking) {
  const heldTxn = await Transaction.findOne({
    wallet: riderWallet._id,
    relatedBooking,
    type: 'delivery_earning',
    status: 'pending',
  });
  if (!heldTxn) return null;

  riderWallet.pendingBalance -= heldTxn.amount;
  riderWallet.availableBalance += heldTxn.amount;
  await riderWallet.save();

  heldTxn.status = 'completed';
  heldTxn.note = 'Released - customer confirmed the package arrived in good condition.';
  await heldTxn.save();

  return heldTxn.amount;
}

module.exports = { getOrCreateWallet, credit, debit, payRiderForTrip, releasePendingEarnings };
