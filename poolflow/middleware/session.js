'use strict';

// Session middleware.
//
// Stateless signed cookie instead of a server-side session store: one fewer moving part
// for the pilot, and it survives a process restart on a small host. The cookie carries
// only ids, never the email or password hash, and is HttpOnly + SameSite=Lax so page
// navigations work but third-party sites cannot ride the session.

const crypto = require('node:crypto');
const { db } = require('../db');

const COOKIE_NAME = 'pf_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 16 characters. Copy .env.example to .env.'
    );
  }
  return value;
}

function sign(body) {
  return crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
}

function serialize(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + sign(body);
}

function deserialize(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = sign(body);
  if (!mac || mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

// Express does not parse cookies out of the box and cookie-parser is not worth a
// dependency for one cookie.
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch (err) {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

function startSession(res, user) {
  const token = serialize({
    uid: user.id,
    bid: user.business_id,
    exp: Date.now() + MAX_AGE_MS,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function endSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

const selectUser = () =>
  db.prepare(
    'SELECT u.id, u.business_id, u.email, u.name, u.role,' +
    '       b.name AS business_name, b.timezone, b.twilio_number,' +
    '       b.workday_start, b.workday_end, b.workdays, b.slot_minutes' +
    '  FROM users u JOIN businesses b ON b.id = u.business_id' +
    ' WHERE u.id = ?'
  );

// Populates req.user when a valid cookie is present. Never rejects: route guards decide.
function attachUser(req, res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const payload = deserialize(token);
  if (!payload) return next();

  const user = selectUser().get(payload.uid);
  // Cookie could outlive the row, or the user could have been moved between businesses.
  if (!user || user.business_id !== payload.bid) {
    endSession(res);
    return next();
  }
  req.user = user;
  return next();
}

// For /api/* routes: JSON 401, never a redirect, so fetch() callers can react.
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Please sign in.' });
  }
  return next();
}

// For HTML pages: bounce to the sign-in page and remember where they were going.
function requirePage(req, res, next) {
  if (!req.user) {
    const next_url = encodeURIComponent(req.originalUrl || '/dashboard');
    return res.redirect('/login?next=' + next_url);
  }
  return next();
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ error: 'forbidden', message: 'Owner role required.' });
  }
  return next();
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_MS,
  attachUser,
  requireAuth,
  requirePage,
  requireOwner,
  startSession,
  endSession,
  parseCookies,
};

