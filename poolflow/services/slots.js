'use strict';

// Open-slot calculation.
//
// This is the only place in the system that decides what "available" means. The booking
// agent is not allowed to reason about availability at all -- it can only repeat times
// that came out of proposeSlots(), and any time it tries to book is re-checked here inside
// the write transaction. That split is what stops a language model from inventing a
// Sunday 3am appointment.

const { db } = require('../db');
const time = require('../lib/time');

// Never offer something that starts in the next two hours; the operator needs to see it.
const DEFAULT_LEAD_TIME_MINUTES = 120;
const DEFAULT_HORIZON_DAYS = 7;

function parseWorkdays(csv) {
  const days = String(csv === undefined || csv === null ? '1,2,3,4,5' : csv)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return days.length ? days : [1, 2, 3, 4, 5];
}

// Only scheduled and completed jobs block a slot. Canceled and no_show free it up again,
// which is what the operator expects after marking someone a no-show.
function jobsBetween(businessId, fromDate, toDateExclusive) {
  return db
    .prepare(
      "SELECT j.id, j.starts_at, j.ends_at, j.status, j.service_type, j.notes," +
      "       c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone," +
      "       c.address AS customer_address, c.status AS customer_status" +
      "  FROM jobs j JOIN customers c ON c.id = j.customer_id" +
      " WHERE j.business_id = ?" +
      "   AND j.status IN ('scheduled','completed')" +
      "   AND j.starts_at >= ? AND j.starts_at < ?" +
      " ORDER BY j.starts_at ASC"
    )
    .all(businessId, fromDate + ' 00:00', toDateExclusive + ' 00:00');
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function businessHours(business) {
  return {
    slotMinutes: business.slot_minutes || 60,
    dayStart: time.hhmmToMinutes(business.workday_start || '08:00'),
    dayEnd: time.hhmmToMinutes(business.workday_end || '17:00'),
    workdays: parseWorkdays(business.workdays),
  };
}

// Every free slot in the next N days, oldest first.
function openSlots(business, options) {
  const opts = options || {};
  const days = opts.days || DEFAULT_HORIZON_DAYS;
  const startDate = opts.startDate || time.today();
  const leadMinutes =
    opts.leadTimeMinutes === undefined ? DEFAULT_LEAD_TIME_MINUTES : opts.leadTimeMinutes;
  const earliest = time.addMinutes(time.nowDateTime(), leadMinutes);

  const { slotMinutes, dayStart, dayEnd, workdays } = businessHours(business);
  const booked = jobsBetween(business.id, startDate, time.addDays(startDate, days));

  const slots = [];
  for (let i = 0; i < days; i += 1) {
    const date = time.addDays(startDate, i);
    if (!workdays.includes(time.isoWeekday(date))) continue;

    for (let m = dayStart; m + slotMinutes <= dayEnd; m += slotMinutes) {
      const startsAt = date + ' ' + time.minutesToHhmm(m);
      if (startsAt < earliest) continue;
      const endsAt = time.addMinutes(startsAt, slotMinutes);
      const clash = booked.some((job) => overlaps(startsAt, endsAt, job.starts_at, job.ends_at));
      if (clash) continue;
      slots.push({ starts_at: startsAt, ends_at: endsAt, label: time.humanDateTime(startsAt) });
    }
  }
  return slots;
}

// What the agent is handed: one or two options, not forty. A text message listing every
// free hour of the week is unusable and wastes the token budget, so spread the picks over
// different days to give a real choice.
function proposeSlots(business, options) {
  const opts = options || {};
  const wanted = opts.limit || 2;
  const all = openSlots(business, opts);

  const picked = [];
  const usedDays = new Set();
  for (const slot of all) {
    const day = slot.starts_at.split(' ')[0];
    if (usedDays.has(day)) continue;
    picked.push(slot);
    usedDays.add(day);
    if (picked.length >= wanted) break;
  }
  // Busy calendar or a short horizon: backfill with same-day times rather than offering one.
  if (picked.length < wanted) {
    for (const slot of all) {
      if (picked.indexOf(slot) !== -1) continue;
      picked.push(slot);
      if (picked.length >= wanted) break;
    }
  }
  return picked;
}

// Authoritative re-check before any write. Returns { ok, reason } so the caller can tell
// the customer why, instead of failing silently.
function checkSlot(business, startsAt) {
  if (!time.isDateTime(startsAt)) {
    return { ok: false, reason: 'invalid_format' };
  }
  const { slotMinutes, dayStart, dayEnd, workdays } = businessHours(business);
  const [date, clock] = startsAt.split(' ');

  if (!workdays.includes(time.isoWeekday(date))) {
    return { ok: false, reason: 'not_a_workday' };
  }
  const minutes = time.hhmmToMinutes(clock);
  if (minutes < dayStart || minutes + slotMinutes > dayEnd) {
    return { ok: false, reason: 'outside_working_hours' };
  }
  if ((minutes - dayStart) % slotMinutes !== 0) {
    return { ok: false, reason: 'not_slot_aligned' };
  }
  if (startsAt < time.nowDateTime()) {
    return { ok: false, reason: 'in_the_past' };
  }

  const endsAt = time.addMinutes(startsAt, slotMinutes);
  const clash = jobsBetween(business.id, date, time.addDays(date, 1)).some((job) =>
    overlaps(startsAt, endsAt, job.starts_at, job.ends_at)
  );
  if (clash) return { ok: false, reason: 'already_booked' };

  return { ok: true, starts_at: startsAt, ends_at: endsAt };
}

module.exports = {
  openSlots,
  proposeSlots,
  checkSlot,
  jobsBetween,
  parseWorkdays,
  businessHours,
  overlaps,
  DEFAULT_LEAD_TIME_MINUTES,
  DEFAULT_HORIZON_DAYS,
};

