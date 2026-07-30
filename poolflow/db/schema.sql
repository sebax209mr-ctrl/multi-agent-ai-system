-- PoolFlow v1 schema (SQLite)
--
-- Scope note: no payments/invoicing, no route optimization, no calendar sync and no
-- vertical-specific tables. The property-management and construction variants must reuse
-- these tables and only relabel in the UI (Job -> "maintenance request" / "site visit",
-- Customer -> "tenant" / "client"). Flag to Seba before adding vertical-specific schema.

PRAGMA foreign_keys = ON;

-- One row per pool-service company using the product.
CREATE TABLE IF NOT EXISTS businesses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  timezone       TEXT    NOT NULL DEFAULT 'America/Los_Angeles',
  -- OPEN QUESTION (flag, do not silently decide): one Twilio number per business, or one
  -- shared number with routing? This column supports per-business provisioning; the shared
  -- model would need a routing table instead.
  twilio_number  TEXT    UNIQUE,
  workday_start  TEXT    NOT NULL DEFAULT '08:00',
  workday_end    TEXT    NOT NULL DEFAULT '17:00',
  -- comma separated ISO weekday numbers, 1 = Monday
  workdays       TEXT    NOT NULL DEFAULT '1,2,3,4,5',
  slot_minutes   INTEGER NOT NULL DEFAULT 60,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Owner / tech logins. Every API request is scoped to the caller's business_id.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','tech')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);

-- Leads and customers share one table; status is the funnel.
CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT,
  phone       TEXT    NOT NULL,
  email       TEXT,
  address     TEXT,
  status      TEXT    NOT NULL DEFAULT 'lead'
                CHECK (status IN ('lead','active','paused','lost')),
  plan        TEXT    CHECK (plan IS NULL OR plan IN ('one_time','weekly','biweekly','monthly')),
  notes       TEXT,
  source      TEXT    NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','sms','web')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_business_status ON customers(business_id, status);
-- A phone number identifies a customer within a business. The inbound SMS handler relies
-- on this being unique so it never creates duplicate leads for a repeat texter.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_phone ON customers(business_id, phone);

-- A scheduled visit. starts_at / ends_at are stored as 'YYYY-MM-DD HH:MM' local to the
-- business timezone so that week queries and slot maths stay simple in v1.
CREATE TABLE IF NOT EXISTS jobs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id      INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  starts_at        TEXT    NOT NULL,
  ends_at          TEXT    NOT NULL,
  service_type     TEXT    NOT NULL DEFAULT 'maintenance'
                     CHECK (service_type IN ('maintenance','repair','cleaning','inspection','other')),
  status           TEXT    NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','completed','no_show','canceled')),
  notes            TEXT,
  created_by       TEXT    NOT NULL DEFAULT 'owner'
                     CHECK (created_by IN ('owner','agent')),
  reminder_sent_at TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_business_start ON jobs(business_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
-- Cheap double-booking guard at the storage layer. The booking agent also checks in
-- application code inside a transaction, but this makes a race physically impossible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_no_double_booking
  ON jobs(business_id, starts_at)
  WHERE status IN ('scheduled','completed');

-- One SMS thread per customer. needs_human is what the dashboard flags for escalation.
CREATE TABLE IF NOT EXISTS conversations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','booked','needs_human','closed')),
  intent          TEXT    NOT NULL DEFAULT 'unknown'
                    CHECK (intent IN ('unknown','new_booking','reschedule','other')),
  turn_count      INTEGER NOT NULL DEFAULT 0,
  escalated_at    TEXT,
  last_message_at TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_business_status
  ON conversations(business_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT    NOT NULL CHECK (direction IN ('inbound','outbound')),
  author          TEXT    NOT NULL DEFAULT 'customer'
                    CHECK (author IN ('customer','agent','owner','system')),
  body            TEXT    NOT NULL,
  provider_sid    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
-- Twilio retries webhooks. Ignoring a repeated MessageSid keeps the agent from replying twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_sid
  ON messages(provider_sid) WHERE provider_sid IS NOT NULL;

-- Append-only trail of what the SMS layer actually sent, for debugging pilots.
CREATE TABLE IF NOT EXISTS sms_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  to_number   TEXT NOT NULL,
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('reminder','agent_reply','other')),
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sent','failed','skipped_no_credentials')),
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
