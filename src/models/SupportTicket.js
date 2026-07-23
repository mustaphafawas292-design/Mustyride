const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ['customer', 'rider', 'admin'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, default: null },
    imageUrl: { type: String, default: null },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },

    raisedByType: { type: String, enum: ['customer', 'rider'], required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'raisedByModel' },
    raisedByModel: { type: String, required: true, enum: ['User', 'Rider'] },

    relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    category: {
      type: String,
      enum: ['late_delivery', 'damaged_or_missing', 'rider_conduct', 'payment_issue', 'refund_request', 'other'],
      required: true,
    },

    subject: { type: String, required: true },
    messages: [messageSchema],
    attachments: [{ type: String }], // uploaded picture URLs

    refundRequested: { type: Boolean, default: false },
    refundAmount: { type: Number, default: null },

    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
