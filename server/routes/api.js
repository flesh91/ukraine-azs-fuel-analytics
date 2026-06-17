'use strict';
const { Router } = require('express');
const { getAnalytics, getCacheInfo } = require('../controllers/analyticsController');

const router = Router();

/**
 * GET /api/analytics
 *   ?brand=okko&fuelType=A-95%2B&startDate=2026-01-01&endDate=2026-06-17&mode=day
 */
router.get('/analytics', getAnalytics);

/**
 * GET /api/cache-info
 * Returns a summary of locally cached month files in data/ directory.
 */
router.get('/cache-info', getCacheInfo);

module.exports = router;
