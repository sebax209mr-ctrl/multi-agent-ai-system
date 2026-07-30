'use strict';

// API surface, mounted at /api by server.js.
//
//   POST   /api/auth/login
//   POST   /api/auth/logout
//   GET    /api/auth/me
//   POST   /api/customers                 create lead/customer
//   GET    /api/customers                 list, filter by status
//   GET    /api/customers/:id
//   PATCH  /api/customers/:id             update status/plan/notes
//   POST   /api/jobs                      create job (manual scheduling)
//   GET    /api/jobs?week=YYYY-MM-DD      list jobs for a week
//   GET    /api/jobs/slots                open slots for the scheduling UI
//   PATCH  /api/jobs/:id                  update status (completed/no_show/canceled)
//   GET    /api/conversations             escalation queue
//   GET    /api/conversations/:id         transcript
//   POST   /api/conversations/:id/reply   owner replies by hand
//   PATCH  /api/conversations/:id         close/reopen
//   GET    /api/dashboard                 week jobs + lead/customer counts
//   POST   /api/webhooks/twilio-inbound   inbound SMS -> conversation handler -> agent
//   POST   /api/cron/reminders            daily job, triggers day-before SMS sends
//
// Mount order is load-bearing. The two machine-facing endpoints go first, before the JSON
// body parser and before any session guard: Twilio posts form-encoded data and
// authenticates with a signature, and the cron endpoint authenticates with a shared
// secret. Everything after that is a browser talking JSON with a session cookie.

const express = require('express');
const { requireAuth } = require('../middleware/session');
const { scopeToBusiness } = require('../middleware/tenant');
const { apiLimiter } = require('../middleware/rateLimit');
const { noStore } = require('../middleware/security');
const { notFound } = require('../middleware/errors');

const router = express.Router();

// --- machine-facing, no session ---------------------------------------------
router.use('/webhooks', require('./webhooks'));
router.use('/cron', express.json({ limit: '8kb' }), require('./cron'));

// --- browser-facing ---------------------------------------------------------
router.use(express.json({ limit: '64kb' }));
router.use(noStore);

router.use('/auth', require('./auth'));

// Every route below is authenticated AND scoped to one business. scopeToBusiness runs
// second so req.businessId exists before any handler can forget to filter by it.
const guarded = [requireAuth, scopeToBusiness, apiLimiter];

router.use('/customers', guarded, require('./customers'));
router.use('/jobs', guarded, require('./jobs'));
router.use('/conversations', guarded, require('./conversations'));
router.use('/dashboard', guarded, require('./dashboard'));

// Anything else under /api is a 404 in JSON, never the HTML catch-all page.
router.use(notFound);

module.exports = router;
