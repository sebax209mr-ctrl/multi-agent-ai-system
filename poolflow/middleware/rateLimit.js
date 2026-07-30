'use strict';

// Fixed-window, in-process rate limiting.
//
// OPEN QUESTION for review, not a silent decision: these counters live in one process's
// memory. That is fine for a single-instance pilot, but the moment we run two instances
// (or anything serverless) the effective limit multiplies per instance and resets on every
// cold start. Inbound SMS is the endpoint that genuinely needs abuse protection, because
// anyone who learns the business number can make us spend Anthropic tokens and Twilio
// segments. Before advertising the number publicly, move this to Redis or push the
// throttle up to Twilio.

const { tooManyRequests } = require('./errors');

function createRateLimiter(options) {
  const windowMs = options.windowMs;
  const max = options.max;
  const name = options.name || 'default';
  const keyFn = options.keyFn || ((req) => req.ip);
  const buckets = new Map();
  let lastSweep = 0;

  // Stop the map growing forever on a long-lived process.
  function sweep(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      sweep(now);
      lastSweep = now;
    }

    const key = String(keyFn(req) || 'unknown');
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      console.warn('[poolflow] rate limit hit', { limiter: name, key, retryAfter });
      return next(tooManyRequests('Too many requests. Try again in ' + retryAfter + ' seconds.'));
    }
    return next();
  };
}

// Sign-in: slow credential stuffing without locking out an owner who fat-fingers twice.
const loginLimiter = createRateLimiter({
  name: 'login',
  windowMs: 10 * 60 * 1000,
  max: 20,
});

// Inbound SMS: keyed on the sending phone number, NOT the IP. Every request arrives from
// Twilio's own IP range, so per-IP limiting would throttle every business at once.
const inboundSmsLimiter = createRateLimiter({
  name: 'inbound_sms',
  windowMs: 60 * 1000,
  max: 12,
  keyFn: (req) => (req.body && req.body.From) || req.ip,
});

// Blunt ceiling on the authenticated API so a runaway dashboard poll cannot pin the box.
const apiLimiter = createRateLimiter({
  name: 'api',
  windowMs: 60 * 1000,
  max: 300,
  keyFn: (req) => (req.user ? 'user:' + req.user.id : 'ip:' + req.ip),
});

// The reminder cron is called once a day; anything more is a misconfigured scheduler.
const cronLimiter = createRateLimiter({
  name: 'cron',
  windowMs: 60 * 1000,
  max: 5,
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  inboundSmsLimiter,
  apiLimiter,
  cronLimiter,
};

