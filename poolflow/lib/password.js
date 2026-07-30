'use strict';

// Password hashing with node's built-in scrypt so the MVP has no auth dependency to
// audit. Stored format: scrypt$<salt-hex>$<hash-hex>

const crypto = require('node:crypto');

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_LENGTH = 10;

function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_LENGTH) {
    throw new Error('Password must be at least ' + MIN_LENGTH + ' characters');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const expected = Buffer.from(parts[2], 'hex');
  let candidate;
  try {
    candidate = crypto.scryptSync(plain, parts[1], expected.length, SCRYPT_OPTIONS);
  } catch (err) {
    return false;
  }
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { hashPassword, verifyPassword, MIN_LENGTH };

