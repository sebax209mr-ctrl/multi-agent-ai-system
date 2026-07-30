'use strict';

// Phone numbers are the primary key of the whole SMS flow, so they are normalised to
// E.164 at every entry point (manual CRUD form, Twilio webhook, seed data). If the same
// human is stored once as '(555) 010-2030' and once as '+15550102030' the booking agent
// will happily create a duplicate lead and text a stranger, so this is not cosmetic.

const DEFAULT_COUNTRY_CODE = '1';

// Returns E.164 ('+15550102030') or null if it cannot be trusted.
function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;

  if (hadPlus) {
    return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  }
  if (digits.length === 10) return '+' + DEFAULT_COUNTRY_CODE + digits;
  if (digits.length === 11 && digits.startsWith(DEFAULT_COUNTRY_CODE)) return '+' + digits;
  return null;
}

function isValidPhone(input) {
  return normalizePhone(input) !== null;
}

// '+15550102030' -> '(555) 010-2030' for display only. Never store this form.
function displayPhone(e164) {
  if (!e164) return '';
  const s = String(e164);
  if (s.startsWith('+1') && s.length === 12) {
    return '(' + s.slice(2, 5) + ') ' + s.slice(5, 8) + '-' + s.slice(8);
  }
  return s;
}

module.exports = { normalizePhone, isValidPhone, displayPhone, DEFAULT_COUNTRY_CODE };

