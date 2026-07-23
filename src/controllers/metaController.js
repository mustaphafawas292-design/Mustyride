const asyncHandler = require('express-async-handler');
const { getActiveFareConfig } = require('../services/fareService');
const { success } = require('../utils/response');

// GET /api/meta/commission  - public, so the frontend can always show the
// real current rate rather than a hardcoded number that could drift out of
// sync with what admin has actually configured.
const getCommissionNotice = asyncHandler(async (req, res) => {
  const config = await getActiveFareConfig();
  const percent = Math.round(config.commissionRate * 100);
  return success(res, 200, 'Commission notice fetched.', {
    commissionRate: config.commissionRate,
    commissionPercent: percent,
    message: `MustyRide takes a ${percent}% service commission on every completed delivery or ride. It comes out of the rider's fare automatically - riders keep the rest, paid instantly to their wallet.`,
  });
});

module.exports = { getCommissionNotice };
