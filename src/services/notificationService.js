const { Notification } = require('../models');
const { sendSms } = require('./smsService');

async function createNotification({ recipient, recipientModel, event, title, message, relatedBooking, channel = ['in_app'], phone = null }) {
  const notification = await Notification.create({
    recipient: recipient._id,
    recipientModel,
    recipientType: recipientModel === 'User' ? 'customer' : recipientModel === 'Rider' ? 'rider' : 'admin',
    event,
    title,
    message,
    relatedBooking: relatedBooking || null,
    channel,
  });

  if (channel.includes('sms') && phone) {
    await sendSms(phone, message);
  }

  return notification;
}

async function notifyCustomer(user, event, { title, message, relatedBooking, channel }) {
  return createNotification({
    recipient: user,
    recipientModel: 'User',
    event,
    title,
    message,
    relatedBooking,
    channel: channel || ['in_app', 'sms'],
    phone: user.phone,
  });
}

async function notifyRider(rider, event, { title, message, relatedBooking, channel }) {
  return createNotification({
    recipient: rider,
    recipientModel: 'Rider',
    event,
    title,
    message,
    relatedBooking,
    channel: channel || ['in_app', 'sms'],
    phone: rider.phone,
  });
}

module.exports = { createNotification, notifyCustomer, notifyRider };
