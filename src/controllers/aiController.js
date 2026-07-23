const asyncHandler = require('express-async-handler');
const { askAssistant } = require('../services/aiService');
const ApiError = require('../utils/ApiError');
const { success } = require('../utils/response');

// POST /api/ai/chat   body: { message, history? }
const chat = asyncHandler(async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) throw new ApiError(400, 'message is required.');

  const result = await askAssistant(message.trim(), Array.isArray(history) ? history : []);
  return success(res, 200, 'Reply generated.', result);
});

module.exports = { chat };
