'use strict';

// POST /api/webhooks/twilio-inbound
//
// The one public, unauthenticated endpoint in the system. Order of the middleware matters
// and is not accidental:
//
//   1. express.urlencoded - Twilio posts a form, not JSON.
//   2. verifyTwilioSignature - reject anything not signed by Twilio, before we spend money.
//   3. inboundSmsLimiter - keyed on the sending number, so one abusive texter cannot burn
//      the Anthropic budget or the SMS balance for everyone.
//   4. handleInbound - lead lookup, conversation state, then the agent.
//
// The reply is sent through the Twilio REST API rather than returned as TwiML. That is a
// deliberate trade: it costs one extra HTTP call, but the webhook can answer immediately
// and the agent is never racing Twilio's ~15 second webhook timeout while waiting on a
// model response.

const express = require('express');
const { verifyTwilioSignature } = require('../middleware/twilioSignature');
const { inboundSmsLimiter } = require('../middleware/rateLimit');
const { asyncRoute } = require('../middleware/errors');
const conversations = require('../services/conversations');

const router = express.Router();

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

router.post(
  '/twilio-inbound',
  express.urlencoded({ extended: false, limit: '16kb' }),
  verifyTwilioSignature,
  inboundSmsLimiter,
  asyncRoute(async (req, res) => {
    const result = await conversations.handleInbound({
      to: req.body.To,
      from: req.body.From,
      body: req.body.Body,
      providerSid: req.body.MessageSid,
    });

    // Always 200 with empty TwiML, even when we could not handle the message. A non-2xx
    // here makes Twilio retry, and a retry loop on a message we already failed to parse
    // just multiplies the problem. The outcome is in the logs and in sms_log instead.
    if (!result.handled) {
      console.warn('[poolflow] inbound SMS not handled', result);
    }

    res.set('Content-Type', 'text/xml');
    return res.status(200).send(EMPTY_TWIML);
  })
);

module.exports = router;

