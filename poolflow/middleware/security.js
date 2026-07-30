'use strict';

// Security headers and request logging.
//
// The pages and the API are served from the same origin, so there is deliberately NO CORS
// middleware anywhere in this codebase. If a client on another origin ever needs the API,
// that should be a conscious decision at that point rather than a wildcard left lying
// around from day one.
//
// The CSP is strict-by-default: no inline scripts, no CDNs. That is the reason the
// front-end is plain files under public/ with external .js and .css and no build step.

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.set('Content-Security-Policy', CSP);
  res.removeHeader('X-Powered-By');
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  return next();
}

// Customer lists and schedules must not sit in a shared cache or in the back button after
// sign-out.
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  return next();
}

// One line per request. No message bodies, no phone numbers: this log will end up in a
// hosting provider's dashboard, and customer contact details do not belong there.
function requestLog(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      '[poolflow] ' + req.method + ' ' + req.originalUrl.split('?')[0] +
      ' ' + res.statusCode + ' ' + ms.toFixed(0) + 'ms' +
      (req.user ? ' business=' + req.user.business_id : '')
    );
  });
  return next();
}

module.exports = { securityHeaders, noStore, requestLog, CSP };

