'use strict';

// PoolFlow - entry point.
//
// This serves a WEBSITE, not a single-page app: every screen is a real server-rendered URL
// (/dashboard, /customers, /schedule, /conversations) that works on its own, is
// bookmarkable, and degrades to a plain page if JavaScript is slow. There is no bundler, no
// client-side router and no framework - which is also why the strict CSP in
// middleware/security.js can forbid inline script and third-party origins outright.
//
// Responsive web only. A native mobile app is explicitly out of scope for v1.

require('dotenv').config();

const path = require('node:path');
const express = require('express');

const { migrate, DB_FILE } = require('./db');
const { attachUser, requirePage } = require('./middleware/session');
const { securityHeaders, requestLog } = require('./middleware/security');
const { errorHandler } = require('./middleware/errors');

// Schema is idempotent, so applying it on boot means a fresh deploy or a new pilot machine
// needs no separate migration step.
migrate();

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
// Behind a hosting provider's proxy, req.ip is otherwise the proxy for every request and
// the rate limiter would treat the whole internet as one caller.
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(requestLog);
app.use(attachUser);

// ---------------------------------------------------------------------------
// Static assets
//
// Mounted per-directory rather than as one express.static(PUBLIC_DIR). That way the HTML
// under public/app/ is reachable only through the guarded routes below, instead of also
// being downloadable at /app/dashboard.html by anyone who guesses the path.
// ---------------------------------------------------------------------------
const assetOptions = { maxAge: '1h', index: false, redirect: false };
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), assetOptions));
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), assetOptions));
app.use('/img', express.static(path.join(PUBLIC_DIR, 'img'), assetOptions));

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
function page(file) {
  return function sendPage(req, res) {
    res.sendFile(path.join(PUBLIC_DIR, file));
  };
}

// Public
app.get('/', page('index.html'));
app.get('/login', page('login.html'));

// Signed in. requirePage redirects to /login?next=... instead of returning JSON, because a
// person typing a URL should land on a sign-in form, not on an error object.
app.get('/dashboard', requirePage, page('app/dashboard.html'));
app.get('/customers', requirePage, page('app/customers.html'));
app.get('/schedule', requirePage, page('app/schedule.html'));
app.get('/conversations', requirePage, page('app/conversations.html'));

// For uptime checks. Deliberately says nothing about versions, hosts or the environment.
app.get('/healthz', (req, res) => res.json({ ok: true, uptime_seconds: Math.round(process.uptime()) }));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.use('/api', require('./routes'));

// Unknown page -> HTML 404. Unknown /api path already returned JSON inside routes/index.js.
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.use(errorHandler);

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
  app.listen(port, () => {
    console.log('[poolflow] listening on http://localhost:' + port);
    console.log('[poolflow] database ' + DB_FILE);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('[poolflow] no ANTHROPIC_API_KEY - booking agent runs its scripted fallback');
    }
    if (!process.env.TWILIO_ACCOUNT_SID) {
      console.log('[poolflow] no Twilio credentials - outbound SMS is logged, not sent');
    }
  });
}

module.exports = app;
