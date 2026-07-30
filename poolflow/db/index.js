'use strict';

// Storage layer. SQLite via better-sqlite3 keeps the pilot deployable as a single process
// with no external database to babysit. Every statement here is synchronous, which is what
// makes the booking transaction in services/booking.js genuinely race-free.

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'poolflow.db');
const DB_FILE = process.env.DATABASE_FILE
  ? path.resolve(process.cwd(), process.env.DATABASE_FILE)
  : DEFAULT_FILE;

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema.sql. Safe to run on every boot: every statement is IF NOT EXISTS.
function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  return db;
}

// Run fn inside a single transaction and return its result.
function tx(fn) {
  return db.transaction(fn)();
}

module.exports = { db, migrate, tx, DB_FILE };

