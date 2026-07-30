'use strict';

// npm run seed
//
// Creates one demo pool-service business with a realistic week so the dashboard, the week
// view and the escalation queue can all be looked at without typing data in by hand. This
// is what you put in front of a real operator in weeks 1-4 of the build order.
//
// Idempotent: running it again reuses the existing demo business instead of stacking up
// duplicates.

require('dotenv').config();

const { db, migrate } = require('./index');
const { hashPassword } = require('../lib/password');
const { normalizePhone } = require('../lib/phone');
const time = require('../lib/time');

const DEMO_EMAIL = 'owner@bluewaterpools.test';
const DEMO_PASSWORD = 'poolflow-demo-2026';
const DEMO_BUSINESS = 'Bluewater Pool Service';

migrate();

function upsertBusiness() {
  const existing = db.prepare('SELECT * FROM businesses WHERE name = ?').get(DEMO_BUSINESS);
  if (existing) return existing;

  const info = db
    .prepare(
      'INSERT INTO businesses (name, timezone, twilio_number, workday_start, workday_end,' +
      ' workdays, slot_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(DEMO_BUSINESS, 'America/Phoenix', normalizePhone('+15550100000'), '08:00', '17:00', '1,2,3,4,5', 60);

  return db.prepare('SELECT * FROM businesses WHERE id = ?').get(info.lastInsertRowid);
}

function upsertOwner(business) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
  if (existing) return existing;

  const info = db
    .prepare('INSERT INTO users (business_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(business.id, DEMO_EMAIL, 'Dana Ortiz', hashPassword(DEMO_PASSWORD), 'owner');

  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

const PEOPLE = [
  { name: 'Marisol Reyes',  phone: '+15550101001', status: 'active', plan: 'weekly',   address: '412 Cactus Wren Dr' },
  { name: 'Tom Whitfield',  phone: '+15550101002', status: 'active', plan: 'biweekly', address: '88 Palo Verde Ln' },
  { name: 'Priya Raman',    phone: '+15550101003', status: 'active', plan: 'weekly',   address: '1207 Saguaro Ct' },
  { name: 'Dale Hutchins',  phone: '+15550101004', status: 'paused', plan: 'monthly',  address: '5 Mesquite Row' },
  { name: 'Angela Boone',   phone: '+15550101005', status: 'lead',   plan: null,       address: '733 Ocotillo Way' },
  { name: null,             phone: '+15550101006', status: 'lead',   plan: null,       address: null },
  { name: 'Ken Adeyemi',    phone: '+15550101007', status: 'lead',   plan: null,       address: '19 Ironwood Pl' },
  { name: 'Sofia Delgado',  phone: '+15550101008', status: 'lost',   plan: null,       address: '640 Yucca St' },
];

function upsertCustomers(business) {
  const insert = db.prepare(
    'INSERT INTO customers (business_id, name, phone, address, status, plan, source, notes)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const find = db.prepare('SELECT * FROM customers WHERE business_id = ? AND phone = ?');
  const out = [];

  for (const person of PEOPLE) {
    const phone = normalizePhone(person.phone);
    const existing = find.get(business.id, phone);
    if (existing) {
      out.push(existing);
      continue;
    }
    const source = person.status === 'lead' ? 'sms' : 'manual';
    const notes = person.name === null ? 'Texted the business line, has not given a name yet.' : null;
    const info = insert.run(business.id, person.name, phone, person.address, person.status, person.plan, source, notes);
    out.push(find.get(business.id, phone));
    void info;
  }
  return out;
}

// A believable week: a few visits behind us marked completed, one no-show, and the rest
// still scheduled ahead. Anchored to the current Monday so the week view is never empty.
function seedJobs(business, customers) {
  const already = db
    .prepare('SELECT COUNT(*) AS n FROM jobs WHERE business_id = ?')
    .get(business.id);
  if (already.n > 0) return already.n;

  const monday = time.startOfWeek(time.today());
  const actives = customers.filter((c) => c.status === 'active' || c.status === 'paused');

  const plan = [
    { dayOffset: 0, clock: '08:00', status: 'completed', type: 'maintenance' },
    { dayOffset: 0, clock: '10:00', status: 'completed', type: 'cleaning' },
    { dayOffset: 1, clock: '09:00', status: 'no_show',   type: 'maintenance' },
    { dayOffset: 1, clock: '13:00', status: 'scheduled', type: 'repair' },
    { dayOffset: 2, clock: '08:00', status: 'scheduled', type: 'maintenance' },
    { dayOffset: 3, clock: '11:00', status: 'scheduled', type: 'inspection' },
    { dayOffset: 4, clock: '14:00', status: 'scheduled', type: 'maintenance' },
  ];

  const insert = db.prepare(
    'INSERT INTO jobs (business_id, customer_id, starts_at, ends_at, service_type, status, notes, created_by)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  let created = 0;
  plan.forEach((entry, index) => {
    const customer = actives[index % actives.length];
    if (!customer) return;
    const startsAt = time.addDays(monday, entry.dayOffset) + ' ' + entry.clock;
    insert.run(
      business.id,
      customer.id,
      startsAt,
      time.addMinutes(startsAt, business.slot_minutes || 60),
      entry.type,
      entry.status,
      entry.status === 'no_show' ? 'Gate was locked, nobody home.' : null,
      'owner'
    );
    created += 1;
  });
  return created;
}

// One thread the agent gave up on, so the escalation queue is not empty on first look.
function seedFlaggedConversation(business, customers) {
  const lead = customers.find((c) => c.status === 'lead' && c.name === 'Ken Adeyemi');
  if (!lead) return;

  const existing = db
    .prepare('SELECT id FROM conversations WHERE business_id = ? AND customer_id = ?')
    .get(business.id, lead.id);
  if (existing) return;

  const info = db
    .prepare(
      "INSERT INTO conversations (business_id, customer_id, status, intent, turn_count," +
      " escalated_at, last_message_at) VALUES (?, ?, 'needs_human', 'new_booking', 4," +
      " datetime('now'), datetime('now'))"
    )
    .run(business.id, lead.id);

  const insert = db.prepare(
    'INSERT INTO messages (conversation_id, direction, author, body) VALUES (?, ?, ?, ?)'
  );
  const thread = [
    ['inbound', 'customer', 'hey do you guys do green pool cleanups'],
    ['outbound', 'agent', 'We do. We have Tuesday Aug 4 at 9:00 AM or Wednesday Aug 5 at 1:00 PM. Which works?'],
    ['inbound', 'customer', 'how much for a full drain and acid wash'],
    ['outbound', 'agent', 'Pricing is something the owner handles - I will have them text you.'],
    ['outbound', 'system', 'FLAGGED FOR OWNER: pricing_or_billing - asked for a drain and acid wash quote.'],
  ];
  for (const [direction, author, body] of thread) {
    insert.run(info.lastInsertRowid, direction, author, body);
  }
}

const business = upsertBusiness();
upsertOwner(business);
const customers = upsertCustomers(business);
seedJobs(business, customers);
seedFlaggedConversation(business, customers);

console.log('');
console.log('[poolflow] seed complete');
console.log('  business : ' + business.name);
console.log('  sign in  : ' + DEMO_EMAIL);
console.log('  password : ' + DEMO_PASSWORD);
console.log('');
console.log('  Demo data only. Change the password before this is ever reachable from the internet.');
console.log('');
