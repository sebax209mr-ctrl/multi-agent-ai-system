'use strict';

// Dashboard metrics. Spec item 6, and nothing more: this week's jobs, count of open leads,
// count of active customers. No revenue, no conversion funnel, no charts. Every extra
// number here is a number the operator has to interpret before they can start their day,
// and none of them have been validated as useful yet.

const { db } = require('../db');
const time = require('../lib/time');

function counts(businessId) {
  const row = db
    .prepare(
      "SELECT" +
      "  SUM(CASE WHEN status = 'lead'   THEN 1 ELSE 0 END) AS open_leads," +
      "  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_customers," +
      "  SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS paused_customers" +
      '  FROM customers WHERE business_id = ?'
    )
    .get(businessId);

  return {
    open_leads: row.open_leads || 0,
    active_customers: row.active_customers || 0,
    paused_customers: row.paused_customers || 0,
  };
}

function weekJobs(businessId, weekStart) {
  const monday = time.startOfWeek(weekStart || time.today());
  const jobs = db
    .prepare(
      "SELECT j.id, j.starts_at, j.ends_at, j.status, j.service_type, j.notes," +
      "       c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone," +
      "       c.address AS customer_address" +
      '  FROM jobs j JOIN customers c ON c.id = j.customer_id' +
      ' WHERE j.business_id = ? AND j.starts_at >= ? AND j.starts_at < ?' +
      ' ORDER BY j.starts_at ASC'
    )
    .all(businessId, monday + ' 00:00', time.addDays(monday, 7) + ' 00:00');

  const byStatus = { scheduled: 0, completed: 0, no_show: 0, canceled: 0 };
  for (const job of jobs) byStatus[job.status] += 1;

  return { week_start: monday, week_end: time.addDays(monday, 6), jobs, by_status: byStatus };
}

// Conversations the agent could not finish. This is the queue the owner actually has to
// work, so it belongs on the front page rather than buried behind a tab.
function flaggedConversations(businessId) {
  return db
    .prepare(
      "SELECT cv.id, cv.status, cv.intent, cv.turn_count, cv.escalated_at, cv.last_message_at," +
      '       c.name AS customer_name, c.phone AS customer_phone,' +
      '       (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.id DESC LIMIT 1)' +
      '         AS last_message' +
      '  FROM conversations cv JOIN customers c ON c.id = cv.customer_id' +
      " WHERE cv.business_id = ? AND cv.status = 'needs_human'" +
      ' ORDER BY cv.escalated_at ASC'
    )
    .all(businessId);
}

function todayJobs(businessId) {
  const today = time.today();
  return db
    .prepare(
      'SELECT j.id, j.starts_at, j.status, c.name AS customer_name, c.address AS customer_address' +
      '  FROM jobs j JOIN customers c ON c.id = j.customer_id' +
      ' WHERE j.business_id = ? AND j.starts_at >= ? AND j.starts_at < ?' +
      ' ORDER BY j.starts_at ASC'
    )
    .all(businessId, today + ' 00:00', time.addDays(today, 1) + ' 00:00');
}

function summary(businessId, weekStart) {
  const week = weekJobs(businessId, weekStart);
  return {
    generated_at: time.nowDateTime(),
    counts: counts(businessId),
    week: week,
    today: todayJobs(businessId),
    flagged: flaggedConversations(businessId),
  };
}

module.exports = { summary, counts, weekJobs, todayJobs, flaggedConversations };

