const axios = require('axios');

/**
 * Thin abstraction over whichever SMS provider you use for OTPs and alerts.
 * Flutterwave does NOT send SMS - you need a separate provider. Termii and
 * Africa's Talking are both solid, widely-used choices for Nigerian numbers.
 *
 * In development (no SMS_API_KEY set), messages are just logged to the
 * console so you can test the whole flow without spending money on SMS.
 */

/**
 * Termii (and most Nigerian SMS APIs) expect international format without
 * the leading 0 - e.g. 2348012345678, not 08012345678. This converts
 * whatever format the person typed into that.
 */
function toInternationalNigerianFormat(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  return digits; // already looks international, or not a Nigerian number - leave as-is
}

async function sendSms(toPhone, message) {
  if (!process.env.SMS_API_KEY || process.env.SMS_API_KEY.includes('your_')) {
    console.log(`[SMS:DEV MODE] To ${toPhone}: ${message}`);
    return { success: true, dev: true };
  }

  const formattedPhone = toInternationalNigerianFormat(toPhone);

  try {
    if (process.env.SMS_PROVIDER === 'termii') {
      const res = await axios.post('https://api.ng.termii.com/api/sms/send', {
        to: formattedPhone,
        from: process.env.SMS_SENDER_ID,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: process.env.SMS_API_KEY,
      });

      // Termii returns 200 even for some failures - the actual delivery
      // status lives in the response body, so check it explicitly instead
      // of assuming success just because the HTTP call didn't throw.
      if (res.data?.code && res.data.code !== 'ok') {
        console.error('[SMS] Termii rejected the message:', JSON.stringify(res.data));
        return { success: false, error: res.data.message || 'Termii rejected the message', providerResponse: res.data };
      }

      console.log(`[SMS] Sent via Termii to ${formattedPhone}. Message ID: ${res.data?.message_id || 'n/a'}`);
      return { success: true, providerResponse: res.data };
    }

    if (process.env.SMS_PROVIDER === 'africastalking') {
      const res = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        new URLSearchParams({
          username: process.env.VOICE_USERNAME,
          to: formattedPhone,
          message,
          from: process.env.SMS_SENDER_ID,
        }),
        { headers: { apiKey: process.env.SMS_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return { success: true, providerResponse: res.data };
    }

    throw new Error(`Unsupported SMS_PROVIDER: ${process.env.SMS_PROVIDER}`);
  } catch (err) {
    const providerMessage = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[SMS] Failed to send:', providerMessage);
    return { success: false, error: providerMessage };
  }
}

module.exports = { sendSms };
