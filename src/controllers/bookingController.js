const asyncHandler = require('express-async-handler');
const { Booking, MatchRequest, Rider, User } = require('../models');
const { calculateFare, getActiveFareConfig } = require('../services/fareService');
const { offerToNextRider, acceptOffer, declineOffer } = require('../services/matchingService');
const { notifyCustomer, notifyRider } = require('../services/notificationService');
const { checkRepeatedCancellations } = require('../services/fraudService');
const walletService = require('../services/walletService');
const { generateRef } = require('../utils/generateRef');
const { generateShortCode } = require('../utils/otp');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

function validateCoords(loc, label) {
  if (!loc?.address || !Array.isArray(loc?.coordinates) || loc.coordinates.length !== 2) {
    throw new ApiError(400, `${label} must include an address and [lng, lat] coordinates.`);
  }
}

// POST /api/bookings/estimate  - customer sees the price BEFORE confirming (module 2)
const estimateFare = asyncHandler(async (req, res) => {
  const { pickup, destination, serviceType, deliveryType, packageWeightKg } = req.body;
  validateCoords(pickup, 'Pickup');
  validateCoords(destination, 'Destination');

  const fare = await calculateFare({
    pickupCoords: pickup.coordinates,
    destinationCoords: destination.coordinates,
    serviceType,
    deliveryType,
    packageWeightKg,
  });

  return success(res, 200, 'Fare estimated.', { fare });
});

// POST /api/bookings  - creates the booking and kicks off rider matching
const createBooking = asyncHandler(async (req, res) => {
  const {
    pickup,
    destination,
    serviceType,
    deliveryType,
    paymentMethod,
    receiverName,
    receiverPhone,
    packageDescription,
    packageWeightKg,
    riderNotes,
    business,
  } = req.body;

  validateCoords(pickup, 'Pickup');
  validateCoords(destination, 'Destination');

  if (!receiverName || !receiverPhone || !packageDescription) {
    throw new ApiError(400, 'receiverName, receiverPhone and packageDescription are required.');
  }

  const fare = await calculateFare({
    pickupCoords: pickup.coordinates,
    destinationCoords: destination.coordinates,
    serviceType,
    deliveryType,
    packageWeightKg,
  });

  const booking = await Booking.create({
    trackingId: generateRef('OSR-'),
    customer: req.actor._id,
    business: business || null,
    serviceType,
    deliveryType,
    pickup: { address: pickup.address, location: { type: 'Point', coordinates: pickup.coordinates } },
    destination: { address: destination.address, location: { type: 'Point', coordinates: destination.coordinates } },
    receiverName,
    receiverPhone,
    packageDescription,
    packageWeightKg,
    riderNotes,
    fare,
    paymentMethod,
    deliveryConfirmationCode: generateShortCode(4),
  });

  // Every booking now goes straight to matching regardless of payment
  // method. Payment happens AFTER the rider accepts (see respondToOffer /
  // payWithWallet) and BEFORE the rider is allowed to head to pickup (see
  // the payment gate in updateTripStatus). Cash is the only exception -
  // it's still settled physically at delivery.
  booking.pushStatus('pending_match', 'Booking created, searching for a rider');
  await booking.save();

  await notifyCustomer(req.actor, 'booking_received', {
    title: 'Booking received',
    message: `Your booking ${booking.trackingId} was received. We're finding you a rider.`,
    relatedBooking: booking._id,
  });

  const offer = await offerToNextRider(booking);
  if (!offer) {
    booking.pushStatus('no_riders_available', 'No eligible riders nearby at booking time');
    await booking.save();
  }

  return success(res, 201, 'Booking created.', { booking });
});

// GET /api/bookings/offers/mine  (rider) - active job offers waiting on this rider's response
const listMyOffers = asyncHandler(async (req, res) => {
  const offers = await MatchRequest.find({
    rider: req.actor._id,
    status: 'offered',
    expiresAt: { $gt: new Date() },
  })
    .populate('booking')
    .sort({ offeredAt: -1 });

  return success(res, 200, 'Offers fetched.', { offers });
});

// POST /api/bookings/:id/confirm-receipt   body: { status: 'ok'|'issue', note? }
// Customer confirms the package arrived fine (releases the rider's held
// earnings) or reports a problem (money stays held, a support ticket opens).
const confirmReceipt = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!['ok', 'issue'].includes(status)) throw new ApiError(400, "status must be 'ok' or 'issue'.");

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (String(booking.customer) !== String(req.actor._id)) throw new ApiError(403, 'This is not your booking.');
  if (booking.status !== 'delivered') throw new ApiError(400, 'This booking has not been marked delivered yet.');
  if (booking.receiptConfirmation !== 'pending') throw new ApiError(400, 'You already responded to this delivery.');

  if (status === 'ok') {
    booking.receiptConfirmation = 'confirmed_ok';
    await booking.save();

    if (booking.rider) {
      const riderWallet = await walletService.getOrCreateWallet(await Rider.findById(booking.rider), 'rider');
      const released = await walletService.releasePendingEarnings(riderWallet, booking._id);
      if (released) {
        await notifyRider(await Rider.findById(booking.rider), 'payment_successful', {
          title: 'Funds released!',
          message: `The customer confirmed booking ${booking.trackingId} arrived fine. ₦${released.toLocaleString()} is now available to withdraw.`,
          relatedBooking: booking._id,
        });
      }
    }

    return success(res, 200, 'Thanks for confirming! The rider has been paid out.', { booking });
  }

  // status === 'issue': keep the money held, open a support ticket automatically
  booking.receiptConfirmation = 'reported_issue';
  await booking.save();

  const { SupportTicket } = require('../models');
  const ticket = await SupportTicket.create({
    reference: generateRef('OSR-CMP-'),
    raisedByType: 'customer',
    raisedBy: req.actor._id,
    raisedByModel: 'User',
    relatedBooking: booking._id,
    category: 'damaged_or_missing',
    subject: `Reported issue with booking ${booking.trackingId}`,
    messages: note ? [{ sender: 'customer', senderId: req.actor._id, text: note }] : [],
    refundRequested: true,
  });

  return success(res, 200, "We've held the payment and opened a support ticket - our team will review it.", { booking, ticket });
});

// POST /api/bookings/:id/messages   body: { text }
const sendMessage = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) throw new ApiError(400, 'Message text is required.');

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found.');

  const isCustomer = req.actorRole === 'customer';
  if (isCustomer && String(booking.customer) !== String(req.actor._id)) throw new ApiError(403, 'This is not your booking.');
  if (!isCustomer && String(booking.rider) !== String(req.actor._id)) throw new ApiError(403, 'You are not assigned to this booking.');

  const { BookingMessage } = require('../models');
  const message = await BookingMessage.create({
    booking: booking._id,
    senderType: isCustomer ? 'customer' : 'rider',
    senderId: req.actor._id,
    text: text.trim(),
  });

  // Notify whichever side didn't send this message, so they know a reply
  // is waiting even if they aren't currently looking at the chat window.
  const preview = text.trim().length > 60 ? text.trim().slice(0, 57) + '...' : text.trim();
  if (isCustomer) {
    const rider = await Rider.findById(booking.rider);
    if (rider) {
      await notifyRider(rider, 'new_message', {
        title: 'New message from customer',
        message: preview,
        relatedBooking: booking._id,
        channel: ['in_app'],
      });
    }
  } else {
    const customer = await User.findById(booking.customer);
    if (customer) {
      await notifyCustomer(customer, 'new_message', {
        title: 'New message from rider',
        message: preview,
        relatedBooking: booking._id,
        channel: ['in_app'],
      });
    }
  }

  return success(res, 201, 'Message sent.', { message });
});

// GET /api/bookings/:id/messages
const getMessages = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found.');

  const isCustomer = req.actorRole === 'customer';
  if (isCustomer && String(booking.customer) !== String(req.actor._id)) throw new ApiError(403, 'This is not your booking.');
  if (!isCustomer && String(booking.rider) !== String(req.actor._id)) throw new ApiError(403, 'You are not assigned to this booking.');

  const { BookingMessage } = require('../models');
  const messages = await BookingMessage.find({ booking: booking._id }).sort({ createdAt: 1 });

  return success(res, 200, 'Messages fetched.', { messages });
});

// GET /api/bookings/:id
const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('rider', 'fullName phone ratingAverage documents.passportPhotoUrl documents.plateNumber currentLocation');
  if (!booking) throw new ApiError(404, 'Booking not found.');
  return success(res, 200, 'Booking fetched.', { booking });
});

// GET /api/bookings  (customer's own delivery history - module 17)
// UPDATED: populate rider details so the customer actually sees the rider's
// name, phone, rating, and photo once one accepts - previously this returned
// only the raw rider ObjectId, so nothing displayed on the frontend.
const listMyBookings = asyncHandler(async (req, res) => {
  const filter = req.actorRole === 'rider' ? { rider: req.actor._id } : { customer: req.actor._id };
  const bookings = await Booking.find(filter)
    .populate('rider', 'fullName phone ratingAverage documents.passportPhotoUrl documents.plateNumber currentLocation')
    .sort({ createdAt: -1 })
    .limit(100);
  return success(res, 200, 'Bookings fetched.', { bookings });
});

// POST /api/bookings/:id/cancel
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found.');

  const cancellableStatuses = ['pending_match', 'rider_assigned', 'rider_arrived_pickup'];
  if (!cancellableStatuses.includes(booking.status)) {
    throw new ApiError(400, `Booking cannot be cancelled once it is ${booking.status}.`);
  }

  const cancelledBy = req.actorRole === 'rider' ? 'rider' : 'customer';
  booking.cancelledBy = cancelledBy;
  booking.cancellationReason = req.body.reason || null;
  booking.pushStatus(cancelledBy === 'rider' ? 'cancelled_by_rider' : 'cancelled_by_customer', req.body.reason);
  await booking.save();

  if (booking.rider) {
    const rider = await Rider.findById(booking.rider);
    if (rider) {
      rider.availability = 'online';
      if (cancelledBy === 'rider') rider.cancelledByRider += 1;
      await rider.save();
      await checkRepeatedCancellations(rider, 'rider', rider.cancelledByRider, rider.totalDeliveryRequests);
    }
  }

  return success(res, 200, 'Booking cancelled.', { booking });
});

// ----- Rider-side status progression -----

// POST /api/bookings/:id/respond   body: { matchRequestId, action: 'accept'|'decline' }
const respondToOffer = asyncHandler(async (req, res) => {
  const { matchRequestId, action } = req.body;
  const matchRequest = await MatchRequest.findById(matchRequestId);
  if (!matchRequest) throw new ApiError(404, 'Match request not found.');
  if (String(matchRequest.rider) !== String(req.actor._id)) throw new ApiError(403, 'This offer is not yours.');
  if (matchRequest.status === 'accepted') throw new ApiError(409, "You've already accepted this job.");
  if (matchRequest.status !== 'offered') throw new ApiError(410, 'This offer expired and was given to another rider.');

  const booking = await Booking.findById(matchRequest.booking);
  if (!booking) throw new ApiError(404, 'Booking not found.');

  if (action === 'accept') {
    await acceptOffer(matchRequest, booking, req.actor);

    const customer = await User.findById(booking.customer);

    // UPDATED: no auto-charge here anymore. Rider accepts, customer chats,
    // then pays via payWithWallet (wallet) or /api/payments/initiate (card/
    // bank transfer) BEFORE the rider is allowed to head to pickup - see the
    // payment gate in updateTripStatus. Cash needs no upfront payment.
    await notifyCustomer(customer, 'rider_accepted', {
      title: 'Rider found!',
      message: booking.paymentMethod === 'cash'
        ? `${req.actor.fullName} is on the way to your pickup point.`
        : `${req.actor.fullName} accepted your booking. Chat with them, then complete payment so they can start the trip.`,
      relatedBooking: booking._id,
    });

    return success(res, 200, 'Offer accepted.', { booking });
  }

  if (action === 'decline') {
    await declineOffer(matchRequest, 'declined');
    const nextOffer = await offerToNextRider(booking, [String(req.actor._id)]);
    if (!nextOffer) {
      booking.pushStatus('no_riders_available', 'All nearby riders declined or timed out');
      await booking.save();
    }
    return success(res, 200, 'Offer declined.');
  }

  throw new ApiError(400, "action must be 'accept' or 'decline'.");
});

// POST /api/bookings/:id/pay-wallet  (customer) - charges wallet after chatting with rider,
// before the rider is allowed to start heading to pickup.
const payWithWallet = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (String(booking.customer) !== String(req.actor._id)) throw new ApiError(403, 'This is not your booking.');
  if (booking.paymentMethod !== 'wallet') throw new ApiError(400, 'This booking is not set to pay by wallet.');
  if (booking.paymentStatus === 'paid') throw new ApiError(400, 'This booking has already been paid.');
  if (!booking.rider) throw new ApiError(400, 'No rider has accepted this booking yet.');

  const customerWallet = await walletService.getOrCreateWallet(req.actor, 'customer');
  if (customerWallet.availableBalance < booking.fare.total) {
    throw new ApiError(409, 'Insufficient wallet balance. Please fund your wallet.');
  }

  await walletService.debit(customerWallet, {
    type: 'trip_payment',
    amount: booking.fare.total,
    relatedBooking: booking._id,
    note: `Payment for booking ${booking.trackingId}`,
  });
  booking.paymentStatus = 'paid';
  await booking.save();

  const fareConfig = await getActiveFareConfig();
  const rider = await Rider.findById(booking.rider);
  const riderWallet = await walletService.getOrCreateWallet(rider, 'rider');
  const payout = await walletService.payRiderForTrip(riderWallet, {
    fareTotal: booking.fare.total,
    commissionRate: fareConfig.commissionRate,
    relatedBooking: booking._id,
  });

  await notifyRider(rider, 'payment_successful', {
    title: 'Payment received - you can start the trip',
    message: `₦${payout.netPaid.toLocaleString()} was added to your wallet for booking ${booking.trackingId}. You're clear to head to pickup.`,
    relatedBooking: booking._id,
  });

  return success(res, 200, 'Payment successful. The rider has been notified.', { booking });
});

// PATCH /api/bookings/:id/status   body: { status, confirmationCode? }  (rider progresses the trip)
// UPDATED: card/bank_transfer/wallet bookings can't progress past acceptance
// until paymentStatus is 'paid'. Cash is exempt - still settled physically
// at the delivered step.
const updateTripStatus = asyncHandler(async (req, res) => {
  const { status, confirmationCode } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (String(booking.rider) !== String(req.actor._id)) throw new ApiError(403, 'You are not assigned to this booking.');

  const allowed = ['rider_arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivered'];
  if (!allowed.includes(status)) throw new ApiError(400, 'Invalid status transition.');

  if (booking.paymentMethod !== 'cash' && booking.paymentStatus !== 'paid') {
    throw new ApiError(402, 'Waiting on customer payment before you can proceed. Chat with them to confirm.');
  }

  if (status === 'delivered') {
    if (!confirmationCode) throw new ApiError(400, 'Ask the customer for their delivery code to confirm this.');
    if (confirmationCode !== booking.deliveryConfirmationCode) {
      throw new ApiError(400, 'That code is incorrect. Double-check with the customer.');
    }
  }

  booking.pushStatus(status);
  if (status === 'delivered') {
    booking.deliveredAt = new Date();
    const rider = await Rider.findById(req.actor._id);
    rider.availability = 'online';
    rider.completedDeliveries += 1;
    await rider.save();

    // Cash bookings haven't been "paid" yet in the system - the rider just
    // physically collected it, so this is the moment to mark it paid and
    // run the same instant 15% commission split the wallet/card flows get.
    if (booking.paymentMethod === 'cash' && booking.paymentStatus !== 'paid') {
      booking.paymentStatus = 'paid';
      const fareConfig = await getActiveFareConfig();
      const riderWallet = await walletService.getOrCreateWallet(rider, 'rider');
      const payout = await walletService.payRiderForTrip(riderWallet, {
        fareTotal: booking.fare.total,
        commissionRate: fareConfig.commissionRate,
        relatedBooking: booking._id,
      });
      await notifyRider(rider, 'payment_successful', {
        title: 'Cash trip settled',
        message: `₦${payout.netPaid.toLocaleString()} was added to your wallet (₦${payout.commissionAmount.toLocaleString()} platform commission already deducted).`,
        relatedBooking: booking._id,
      });
    }
  }
  await booking.save();

  const eventMap = {
    rider_arrived_pickup: 'rider_arrived',
    picked_up: 'package_picked_up',
    delivered: 'package_delivered',
  };
  if (eventMap[status]) {
    const customer = await require('../models').User.findById(booking.customer);
    await notifyCustomer(customer, eventMap[status], {
      title: 'Delivery update',
      message: `Your booking ${booking.trackingId} status: ${status.replace(/_/g, ' ')}.`,
      relatedBooking: booking._id,
    });
  }

  return success(res, 200, 'Status updated.', { booking });
});

module.exports = {
  estimateFare,
  createBooking,
  getBooking,
  listMyBookings,
  listMyOffers,
  cancelBooking,
  respondToOffer,
  payWithWallet,
  updateTripStatus,
  confirmReceipt,
  sendMessage,
  getMessages,
};
