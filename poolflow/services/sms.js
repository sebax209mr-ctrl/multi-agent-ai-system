'use strict';

// Outbound SMS.
//
// Talks to the Twilio REST API with global fetch, no SDK: one HTTP call, and it keeps the
// dependency list at three packages.
//
// Two deliberate behaviours:
//  1. Without Twilio credentials, sending is a no-op that logs the body to the console and
//     records status 'skipped_no_credentials'. The entire booking flow (including the
//     Claude agent) can therefore be exercised locally with no Twilio account and no risk
//     of texting a real person while developing.
//  2. Every attempt is written to sms_log before it goes out. When a pilot operator says
//     "my customer never got the reminder", that table is the answer.

const { db } = require('../db');

const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts/';
const MAX_BODY_LENGTH = 480; // ~3 SMS segments; longer means the copy is wrong

function credentials() {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  return accountSid && authToken ? { accountSid, authToken } : null;
}

// OPEN QUESTION to settle with Seba before the second pilot: one Twilio number per
// business (clean, but a per-business monthly cost) or one shared number with routing
// (cheap, but inbound routing has to be inferred and two businesses cannot share a
// customer's phone number). The code supports both: a per-business number wins when set,
// otherwise it falls back to the shared TWILIO_FROM_NUMBER.
function fromNumberFor(business) {
  if (business && business.twilio_number) return business.twilio_number;
  return (process.env.TWILIO_FROM_NUMBER || '').trim() || null;
}

const insertLog = () =>
  db.prepare(
    'INSERT INTO sms_log (business_id, to_number, body, kind, status, error)' +
    ' VALUES (?, ?, ?, ?, ?, ?)'
  );

function log(businessId, to, body, kind, status, error) {
  insertLog().run(businessId || null, to, body, kind, status, error || null);
}

// options: { business, to, body, kind }
async function sendSms(options) {
  const business = options.business || null;
  const businessId = business ? business.id : options.businessId || null;
  const to = options.to;
  const kind = options.kind || 'other';
  const body = String(options.body || '').slice(0, MAX_BODY_LENGTH);

  if (!to || !body) {
    log(businessId, to || '', body, kind, 'failed', 'missing to or body');
    return { status: 'failed', error: 'missing to or body' };
  }

  const creds = credentials();
  const from = fromNumberFor(business);

  if (!creds || !from) {
    console.log('[poolflow] SMS not sent (no Twilio credentials configured)');
    console.log('           to: ' + to);
    console.log('         body: ' + body);
    log(businessId, to, body, kind, 'skipped_no_credentials', null);
    return { status: 'skipped_no_credentials' };
  }

  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(creds.accountSid + ':' + creds.authToken).toString('base64');

  try {
    const response = await fetch(TWILIO_API + creds.accountSid + '/Messages.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload.message || 'Twilio returned ' + response.status;
      console.error('[poolflow] Twilio send failed', { status: response.status, message });
      log(businessId, to, body, kind, 'failed', message);
      return { status: 'failed', error: message };
    }

    log(businessId, to, body, kind, 'sent', null);
    return { status: 'sent', sid: payload.sid };
  } catch (err) {
    console.error('[poolflow] Twilio send threw', err.message);
    log(businessId, to, body, kind, 'failed', err.message);
    return { status: 'failed', error: err.message };
  }
}

module.exports = { sendSms, fromNumberFor, MAX_BODY_LENGTH };

