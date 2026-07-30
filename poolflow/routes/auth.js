'use strict';

// Auth routes.
//
// There is deliberately no public signup endpoint in v1. Each pilot operator's account is
// created with 'npm run seed' or by hand, because self-serve signup drags in email
// verification, password reset and abuse handling - none of which has validated demand at
// one pilot customer.

const express = require('express');
const { db } = require('../db');
const { verifyPassword } = require('../lib/password');
const { startSession, endSession, requireAuth } = require('../middleware/session');
const { validateBody } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimit');
const { HttpError } = require('../middleware/errors');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    business_id: user.business_id,
    business_name: user.business_name,
    timezone: user.timezone,
    workday_start: user.workday_start,
    workday_end: user.workday_end,
    workdays: user.workdays,
    slot_minutes: user.slot_minutes,
    sms_number: user.twilio_number,
  };
}

router.post(
  '/login',
  loginLimiter,
  validateBody({
    email: { type: 'email', required: true },
    // No length rule on sign-in: policy belongs at the point a password is chosen, and a
    // 'too short' response here would leak that the account exists.
    password: { type: 'string', required: true, trim: false },
  }),
  (req, res, next) => {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(req.valid.email);

    if (!user || !verifyPassword(req.valid.password, user.password_hash)) {
      return next(new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.'));
    }

    startSession(res, user);

    const full = db
      .prepare(
        'SELECT u.*, b.name AS business_name, b.timezone, b.twilio_number,' +
        '       b.workday_start, b.workday_end, b.workdays, b.slot_minutes' +
        '  FROM users u JOIN businesses b ON b.id = u.business_id WHERE u.id = ?'
      )
      .get(user.id);

    return res.json({ user: publicUser(full) });
  }
);

router.post('/logout', (req, res) => {
  endSession(res);
  return res.json({ ok: true });
});

// Used by every page on load to decide whether to render or bounce to sign-in.
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

module.exports = router;

