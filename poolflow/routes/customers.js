'use strict';

// Customer / lead CRUD.
//
//   POST   /api/customers        create lead or customer
//   GET    /api/customers        list, filter by status
//   GET    /api/customers/:id    one record plus its visit history
//   PATCH  /api/customers/:id    update status / plan / notes / contact details
//
// A lead and a customer are the same row; status is the funnel. There is no DELETE:
// operators mark someone 'lost' instead, because a deleted record takes its job history
// with it and support questions become unanswerable.

const express = require('express');
const { db } = require('../db');
const { validateBody, validateQuery, requireAny } = require('../middleware/validate');
const { loadCustomer } = require('../middleware/tenant');
const { displayPhone } = require('../lib/phone');

const router = express.Router();

const STATUSES = ['lead', 'active', 'paused', 'lost'];
const PLANS = ['one_time', 'weekly', 'biweekly', 'monthly'];

function present(row) {
  return Object.assign({}, row, { phone_display: displayPhone(row.phone) });
}

// ---------------------------------------------------------------------------
// GET /api/customers?status=lead&q=smith
// ---------------------------------------------------------------------------
router.get(
  '/',
  validateQuery({
    status: { type: 'enum', values: STATUSES },
    q: { type: 'string', maxLength: 80 },
    limit: { type: 'int', min: 1, max: 500, default: 200 },
  }),
  (req, res) => {
    const clauses = ['business_id = ?'];
    const args = [req.businessId];

    if (req.valid.status) {
      clauses.push('status = ?');
      args.push(req.valid.status);
    }
    if (req.valid.q) {
      // Name, phone or address. Enough for an operator with a few hundred customers;
      // revisit if anyone ever gets past a few thousand.
      clauses.push('(name LIKE ? OR phone LIKE ? OR address LIKE ?)');
      const like = '%' + req.valid.q + '%';
      args.push(like, like, like);
    }

    const rows = db
      .prepare(
        'SELECT * FROM customers WHERE ' + clauses.join(' AND ') +
        " ORDER BY CASE status WHEN 'lead' THEN 0 WHEN 'active' THEN 1 ELSE 2 END," +
        '          datetime(updated_at) DESC LIMIT ?'
      )
      .all(...args, req.valid.limit);

    return res.json({ customers: rows.map(present), count: rows.length });
  }
);

// ---------------------------------------------------------------------------
// POST /api/customers
// ---------------------------------------------------------------------------
router.post(
  '/',
  validateBody({
    name: { type: 'string', maxLength: 120 },
    phone: { type: 'phone', required: true },
    email: { type: 'email' },
    address: { type: 'string', maxLength: 240 },
    status: { type: 'enum', values: STATUSES, default: 'lead' },
    plan: { type: 'enum', values: PLANS, nullable: true },
    notes: { type: 'string', maxLength: 2000 },
  }),
  (req, res) => {
    const v = req.valid;

    // The phone number is the identity of the SMS flow, so a repeat number returns the
    // existing record rather than a duplicate. The operator re-adding someone they already
    // have should land on that person, not create a second one.
    const existing = db
      .prepare('SELECT * FROM customers WHERE business_id = ? AND phone = ?')
      .get(req.businessId, v.phone);

    if (existing) {
      return res.status(200).json({
        customer: present(existing),
        created: false,
        message: 'A customer with that number already existed, so we returned it unchanged.',
      });
    }

    const info = db
      .prepare(
        'INSERT INTO customers (business_id, name, phone, email, address, status, plan, notes, source)' +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')"
      )
      .run(
        req.businessId,
        v.name || null,
        v.phone,
        v.email || null,
        v.address || null,
        v.status,
        v.plan === undefined ? null : v.plan,
        v.notes || null
      );

    const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({ customer: present(created), created: true });
  }
);

// ---------------------------------------------------------------------------
// GET /api/customers/:id
// ---------------------------------------------------------------------------
router.get('/:id', loadCustomer, (req, res) => {
  const jobs = db
    .prepare('SELECT * FROM jobs WHERE customer_id = ? ORDER BY starts_at DESC LIMIT 50')
    .all(req.customer.id);

  const conversations = db
    .prepare(
      'SELECT id, status, intent, turn_count, last_message_at FROM conversations' +
      ' WHERE customer_id = ? ORDER BY id DESC LIMIT 10'
    )
    .all(req.customer.id);

  return res.json({ customer: present(req.customer), jobs, conversations });
});

// ---------------------------------------------------------------------------
// PATCH /api/customers/:id
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  loadCustomer,
  validateBody({
    name: { type: 'string', maxLength: 120, nullable: true },
    phone: { type: 'phone' },
    email: { type: 'email', nullable: true },
    address: { type: 'string', maxLength: 240, nullable: true },
    status: { type: 'enum', values: STATUSES },
    plan: { type: 'enum', values: PLANS, nullable: true },
    notes: { type: 'string', maxLength: 2000, nullable: true },
  }),
  requireAny(['name', 'phone', 'email', 'address', 'status', 'plan', 'notes']),
  (req, res) => {
    const fields = ['name', 'phone', 'email', 'address', 'status', 'plan', 'notes'];
    const sets = [];
    const args = [];

    for (const field of fields) {
      if (req.valid[field] === undefined) continue;
      sets.push(field + ' = ?');
      args.push(req.valid[field]);
    }

    db.prepare(
      "UPDATE customers SET " + sets.join(', ') + ", updated_at = datetime('now')" +
      ' WHERE id = ? AND business_id = ?'
    ).run(...args, req.customer.id, req.businessId);

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
    return res.json({ customer: present(updated) });
  }
);

module.exports = router;

