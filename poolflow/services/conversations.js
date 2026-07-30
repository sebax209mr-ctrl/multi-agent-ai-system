'use strict';

// Inbound SMS orchestration: the layer between the Twilio webhook and the agent.
//
// Everything that is a decision about records rather than about language lives here, so
// the agent stays a pure conversation function.
//
// OPEN QUESTION that is answered structurally rather than silently: a text from someone
// who already has a scheduled visit is almost certainly a reschedule, while a text from an
// unknown number is a new lead. Both arrive on the same webhook. The branch is decided
// here by classifyIntent() and passed to the agent as context; v1 deliberately does NOT
// let the agent move or cancel an existing job on its own - it escalates instead. Moving
// an existing booking by SMS needs a real answer on cancellation policy first.

const { db, tx } = require('../db');
const time = require('../lib/time');
const { normalizePhone } = require('../lib/phone');
const agent = require('./agent');
const { sendSms } = require('./sms');

// Which business owns this inbound message. With one number per business this is an exact
// lookup on the To number. With a single shared number it falls back to the only business
// on the instance, which is correct for the pilot and wrong the moment there are two -
// hence the open question in services/sms.js.
function resolveBusiness(toNumber) {
  const normalized = normalizePhone(toNumber);
  if (normalized) {
    const match = db.prepare('SELECT * FROM businesses WHERE twilio_number = ?').get(normalized);
    if (match) return match;
  }
  const all = db.prepare('SELECT * FROM businesses ORDER BY id ASC LIMIT 2').all();
  if (all.length === 1) return all[0];
  return null;
}

// Look up by phone, create a lead if unknown. Spec item 5: an unknown texter becomes a
// lead record before anything else happens, so no conversation is ever orphaned.
function findOrCreateCustomer(business, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const existing = db
    .prepare('SELECT * FROM customers WHERE business_id = ? AND phone = ?')
    .get(business.id, normalized);
  if (existing) return existing;

  const info = db
    .prepare(
      "INSERT INTO customers (business_id, phone, status, source) VALUES (?, ?, 'lead', 'sms')"
    )
    .run(business.id, normalized);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
}

// One live thread per customer. A closed or booked thread is reopened rather than
// duplicated, so the dashboard shows one row per person.
function findOrCreateConversation(business, customer) {
  const open = db
    .prepare(
      "SELECT * FROM conversations WHERE business_id = ? AND customer_id = ?" +
      "   AND status IN ('open','needs_human') ORDER BY id DESC LIMIT 1"
    )
    .get(business.id, customer.id);
  if (open) return open;

  const info = db
    .prepare(
      "INSERT INTO conversations (business_id, customer_id, status, intent, last_message_at)" +
      " VALUES (?, ?, 'open', 'unknown', datetime('now'))"
    )
    .run(business.id, customer.id);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
}

function hasUpcomingJob(business, customer) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE business_id = ? AND customer_id = ?" +
      "   AND status = 'scheduled' AND starts_at >= ?"
    )
    .get(business.id, customer.id, time.nowDateTime());
  return row.n > 0;
}

function classifyIntent(business, customer) {
  return hasUpcomingJob(business, customer) ? 'reschedule' : 'new_booking';
}

// Twilio retries webhooks on timeout. Recording MessageSid means a retry is a no-op
// instead of a second reply and, worse, a second booking attempt.
function alreadyProcessed(providerSid) {
  if (!providerSid) return false;
  const row = db.prepare('SELECT id FROM messages WHERE provider_sid = ?').get(providerSid);
  return Boolean(row);
}

function recordInbound(conversation, body, providerSid) {
  return tx(() => {
    db.prepare(
      "INSERT INTO messages (conversation_id, direction, author, body, provider_sid)" +
      " VALUES (?, 'inbound', 'customer', ?, ?)"
    ).run(conversation.id, body, providerSid || null);

    db.prepare(
      "UPDATE conversations SET turn_count = turn_count + 1, last_message_at = datetime('now')" +
      ' WHERE id = ?'
    ).run(conversation.id);

    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation.id);
  });
}

function recordOutbound(conversation, body, author) {
  db.prepare(
    "INSERT INTO messages (conversation_id, direction, author, body)" +
    " VALUES (?, 'outbound', ?, ?)"
  ).run(conversation.id, author || 'agent', body);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?")
    .run(conversation.id);
}

// params: { to, from, body, providerSid }
// Returns a small result object; the route turns it into a 200 for Twilio either way.
async function handleInbound(params) {
  const business = resolveBusiness(params.to);
  if (!business) {
    console.warn('[poolflow] inbound SMS for an unknown number', { to: params.to });
    return { handled: false, reason: 'unknown_business' };
  }

  if (alreadyProcessed(params.providerSid)) {
    return { handled: true, reason: 'duplicate_webhook' };
  }

  const body = String(params.body || '').trim();
  if (!body) return { handled: false, reason: 'empty_body' };

  const customer = findOrCreateCustomer(business, params.from);
  if (!customer) return { handled: false, reason: 'unparseable_from_number' };

  let conversation = findOrCreateConversation(business, customer);
  conversation = recordInbound(conversation, body, params.providerSid);

  const intent = classifyIntent(business, customer);
  db.prepare('UPDATE conversations SET intent = ? WHERE id = ?').run(intent, conversation.id);

  // Once a human has taken over, the agent stays out of the way. Silence is correct here:
  // two voices answering the same customer is worse than a slow reply.
  if (conversation.status === 'needs_human') {
    return { handled: true, reason: 'awaiting_owner', conversation_id: conversation.id };
  }

  let result;
  try {
    result = await agent.respond({ business, customer, conversation, incomingBody: body });
  } catch (err) {
    console.error('[poolflow] booking agent failed', err.message);
    agent.markNeedsHuman(conversation, 'agent error: ' + err.message);
    result = {
      reply: 'Thanks for the message - the owner will text you back shortly.',
      escalated: true,
      job: null,
    };
  }

  recordOutbound(conversation, result.reply, 'agent');
  const delivery = await sendSms({
    business,
    to: customer.phone,
    body: result.reply,
    kind: 'agent_reply',
  });

  return {
    handled: true,
    conversation_id: conversation.id,
    customer_id: customer.id,
    intent,
    escalated: Boolean(result.escalated),
    job_id: result.job ? result.job.id : null,
    delivery: delivery.status,
  };
}

// Dashboard feed: threads that need a human first, then most recent activity.
function listConversations(businessId, status) {
  const where = status ? ' AND cv.status = ?' : '';
  const args = status ? [businessId, status] : [businessId];
  return db
    .prepare(
      "SELECT cv.*, c.name AS customer_name, c.phone AS customer_phone, c.status AS customer_status," +
      "       (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.id DESC LIMIT 1)" +
      "         AS last_message" +
      '  FROM conversations cv JOIN customers c ON c.id = cv.customer_id' +
      ' WHERE cv.business_id = ?' + where +
      " ORDER BY CASE cv.status WHEN 'needs_human' THEN 0 ELSE 1 END, cv.last_message_at DESC"
    )
    .all(...args);
}

function getThread(businessId, conversationId) {
  const conversation = db
    .prepare(
      'SELECT cv.*, c.name AS customer_name, c.phone AS customer_phone, c.status AS customer_status' +
      '  FROM conversations cv JOIN customers c ON c.id = cv.customer_id' +
      ' WHERE cv.id = ? AND cv.business_id = ?'
    )
    .get(Number(conversationId), businessId);
  if (!conversation) return null;

  const messages = db
    .prepare('SELECT id, direction, author, body, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversation.id);

  return { conversation, messages };
}

// The owner answering by hand from the dashboard. This resolves the escalation, so the
// thread goes back to open and the turn counter resets.
async function replyAsOwner(business, conversation, body) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(conversation.customer_id);
  recordOutbound(conversation, body, 'owner');
  db.prepare(
    "UPDATE conversations SET status = 'open', turn_count = 0, escalated_at = NULL WHERE id = ?"
  ).run(conversation.id);

  const delivery = await sendSms({ business, to: customer.phone, body, kind: 'agent_reply' });
  return { delivery: delivery.status };
}

module.exports = {
  handleInbound,
  resolveBusiness,
  findOrCreateCustomer,
  findOrCreateConversation,
  classifyIntent,
  listConversations,
  getThread,
  replyAsOwner,
  recordOutbound,
};

