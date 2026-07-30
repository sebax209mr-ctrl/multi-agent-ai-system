'use strict';

// Declarative request validation.
//
// Hand-rolled on purpose rather than pulling in a schema library: the API surface is nine
// endpoints, and this guarantees one error shape everywhere --
//   400 { error: 'validation_failed', message, details: { field: 'reason' } }
// which public/js/api.js renders straight next to the offending input.
//
// Handlers read req.valid, never req.body, so an unvalidated field cannot reach SQL.

const { HttpError } = require('./errors');
const { normalizePhone } = require('../lib/phone');
const time = require('../lib/time');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const COERCERS = {
  string(value, rule) {
    if (typeof value !== 'string') return { error: 'must be text' };
    const out = rule.trim === false ? value : value.trim();
    if (rule.minLength && out.length < rule.minLength) {
      return { error: 'must be at least ' + rule.minLength + ' characters' };
    }
    if (rule.maxLength && out.length > rule.maxLength) {
      return { error: 'must be ' + rule.maxLength + ' characters or fewer' };
    }
    return { value: out };
  },

  int(value, rule) {
    const n = Number(value);
    if (!Number.isInteger(n)) return { error: 'must be a whole number' };
    if (rule.min !== undefined && n < rule.min) return { error: 'must be at least ' + rule.min };
    if (rule.max !== undefined && n > rule.max) return { error: 'must be at most ' + rule.max };
    return { value: n };
  },

  bool(value) {
    if (typeof value === 'boolean') return { value };
    if (value === 'true' || value === '1' || value === 1) return { value: true };
    if (value === 'false' || value === '0' || value === 0) return { value: false };
    return { error: 'must be true or false' };
  },

  enum(value, rule) {
    if (!rule.values.includes(value)) {
      return { error: 'must be one of: ' + rule.values.join(', ') };
    }
    return { value };
  },

  phone(value) {
    const normalized = normalizePhone(value);
    if (!normalized) return { error: 'must be a valid phone number' };
    return { value: normalized };
  },

  email(value) {
    const s = String(value).trim().toLowerCase();
    if (!EMAIL_RE.test(s)) return { error: 'must be a valid email address' };
    return { value: s };
  },

  date(value) {
    if (!time.isDate(value)) return { error: 'must be a date (YYYY-MM-DD)' };
    return { value };
  },

  datetime(value) {
    if (!time.isDateTime(value)) return { error: 'must be a date and time (YYYY-MM-DD HH:MM)' };
    return { value };
  },

  clock(value) {
    if (!time.isTime(value)) return { error: 'must be a time (HH:MM)' };
    return { value };
  },
};

function run(schema, input) {
  const details = {};
  const out = {};
  const source = input || {};

  for (const field of Object.keys(schema)) {
    const rule = schema[field];
    const raw = source[field];

    if (raw === null) {
      if (rule.nullable) { out[field] = null; continue; }
      details[field] = 'cannot be empty';
      continue;
    }
    if (raw === undefined || raw === '') {
      if (rule.required) details[field] = 'is required';
      else if (rule.default !== undefined) out[field] = rule.default;
      continue;
    }

    const coerce = COERCERS[rule.type];
    if (!coerce) throw new Error('validate: unknown rule type ' + rule.type);

    const result = coerce(raw, rule);
    if (result.error) details[field] = result.error;
    else out[field] = result.value;
  }

  return { out, details };
}

function make(schema, source) {
  return function validateMiddleware(req, res, next) {
    const input = source === 'query' ? req.query : req.body;
    const { out, details } = run(schema, input);
    if (Object.keys(details).length > 0) {
      return next(new HttpError(400, 'validation_failed', 'Some fields need fixing.', details));
    }
    req.valid = Object.assign({}, req.valid, out);
    return next();
  };
}

const validateBody = (schema) => make(schema, 'body');
const validateQuery = (schema) => make(schema, 'query');

// PATCH endpoints: refuse a no-op instead of pretending it succeeded.
function requireAny(fields) {
  return function requireAnyMiddleware(req, res, next) {
    const provided = fields.some((f) => req.valid && req.valid[f] !== undefined);
    if (!provided) {
      return next(new HttpError(400, 'validation_failed', 'Nothing to update.', {
        _form: 'provide at least one of: ' + fields.join(', '),
      }));
    }
    return next();
  };
}

module.exports = { validateBody, validateQuery, requireAny, run, COERCERS };

