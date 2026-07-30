'use strict';

// Conversation routes - the escalation queue.
//
//   GET   /api/conversations?status=needs_human   list threads
//   GET   /api/conversations/:id                  full transcript
//   POST  /api/conversations/:id/reply            owner answers by hand
//   PATCH /api/conversations/:id                  close or reopen a thread
//
// This is the human half of the booking assistant. The agent is allowed to give up; what
// it is not allowed to do is give up silently, so a flagged thread has to be visible and
// answerable from the dashboard.

const express = require('express');
const { db } = require('../db');
const { validateBody, validateQuery } = require('../middleware/validate');
const { loadConversation } = require('../middleware/tenant');
const { asyncRoute } = require('../middleware/errors');
const conversations = require('../services/conversations');

const router = express.Router();

const CONVERSATION_STATUSES = ['open', 'booked', 'needs_human', 'closed'];

router.get(
  '/',
  validateQuery({ status: { type: 'enum', values: CONVERSATION_STATUSES } }),
  (req, res) => {
    const rows = conversations.listConversations(req.businessId, req.valid.status);
    return res.json({ conversations: rows, count: rows.length });
  }
);

router.get('/:id', loadConversation, (req, res) => {
  const thread = conversations.getThread(req.businessId, req.conversation.id);
  return res.json(thread);
});

// The owner typing a reply resolves the escalation: status goes back to open and the turn
// counter resets, so the agent gets a fresh budget if the customer keeps texting.
router.post(
  '/:id/reply',
  loadConversation,
  validateBody({ body: { type: 'string', required: true, minLength: 1, maxLength: 480 } }),
  asyncRoute(async (req, res) => {
    const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.businessId);
    const result = await conversations.replyAsOwner(business, req.conversation, req.valid.body);
    const thread = conversations.getThread(req.businessId, req.conversation.id);
    return res.json({ delivery: result.delivery, conversation: thread.conversation, messages: thread.messages });
  })
);

router.patch(
  '/:id',
  loadConversation,
  validateBody({ status: { type: 'enum', values: CONVERSATION_STATUSES, required: true } }),
  (req, res) => {
    // Clearing escalated_at on reopen keeps the dashboard queue honest: a thread is either
    // waiting for the owner right now, or it is not.
    const escalated = req.valid.status === 'needs_human';
    db.prepare(
      'UPDATE conversations SET status = ?, escalated_at = ' +
      (escalated ? "datetime('now')" : 'NULL') +
      ' WHERE id = ? AND business_id = ?'
    ).run(req.valid.status, req.conversation.id, req.businessId);

    const updated = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.conversation.id);
    return res.json({ conversation: updated });
  }
);

module.exports = router;

