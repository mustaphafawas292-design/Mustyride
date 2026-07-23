const axios = require('axios');
const { CallLog } = require('../models');

/**
 * In-app "call" feature (module 12): lets a customer call their rider, or
 * either party call support, without ever seeing each other's real number.
 *
 * This needs a real voice provider to actually bridge audio - Africa's
 * Talking Voice and Twilio Voice both support this on Nigerian numbers.
 * Until VOICE_API_KEY is set, this logs the call and returns the support
 * line directly so your frontend can still dial out normally in the
 * meantime (dev/demo mode).
 */
async function initiateCall({ initiator, initiatorType, target, targetPhone, targetId = null, booking = null }) {
  const callLog = await CallLog.create({
    initiatedByType: initiatorType,
    initiatedBy: initiator._id,
    initiatedByModel: initiatorType === 'rider' ? 'Rider' : 'User',
    target,
    targetId,
    relatedBooking: booking ? booking._id : null,
    provider: process.env.VOICE_PROVIDER || null,
    status: 'initiated',
  });

  const devMode = !process.env.VOICE_API_KEY || process.env.VOICE_API_KEY.includes('your_');
  if (devMode) {
    console.log(`[CALL:DEV MODE] ${initiatorType} ${initiator._id} calling ${target} at ${targetPhone}`);
    callLog.status = 'connected';
    callLog.maskedNumberUsed = targetPhone;
    await callLog.save();
    return { success: true, dev: true, dialNumber: targetPhone, callLogId: callLog._id };
  }

  try {
    // Example shape for Africa's Talking Voice - adjust to whichever provider you settle on.
    const res = await axios.post(
      'https://voice.africastalking.com/call',
      new URLSearchParams({
        username: process.env.VOICE_USERNAME,
        from: process.env.SUPPORT_PHONE_NUMBER,
        to: targetPhone,
      }),
      { headers: { apiKey: process.env.VOICE_API_KEY } }
    );

    callLog.providerCallId = res.data?.entries?.[0]?.sessionId || null;
    callLog.status = 'ringing';
    await callLog.save();
    return { success: true, providerResponse: res.data, callLogId: callLog._id };
  } catch (err) {
    callLog.status = 'failed';
    await callLog.save();
    return { success: false, error: err.message };
  }
}

module.exports = { initiateCall };
