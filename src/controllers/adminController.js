const asyncHandler = require('express-async-handler');
const { Booking, Rider, Payment, SupportTicket, FraudFlag, FareConfig } = require('../models');
const { notifyRider } = require('../services/notificationService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// GET /api/admin/dashboard  - the numbers admin cares about (module 9)
const getDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalOrders,
    activeRiders,
    onlineRiders,
    cancelledTrips,
    suspendedRiders,
    openComplaints,
    revenueAgg,
    dailyRevenueAgg,
  ] = await Promise.all([
    Booking.countDocuments(),
    Rider.countDocuments({ verificationStatus: 'approved', status: 'active' }),
    Rider.countDocuments({ availability: 'online' }),
    Booking.countDocuments({ status: { $in: ['cancelled_by_customer', 'cancelled_by_rider'] } }),
    Rider.countDocuments({ isSuspended: true }),
    SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    Payment.aggregate([{ $match: { status: 'successful' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([
      { $match: { status: 'successful', createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return success(res, 200, 'Dashboard stats fetched.', {
    totalOrders,
    activeRiders,
    onlineRiders,
    cancelledTrips,
    suspendedRiders,
    openComplaints,
    totalRevenue: revenueAgg[0]?.total || 0,
    dailyRevenue: dailyRevenueAgg[0]?.total || 0,
  });
});

// GET /api/admin/riders/pending  - riders awaiting document approval (module 1)
const listPendingRiders = asyncHandler(async (req, res) => {
  const riders = await Rider.find({ verificationStatus: 'pending' }).sort({ createdAt: 1 });
  return success(res, 200, 'Pending riders fetched.', { riders });
});

// PATCH /api/admin/riders/:id/approve
const approveRider = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.id);
  if (!rider) throw new ApiError(404, 'Rider not found.');

  rider.verificationStatus = 'approved';
  rider.approvedBy = req.actor._id;
  rider.approvedAt = new Date();
  rider.verificationNote = req.body.note || null;
  await rider.save();

  await notifyRider(rider, 'rider_approved', {
    title: 'You are approved!',
    message: 'Your documents have been verified. You can now go online and start receiving jobs.',
  });

  return success(res, 200, 'Rider approved.', { rider });
});

// PATCH /api/admin/riders/:id/reject
const rejectRider = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.id);
  if (!rider) throw new ApiError(404, 'Rider not found.');

  rider.verificationStatus = 'rejected';
  rider.verificationNote = req.body.note || 'Documents did not meet requirements.';
  await rider.save();

  await notifyRider(rider, 'rider_rejected', {
    title: 'Registration not approved',
    message: rider.verificationNote,
  });

  return success(res, 200, 'Rider rejected.', { rider });
});

// PATCH /api/admin/riders/:id/suspend
const suspendRider = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.id);
  if (!rider) throw new ApiError(404, 'Rider not found.');

  rider.isSuspended = true;
  rider.suspensionReason = req.body.reason || null;
  rider.availability = 'offline';
  await rider.save();

  return success(res, 200, 'Rider suspended.', { rider });
});

// PATCH /api/admin/riders/:id/unsuspend
const unsuspendRider = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.params.id);
  if (!rider) throw new ApiError(404, 'Rider not found.');
  rider.isSuspended = false;
  rider.suspensionReason = null;
  await rider.save();
  return success(res, 200, 'Rider unsuspended.', { rider });
});

// GET /api/admin/fraud-flags
const listFraudFlags = asyncHandler(async (req, res) => {
  const flags = await FraudFlag.find({ status: { $ne: 'dismissed' } }).sort({ createdAt: -1 }).limit(200);
  return success(res, 200, 'Fraud flags fetched.', { flags });
});

// PATCH /api/admin/fraud-flags/:id  body: { status, reviewNote }
const reviewFraudFlag = asyncHandler(async (req, res) => {
  const flag = await FraudFlag.findById(req.params.id);
  if (!flag) throw new ApiError(404, 'Flag not found.');

  flag.status = req.body.status || flag.status;
  flag.reviewNote = req.body.reviewNote || flag.reviewNote;
  flag.reviewedBy = req.actor._id;
  await flag.save();

  return success(res, 200, 'Fraud flag updated.', { flag });
});

// GET /api/admin/fare-config
const getFareConfig = asyncHandler(async (req, res) => {
  let config = await FareConfig.findOne({ isActive: true });
  if (!config) config = await FareConfig.create({});
  return success(res, 200, 'Fare config fetched.', { config });
});

// PATCH /api/admin/fare-config  - central place to update pricing (module 18)
const updateFareConfig = asyncHandler(async (req, res) => {
  let config = await FareConfig.findOne({ isActive: true });
  if (!config) config = new FareConfig();

  Object.assign(config, req.body, { updatedByAdmin: req.actor._id });
  await config.save();

  return success(res, 200, 'Fare config updated.', { config });
});

module.exports = {
  getDashboard,
  listPendingRiders,
  approveRider,
  rejectRider,
  suspendRider,
  unsuspendRider,
  listFraudFlags,
  reviewFraudFlag,
  getFareConfig,
  updateFareConfig,
};
