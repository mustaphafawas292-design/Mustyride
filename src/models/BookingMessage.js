const mongoose = require('mongoose');

/**
 * Simple chat between a customer and their assigned rider, scoped to one
 * booking. Separate from SupportTicket messages (which go to admin/support).
 */
const bookingMessageSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    senderType: { type: String, enum: ['customer', 'rider'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BookingMessage', bookingMessageSchema);
