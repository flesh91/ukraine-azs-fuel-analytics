'use strict';
const { getAnalyticsData } = require('../services/dataService');
const cacheRepo            = require('../repositories/cacheRepository');

/**
 * GET /api/analytics
 * Query params: brand, fuelType, startDate, endDate, mode
 */
async function getAnalytics(req, res, next) {
  try {
    const { brand, fuelType, startDate, endDate, mode = 'day' } = req.query;

    if (!brand || !fuelType || !startDate || !endDate) {
      return res.status(400).json({
        error: "Обов'язкові параметри: brand, fuelType, startDate, endDate",
      });
    }

    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Невірний формат дати. Використовуйте YYYY-MM-DD.' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'startDate не може бути пізніше endDate.' });
    }
    if (!['day', 'month'].includes(mode)) {
      return res.status(400).json({ error: 'mode має бути "day" або "month".' });
    }

    const result = await getAnalyticsData({ brand, fuelType, startDate, endDate, mode });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/cache-info
 * Returns a summary of locally cached data files.
 */
function getCacheInfo(req, res) {
  const files = cacheRepo.summary();
  const count = Object.keys(files).length;
  const totalBytes = Object.values(files).reduce((a, b) => a + b, 0);
  res.json({ count, totalBytes, files });
}

module.exports = { getAnalytics, getCacheInfo };
