'use strict';

// POST /api/cron/reminders
//
// Triggered by an external scheduler once a day (cron, a hosting provider's scheduler, or
// a GitHub Action). Authenticated with a shared secret header rather than a session,
// because the caller is a machine and has no cookie jar.
//
// Safe to call more than once: services/reminders.js stamps jobs.reminder_sent_at, so the
// second run of the day is a no-op rather than a duplicate text to every customer.

const crypto = require('node:crypto');
const express = require('express');
const { cronLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { asyncRoute, HttpError } = require('../middleware/errors');
const reminders = require('../services/reminders');

const router = express.Router();

function requireCronSecret(req, res, next) {
  const expected = (process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return next(new HttpError(503, 'not_configured', 'CRON_SECRET is not set on the server.'));
  }
  const provided = Buffer.from(String(req.get('X-Cron-Secret') || ''));
  const secret = Buffer.from(expected);
  if (provided.length !== secret.length || !crypto.timingSafeEqual(provided, secret)) {
    console.warn('[poolflow] rejected cron call with a bad secret');
    return next(new HttpError(403, 'forbidden', 'Bad cron secret.'));
  }
  return next();
}

router.post(
  '/reminders',
  cronLimiter,
  requireCronSecret,
  // date is for backfilling or testing a specific day; normally omitted, meaning tomorrow.
  validateBody({ date: { type: 'date' } }),
  asyncRoute(async (req, res) => {
    const summary = await reminders.sendDayBeforeReminders({ date: req.valid.date });
    return res.json(summary);
  })
);

module.exports = router;
