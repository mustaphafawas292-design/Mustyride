const asyncHandler = require('express-async-handler');
const { BusinessAccount, User, Booking } = require('../models');
const { generateToken } = require('../utils/token');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/business  - customer upgrades their account into a business owner
const createBusinessAccount = asyncHandler(async (req, res) => {
  const { businessName, businessType, contactPhone, contactEmail, address } = req.body;
  if (!businessName || !contactPhone) throw new ApiError(400, 'businessName and contactPhone are required.');

  const business = await BusinessAccount.create({
    businessName,
    businessType,
    owner: req.actor._id,
    contactPhone,
    contactEmail,
    address,
    staff: [req.actor._id],
  });

  req.actor.accountType = 'business_owner';
  req.actor.business = business._id;
  req.actor.businessRole = 'owner';
  await req.actor.save();

  return success(res, 201, 'Business account created.', { business });
});

// POST /api/business/staff   body: { fullName, phone, password, businessRole }
// Adds a new staff login under the same business account (module 19).
const addStaffMember = asyncHandler(async (req, res) => {
  const business = await BusinessAccount.findById(req.actor.business);
  if (!business) throw new ApiError(404, 'Business account not found.');
  if (String(business.owner) !== String(req.actor._id)) throw new ApiError(403, 'Only the business owner can add staff.');

  const { fullName, phone, password, businessRole } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'A user with this phone already exists.');

  const staff = await User.create({
    fullName,
    phone,
    password,
    phoneVerified: true, // added directly by a trusted business owner
    accountType: 'business_staff',
    business: business._id,
    businessRole: businessRole || 'staff',
  });

  business.staff.push(staff._id);
  await business.save();

  const token = generateToken({ id: staff._id, role: 'customer' });
  return success(res, 201, 'Staff member added.', { staff, token });
});

// GET /api/business/deliveries  - all deliveries booked under this business
const listBusinessDeliveries = asyncHandler(async (req, res) => {
  if (!req.actor.business) throw new ApiError(400, 'You are not part of a business account.');
  const bookings = await Booking.find({ business: req.actor.business }).sort({ createdAt: -1 }).limit(300);
  return success(res, 200, 'Business deliveries fetched.', { bookings });
});

// GET /api/business/spending  - spend summary for invoicing (module 19)
const getSpendingSummary = asyncHandler(async (req, res) => {
  const business = await BusinessAccount.findById(req.actor.business);
  if (!business) throw new ApiError(404, 'Business account not found.');

  const bookings = await Booking.find({ business: business._id, paymentStatus: 'paid' });
  const totalSpend = bookings.reduce((sum, b) => sum + b.fare.total, 0);

  business.totalSpend = totalSpend;
  business.totalDeliveries = bookings.length;
  await business.save();

  return success(res, 200, 'Spending summary fetched.', {
    totalSpend,
    totalDeliveries: bookings.length,
    billingCycle: business.billingCycle,
  });
});

// GET /api/business/invoice  - simple downloadable-shape invoice data
// (Frontend/PDF generation turns this into an actual PDF; this just returns the line items.)
const getInvoiceData = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = { business: req.actor.business, paymentStatus: 'paid' };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const bookings = await Booking.find(filter).sort({ createdAt: 1 });
  const lineItems = bookings.map((b) => ({
    trackingId: b.trackingId,
    date: b.createdAt,
    serviceType: b.serviceType,
    amount: b.fare.total,
  }));
  const total = lineItems.reduce((sum, i) => sum + i.amount, 0);

  return success(res, 200, 'Invoice data fetched.', { lineItems, total, count: lineItems.length });
});

module.exports = {
  createBusinessAccount,
  addStaffMember,
  listBusinessDeliveries,
  getSpendingSummary,
  getInvoiceData,
};
