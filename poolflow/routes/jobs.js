'use strict';

// Job routes.
//
//   POST   /api/jobs                create a job (manual scheduling)
//   GET    /api/jobs?week=YYYY-MM-DD list a Monday-anchored week
//   GET    /api/jobs/slots?days=7    open slots, for the manual scheduling UI
//   PATCH  /api/jobs/:id             update status / notes / time
//
// Every write goes through services/bookings.js. These handlers do not touch the jobs
// table directly, which is what keeps the manual UI and the SMS agent from drifting apart
// and double-booking.

const express = require('express');
const { validateBody, validateQuery, requireAny } = require('../middleware/validate');
const { loadJob } = require('../middleware/tenant');
const { HttpError } = require('../middleware/errors');
const bookings = require('../services/bookings');
const slots = require('../services/slots');
const time = require('../lib/time');

const router = express.Router();

const SERVICE_TYPES = ['maintenance', 'repair', 'cleaning', 'inspection', 'other'];
const JOB_STATUSES = ['scheduled', 'completed', 'no_show', 'canceled'];

function businessOf(req) {
  return {
    id: req.user.business_id,
    name: req.user.business_name,
    twilio_number: req.user.twilio_number,
    workday_start: req.user.workday_start,
    workday_end: req.user.workday_end,
    workdays: req.user.workdays,
    slot_minutes: req.user.slot_minutes,
  };
}

// ---------------------------------------------------------------------------
// GET /api/jobs/slots
// Declared before /:id so 'slots' is not swallowed as an id.
// ---------------------------------------------------------------------------
router.get(
  '/slots',
  validateQuery({
    days: { type: 'int', min: 1, max: 30, default: 7 },
    start: { type: 'date' },
    limit: { type: 'int', min: 1, max: 200 },
  }),
  (req, res) => {
    const business = businessOf(req);
    const open = slots.openSlots(business, {
      days: req.valid.days,
      startDate: req.valid.start || time.today(),
    });
    const limited = req.valid.limit ? open.slice(0, req.valid.limit) : open;
    return res.json({ slots: limited, count: limited.length, slot_minutes: business.slot_minutes });
  }
);

// ---------------------------------------------------------------------------
// GET /api/jobs?week=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get('/', validateQuery({ week: { type: 'date' } }), (req, res) => {
  const week = bookings.jobsForWeek(req.businessId, req.valid.week || time.today());
  return res.json(week);
});

// ---------------------------------------------------------------------------
// POST /api/jobs
// ---------------------------------------------------------------------------
router.post(
  '/',
  validateBody({
    customer_id: { type: 'int', required: true, min: 1 },
    starts_at: { type: 'datetime', required: true },
    service_type: { type: 'enum', values: SERVICE_TYPES, default: 'maintenance' },
    notes: { type: 'string', maxLength: 2000 },
  }),
  (req, res, next) => {
    const result = bookings.createJob({
      business: businessOf(req),
      customerId: req.valid.customer_id,
      startsAt: req.valid.starts_at,
      serviceType: req.valid.service_type,
      notes: req.valid.notes || null,
      createdBy: 'owner',
    });

    if (!result.ok) {
      const status = result.reason === 'customer_not_found' ? 404 : 409;
      const code = status === 404 ? 'not_found' : 'slot_unavailable';
      return next(new HttpError(status, code, result.message, { starts_at: result.reason }));
    }

    return res.status(201).json({
      job: result.job,
      // The UI uses this to show "lead promoted to active" without a second request.
      customer_promoted_to_active: Boolean(result.promoted),
    });
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:id
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  loadJob,
  validateBody({
    status: { type: 'enum', values: JOB_STATUSES },
    notes: { type: 'string', maxLength: 2000, nullable: true },
    starts_at: { type: 'datetime' },
    service_type: { type: 'enum', values: SERVICE_TYPES },
  }),
  requireAny(['status', 'notes', 'starts_at', 'service_type']),
  (req, res, next) => {
    const result = bookings.updateJob(businessOf(req), req.job.id, req.valid);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 409;
      const code = status === 404 ? 'not_found' : 'slot_unavailable';
      return next(new HttpError(status, code, result.message));
    }
    return res.json({ job: result.job });
  }
);

module.exports = router;

