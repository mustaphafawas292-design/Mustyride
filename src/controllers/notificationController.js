const asyncHandler = require('express-async-handler');
const { Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// GET /api/notifications
const listMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ recipient: req.actor._id })
    .sort({ createdAt: -1 })
    .limit(100);
  const unreadCount = await Notification.countDocuments({ recipient: req.actor._id, read: false });
  return success(res, 200, 'Notifications fetched.', { notifications, unreadCount });
});

// PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.actor._id });
  if (!notification) throw new ApiError(404, 'Notification not found.');
  notification.read = true;
  await notification.save();
  return success(res, 200, 'Marked as read.', { notification });
});

// PATCH /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.actor._id, read: false }, { read: true });
  return success(res, 200, 'All notifications marked as read.');
});

module.exports = { listMyNotifications, markAsRead, markAllAsRead };
