const asyncHandler = require('express-async-handler');
const { SupportTicket } = require('../models');
const { generateRef } = require('../utils/generateRef');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/support/tickets
const createTicket = asyncHandler(async (req, res) => {
  const { category, subject, message, relatedBooking, refundRequested, refundAmount } = req.body;
  if (!category || !subject) throw new ApiError(400, 'category and subject are required.');

  const isRider = req.actorRole === 'rider';

  const ticket = await SupportTicket.create({
    reference: generateRef('OSR-CMP-'),
    raisedByType: isRider ? 'rider' : 'customer',
    raisedBy: req.actor._id,
    raisedByModel: isRider ? 'Rider' : 'User',
    relatedBooking: relatedBooking || null,
    category,
    subject,
    messages: message
      ? [{ sender: isRider ? 'rider' : 'customer', senderId: req.actor._id, text: message }]
      : [],
    refundRequested: !!refundRequested,
    refundAmount: refundAmount || null,
  });

  return success(res, 201, 'Complaint received. Our team will respond within 24 hours.', { ticket });
});

// POST /api/support/tickets/:id/attachments  (multipart, uses upload middleware)
const addAttachment = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new ApiError(404, 'Ticket not found.');

  const files = req.files || [];
  files.forEach((f) => ticket.attachments.push(`/uploads/${f.filename}`));
  await ticket.save();

  return success(res, 200, 'Attachment(s) uploaded.', { ticket });
});

// POST /api/support/tickets/:id/messages  (chat - module 12)
const addMessage = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new ApiError(404, 'Ticket not found.');

  const senderType = req.actorRole === 'admin' ? 'admin' : req.actorRole === 'rider' ? 'rider' : 'customer';
  ticket.messages.push({ sender: senderType, senderId: req.actor._id, text });
  if (ticket.status === 'open') ticket.status = 'in_progress';
  await ticket.save();

  return success(res, 201, 'Message sent.', { ticket });
});

// GET /api/support/tickets  (my tickets, or all for admin)
const listTickets = asyncHandler(async (req, res) => {
  const filter = req.actorRole === 'admin' ? {} : { raisedBy: req.actor._id };
  const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(200);
  return success(res, 200, 'Tickets fetched.', { tickets });
});

// GET /api/support/tickets/:id
const getTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new ApiError(404, 'Ticket not found.');
  return success(res, 200, 'Ticket fetched.', { ticket });
});

// PATCH /api/support/tickets/:id/resolve  (admin only)
const resolveTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new ApiError(404, 'Ticket not found.');

  ticket.status = 'resolved';
  ticket.assignedAdmin = req.actor._id;
  ticket.resolvedAt = new Date();
  await ticket.save();

  return success(res, 200, 'Ticket marked resolved.', { ticket });
});

module.exports = { createTicket, addAttachment, addMessage, listTickets, getTicket, resolveTicket };
