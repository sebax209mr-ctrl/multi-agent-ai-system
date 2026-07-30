'use strict';

// GET /api/dashboard?week=YYYY-MM-DD
//
// One request, one screen. The dashboard is the page an operator opens at 6am on their
// phone, so it does not make five round trips to render three numbers.

const express = require('express');
const { validateQuery } = require('../middleware/validate');
const dashboard = require('../services/dashboard');

const router = express.Router();

router.get('/', validateQuery({ week: { type: 'date' } }), (req, res) => {
  return res.json(dashboard.summary(req.businessId, req.valid.week));
});

module.exports = router;

