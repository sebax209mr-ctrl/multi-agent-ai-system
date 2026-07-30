'use strict';

// Day-before reminders. Build order week 4: send-only SMS, shipped and validated before
// anyone attempts two-way conversation.
//
// Idempotent by design. jobs.reminder_sent_at is stamped in the same pass as the send, so
// a scheduler that fires twice (or a human hitting the endpoint to test it) does not text
// the customer twice. That matters more than it sounds: a duplicate reminder is the fastest
// way to lose a pilot operator's trust.

const { db } = require('../db');
const time = require('../lib/time');
const { sendSms } = require('./sms');

function reminderBody(business, job) {
  const when = time.humanDateTime(job.starts_at);
  const name = job.customer_name ? job.customer_name.split(' ')[0] : 'Hi';
  return (
    name + ', reminder from ' + business.name + ': your pool service is ' + when + '. ' +
    'Reply here if you need to change it.'
  );
}

// Jobs starting on the given date that are still scheduled and not yet reminded.
function dueReminders(targetDate) {
  return db
    .prepare(
      "SELECT j.*, c.name AS customer_name, c.phone AS customer_phone," +
      "       b.id AS business_id, b.name AS business_name, b.twilio_number" +
      '  FROM jobs j' +
      '  JOIN customers c ON c.id = j.customer_id' +
      '  JOIN businesses b ON b.id = j.business_id' +
      " WHERE j.status = 'scheduled'" +
      '   AND j.reminder_sent_at IS NULL' +
      '   AND j.starts_at >= ? AND j.starts_at < ?' +
      ' ORDER BY j.starts_at ASC'
    )
    .all(targetDate + ' 00:00', time.addDays(targetDate, 1) + ' 00:00');
}

function markSent(jobId) {
  db.prepare("UPDATE jobs SET reminder_sent_at = datetime('now') WHERE id = ?").run(jobId);
}

// options: { date } - defaults to tomorrow. Returns a summary the cron route echoes back
// so a failing scheduler is visible without digging through logs.
async function sendDayBeforeReminders(options) {
  const opts = options || {};
  const targetDate = opts.date || time.addDays(time.today(), 1);
  const jobs = dueReminders(targetDate);

  const summary = { date: targetDate, considered: jobs.length, sent: 0, skipped: 0, failed: 0 };

  for (const job of jobs) {
    if (!job.customer_phone) {
      summary.skipped += 1;
      continue;
    }
    const business = {
      id: job.business_id,
      name: job.business_name,
      twilio_number: job.twilio_number,
    };

    const result = await sendSms({
      business,
      to: job.customer_phone,
      body: reminderBody(business, job),
      kind: 'reminder',
    });

    if (result.status === 'sent' || result.status === 'skipped_no_credentials') {
      // Stamped in both cases on purpose: without credentials the run is a dry run, and
      // re-texting the whole week the moment Twilio is configured would be worse.
      markSent(job.id);
      if (result.status === 'sent') summary.sent += 1;
      else summary.skipped += 1;
    } else {
      summary.failed += 1;
    }
  }

  console.log('[poolflow] reminder run', summary);
  return summary;
}

module.exports = { sendDayBeforeReminders, dueReminders, reminderBody };

