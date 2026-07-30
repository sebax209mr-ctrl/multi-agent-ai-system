'use strict';

// The single write path for creating a job.
//
// Both the manual scheduling UI (POST /api/jobs) and the Claude booking agent's
// create_job tool call land here. There is exactly one implementation on purpose: if the
// agent had its own insert, the two paths would drift and one of them would eventually
// double-book.
//
// The slot is re-validated INSIDE the transaction. Whatever the agent believed when it
// composed its message, the calendar as it exists at write time is the authority.

const { db, tx } = require('../db');
const time = require('../lib/time');
const slots = require('./slots');

const REASON_TEXT = {
  invalid_format: 'that time was not a valid date and time',
  not_a_workday: 'the business does not work that day',
  outside_working_hours: 'that time is outside working hours',
  not_slot_aligned: 'that time does not line up with the appointment grid',
  in_the_past: 'that time has already passed',
  already_booked: 'that time has just been taken',
};

function describeReason(reason) {
  return REASON_TEXT[reason] || 'that time is not available';
}

// params: { business, customerId, startsAt, serviceType, notes, createdBy }
// Returns { ok: true, job } or { ok: false, reason, message }.
function createJob(params) {
  const business = params.business;
  const customerId = Number(params.customerId);
  const startsAt = params.startsAt;
  const serviceType = params.serviceType || 'maintenance';
  const notes = params.notes || null;
  const createdBy = params.createdBy === 'agent' ? 'agent' : 'owner';

  return tx(() => {
    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?')
      .get(customerId, business.id);

    if (!customer) {
      return { ok: false, reason: 'customer_not_found', message: 'That customer does not exist.' };
    }

    const check = slots.checkSlot(business, startsAt);
    if (!check.ok) {
      return { ok: false, reason: check.reason, message: 'Cannot book: ' + describeReason(check.reason) + '.' };
    }

    const info = db
      .prepare(
        'INSERT INTO jobs (business_id, customer_id, starts_at, ends_at, service_type,' +
        ' status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(business.id, customerId, check.starts_at, check.ends_at, serviceType, 'scheduled', notes, createdBy);

    // Booking a visit is the moment a lead becomes a customer. Spec item 5: flip status to
    // active on confirmation. Only promote from 'lead' -- never resurrect a 'lost' or
    // quietly un-pause someone the owner deliberately paused.
    let promoted = false;
    if (customer.status === 'lead') {
      db.prepare(
        "UPDATE customers SET status = 'active', updated_at = datetime('now') WHERE id = ?"
      ).run(customerId);
      promoted = true;
    }

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
    return { ok: true, job, promoted, customer };
  });
}

// Status transitions the operator can make from the week view.
const ALLOWED_STATUS = ['scheduled', 'completed', 'no_show', 'canceled'];

function updateJob(business, jobId, changes) {
  return tx(() => {
    const job = db
      .prepare('SELECT * FROM jobs WHERE id = ? AND business_id = ?')
      .get(Number(jobId), business.id);
    if (!job) return { ok: false, reason: 'not_found', message: 'Job not found.' };

    const next = {
      status: changes.status === undefined ? job.status : changes.status,
      notes: changes.notes === undefined ? job.notes : changes.notes,
      starts_at: changes.starts_at === undefined ? job.starts_at : changes.starts_at,
      service_type: changes.service_type === undefined ? job.service_type : changes.service_type,
    };

    if (ALLOWED_STATUS.indexOf(next.status) === -1) {
      return { ok: false, reason: 'bad_status', message: 'Unknown job status.' };
    }

    // Moving a job is a reschedule, so it goes through the same availability check.
    let endsAt = job.ends_at;
    if (next.starts_at !== job.starts_at) {
      const check = slots.checkSlot(business, next.starts_at);
      if (!check.ok) {
        return { ok: false, reason: check.reason, message: 'Cannot move: ' + describeReason(check.reason) + '.' };
      }
      endsAt = check.ends_at;
    }

    db.prepare(
      "UPDATE jobs SET status = ?, notes = ?, starts_at = ?, ends_at = ?, service_type = ?," +
      " updated_at = datetime('now') WHERE id = ?"
    ).run(next.status, next.notes, next.starts_at, endsAt, next.service_type, job.id);

    return { ok: true, job: db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id) };
  });
}

// Week view feed. Monday-anchored so the operator's week matches the schedule page.
function jobsForWeek(businessId, weekStart) {
  const monday = time.startOfWeek(weekStart || time.today());
  const rows = db
    .prepare(
      "SELECT j.*, c.name AS customer_name, c.phone AS customer_phone," +
      "       c.address AS customer_address, c.status AS customer_status" +
      "  FROM jobs j JOIN customers c ON c.id = j.customer_id" +
      " WHERE j.business_id = ? AND j.starts_at >= ? AND j.starts_at < ?" +
      " ORDER BY j.starts_at ASC"
    )
    .all(businessId, monday + ' 00:00', time.addDays(monday, 7) + ' 00:00');

  return { week_start: monday, week_end: time.addDays(monday, 6), jobs: rows };
}

module.exports = { createJob, updateJob, jobsForWeek, describeReason, ALLOWED_STATUS };

