'use strict';

// Error plumbing. Every failure leaves the API in the same shape:
//   { error: '<machine_code>', message: '<human sentence>', details?: {...} }
// so public/js/api.js has exactly one error path to render.

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details || null;
    this.expected = true;
  }
}

const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
const unauthorized = (message) => new HttpError(401, 'not_authenticated', message || 'Please sign in.');
const forbidden = (message) => new HttpError(403, 'forbidden', message || 'Not allowed.');
const notFoundError = (message) => new HttpError(404, 'not_found', message || 'Not found.');
const conflict = (message, details) => new HttpError(409, 'conflict', message, details);
const tooManyRequests = (message) => new HttpError(429, 'rate_limited', message || 'Too many requests.');

// 404 for anything under /api that no router claimed.
function notFound(req, res, next) {
  next(new HttpError(404, 'not_found', 'No such endpoint: ' + req.method + ' ' + req.path));
}

function isConstraintError(err) {
  return typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = err.status || 500;
  let code = err.code || 'server_error';
  let message = err.message || 'Something went wrong.';
  let details = err.details || undefined;

  // Translate the storage-level guards into something a human can act on.
  if (!err.expected && isConstraintError(err)) {
    status = 409;
    code = 'conflict';
    message = 'That record conflicts with one that already exists.';
    const text = String(err.message);
    if (text.includes('idx_jobs_no_double_booking')) {
      message = 'That time slot was just taken. Pick another one.';
    } else if (text.includes('idx_customers_business_phone')) {
      message = 'A customer with that phone number already exists.';
    }
  }

  // 5xx means we have a bug: log it with context, never leak the stack to the client.
  if (status >= 500) {
    console.error('[poolflow] unhandled error', {
      method: req.method,
      path: req.originalUrl,
      business_id: req.user ? req.user.business_id : null,
      message: err.message,
      stack: err.stack,
    });
    message = 'Something went wrong on our side. Try again in a moment.';
    details = undefined;
  }

  const payload = { error: code, message };
  if (details) payload.details = details;
  res.status(status).json(payload);
}

// Wrap async handlers so a rejected promise reaches errorHandler instead of hanging.
function asyncRoute(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFoundError,
  conflict,
  tooManyRequests,
  notFound,
  errorHandler,
  asyncRoute,
};

