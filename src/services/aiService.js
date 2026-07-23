const axios = require('axios');

const SYSTEM_PROMPT = `You are the in-app help assistant for MustyRide, a bike logistics app in Osun State, Nigeria.
You help customers and riders with things like: how to book a delivery, how the delivery confirmation
code works, how wallet payments and the 15% commission work, how to cancel an order, how to withdraw
earnings, and how to contact human support for anything you can't resolve. Be brief, warm, and practical.
If someone reports a scam, fraud, or a serious dispute, tell them to use "Request Refund" or "Report a
problem" in their order, since that opens a real support ticket a human reviews.`;

/**
 * Sends a message to Claude and returns its reply. Needs ANTHROPIC_API_KEY
 * set in .env. Until you add one, this responds with a helpful canned
 * message so the widget still works while you're developing.
 */
async function askAssistant(userMessage, history = []) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('your_')) {
    return {
      reply:
        "I'm running in demo mode right now (no AI key set yet), but here's what I can tell you: " +
        "book a delivery from your dashboard, give the 4-digit code to your rider when they hand it over, " +
        "and use 'Report a problem' in My Orders if anything seems wrong. For anything else, use Request Refund " +
        "or the contact page to reach a real person.",
      dev: true,
    };
  }

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [...history, { role: 'user', content: userMessage }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = res.data?.content?.find((c) => c.type === 'text')?.text || "Sorry, I couldn't process that.";
    return { reply };
  } catch (err) {
    console.error('[AI Assistant] Error:', err.message);
    return { reply: "I'm having trouble right now - please try again shortly, or use the Contact page for a real person." };
  }
}

module.exports = { askAssistant };
