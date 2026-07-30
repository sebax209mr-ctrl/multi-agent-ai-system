'use strict';

// Twilio webhook authentication.
//
// POST /api/webhooks/twilio-inbound is a public URL that spends money (Claude tokens,
// outbound SMS segments) and writes rows, so it is only trusted when X-Twilio-Signature
// verifies. Twilio's scheme: HMAC-SHA1 over the full request URL with every POST param
// appended as key+value in alphabetical order, base64 encoded.
//
// This is implemented by hand so the MVP does not need the twilio SDK server-side.

const crypto = require('node:crypto');
const { forbidden } = require('./errors');

function expectedSignature(authToken, url, params) {
  const source = params || {};
  const data = Object.keys(source)
    .sort()
    .reduce((acc, key) => acc + key + source[key], url);
  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf8'))
    .digest('base64');
}

function trimTrailingSlashes(value) {
  let out = value;
  while (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

// Twilio signs the exact URL configured in the console. Behind a proxy or tunnel,
// req.protocol/host often disagree with it, so PUBLIC_BASE_URL wins when set.
function webhookUrl(req) {
  const configured = trimTrailingSlashes(String(process.env.PUBLIC_BASE_URL || '').trim());
  if (configured) return configured + req.originalUrl;
  return req.protocol + '://' + req.get('host') + req.originalUrl;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyTwilioSignature(req, res, next) {
  const enabled = String(process.env.VERIFY_TWILIO_SIGNATURE || 'true').toLowerCase() !== 'false';

  if (!enabled) {
    // Loud on purpose. This is only for replaying a captured webhook by hand in dev.
    console.warn(
      '[poolflow] VERIFY_TWILIO_SIGNATURE=false - inbound webhook signature check is OFF. ' +
      'Never ship this to a deployed environment.'
    );
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[poolflow] TWILIO_AUTH_TOKEN missing; rejecting inbound webhook.');
    return next(forbidden('Webhook signature cannot be verified.'));
  }

  const provided = req.get('X-Twilio-Signature');
  if (!provided) return next(forbidden('Missing X-Twilio-Signature.'));

  const url = webhookUrl(req);
  if (safeEqual(provided, expectedSignature(authToken, url, req.body))) return next();

  console.warn('[poolflow] rejected inbound webhook: bad signature', {
    url,
    from: req.body ? req.body.From : undefined,
  });
  return next(forbidden('Invalid webhook signature.'));
}

module.exports = { verifyTwilioSignature, expectedSignature, webhookUrl };

