'use strict';

// Tenant scoping middleware.
//
// The rule for the whole codebase: no route handler is allowed to look a row up by id
// alone. It goes through the helpers here, which always add business_id to the WHERE
// clause. A cross-tenant id therefore returns 404 (not 403) so an attacker cannot use the
// API to probe which customer ids exist in other accounts.

const { db } = require('../db');

function scopeToBusiness(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  req.businessId = req.user.business_id;
  return next();
}

const customerStmt = () =>
  db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?');
const jobStmt = () =>
  db.prepare('SELECT * FROM jobs WHERE id = ? AND business_id = ?');
const conversationStmt = () =>
  db.prepare('SELECT * FROM conversations WHERE id = ? AND business_id = ?');

function findCustomer(businessId, id) {
  return customerStmt().get(Number(id), businessId) || null;
}

function findJob(businessId, id) {
  return jobStmt().get(Number(id), businessId) || null;
}

function findConversation(businessId, id) {
  return conversationStmt().get(Number(id), businessId) || null;
}

// Route-param loaders. Use as app.param-style middleware so handlers stay short.
function loadCustomer(req, res, next) {
  const row = findCustomer(req.businessId, req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Customer not found.' });
  req.customer = row;
  return next();
}

function loadJob(req, res, next) {
  const row = findJob(req.businessId, req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Job not found.' });
  req.job = row;
  return next();
}

function loadConversation(req, res, next) {
  const row = findConversation(req.businessId, req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
  }
  req.conversation = row;
  return next();
}

module.exports = {
  scopeToBusiness,
  findCustomer,
  findJob,
  findConversation,
  loadCustomer,
  loadJob,
  loadConversation,
};

