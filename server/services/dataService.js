'use strict';
const NodeCache = require('node-cache');
const config    = require('../config');

const { getFuelPrices } = require('../repositories/fuelRepository');
const { getOilPrices  } = require('../repositories/oilRepository');
const { getNbuRates   } = require('../repositories/nbuRepository');
const cache             = require('../repositories/cacheRepository');

const { getMonthRange, forwardFill, isCurrentMonth } = require('../utils/dateUtils');
const {
  mergeAllDatasets,
  processNormalizeAndTaxClean,
  calculateFairPriceWithTaxes,
  pearson,
  detectAnomalies,
  aggregateMonthly,
} = require('./analyticsService');

// Short-lived in-memory cache to avoid re-processing on rapid identical requests
const memCache = new NodeCache({ stdTTL: config.cacheTtl, checkperiod: 300 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch fuel prices for one month, using local JSON cache for past months.
 */
async function fetchFuelMonth(brand, month, fuelType) {
  const cacheKey = `${brand}:${fuelType}`;
  if (!isCurrentMonth(month) && cache.has('fuel', cacheKey, month)) {
    return cache.read('fuel', cacheKey, month);
  }
  const data = await getFuelPrices(brand, month, fuelType);
  if (data.length > 0 && !isCurrentMonth(month)) {
    cache.write('fuel', cacheKey, month, data);
  }
  return data;
}

/**
 * Fetch Brent oil prices for one month, using local JSON cache for past months.
 */
async function fetchOilMonth(month) {
  if (!isCurrentMonth(month) && cache.has('oil', '', month)) {
    return cache.read('oil', '', month);
  }
  const data = await getOilPrices(month);
  if (data.length > 0 && !isCurrentMonth(month)) {
    cache.write('oil', '', month, data);
  }
  return data;
}

/**
 * Fetch NBU rates for a full month, using local JSON cache for past months.
 * Extends the NBU query 7 days before startIso to seed the forward-fill
 * for cases where the period starts on a weekend.
 */
async function fetchNbuMonth(month, valcode, startIso, endIso) {
  if (!isCurrentMonth(month) && cache.has('nbu', valcode, month)) {
    return cache.read('nbu', valcode, month);
  }
  const data = await getNbuRates(startIso, endIso, valcode);
  if (data.length > 0 && !isCurrentMonth(month)) {
    cache.write('nbu', valcode, month, data);
  }
  return data;
}

// ─── Main orchestration ───────────────────────────────────────────────────────

/**
 * Build the full analytics result for a given set of parameters.
 *
 * Pipeline:
 *   1. Resolve months in range
 *   2. Fetch fuel / oil / NBU rates (local JSON cache → network)
 *   3. Bug #2 fix: forward-fill NBU rates so weekends are covered
 *   4. Merge datasets (inner join on calendar date)
 *   5. Apply tax cleaning + linear regression
 *   6. Compute anomalies + Pearson correlation
 *   7. Optional monthly aggregation
 *
 * @param {object} params
 * @param {string} params.brand
 * @param {string} params.fuelType
 * @param {string} params.startDate  ISO date 'YYYY-MM-DD'
 * @param {string} params.endDate    ISO date 'YYYY-MM-DD'
 * @param {string} params.mode       'day' | 'month'
 */
async function getAnalyticsData({ brand, fuelType, startDate, endDate, mode, lag = 0 }) {
  const memKey = `${brand}|${fuelType}|${startDate}|${endDate}|${mode}|${lag}`;
  const cached = memCache.get(memKey);
  if (cached) return cached;

  const startObj = new Date(startDate);
  const endObj   = new Date(endDate);
  const months   = getMonthRange(startObj, endObj);

  // Extend NBU start at least lag + 7 days earlier to seed forward-fill and cover lag shift
  const nbuSeedDate    = new Date(startObj);
  nbuSeedDate.setUTCDate(nbuSeedDate.getUTCDate() - (lag + 7));
  const nbuSeedIso     = nbuSeedDate.toISOString().split('T')[0];
  const nbuSeedMonths  = getMonthRange(nbuSeedDate, endObj);

  // Fetch fuel for selected months
  let rawFuel = [];
  await Promise.all(months.map(async month => {
    const fuel = await fetchFuelMonth(brand, month, fuelType);
    rawFuel = rawFuel.concat(fuel);
  }));

  // Fetch Brent oil for the extended month range (due to lag lookup)
  let rawOil = [];
  await Promise.all(nbuSeedMonths.map(async month => {
    const oil = await fetchOilMonth(month);
    rawOil = rawOil.concat(oil);
  }));

  // NBU rates: fetch from seed date to ensure forward-fill coverage
  let rawUsd = [], rawEur = [];
  await Promise.all(nbuSeedMonths.map(async month => {
    const [usd, eur] = await Promise.all([
      fetchNbuMonth(month, 'usd', nbuSeedIso, endDate),
      fetchNbuMonth(month, 'eur', nbuSeedIso, endDate),
    ]);
    rawUsd = rawUsd.concat(usd);
    rawEur = rawEur.concat(eur);
  }));

  // Bug #2 fix: forward-fill NBU rates to cover weekends/public holidays starting from the seed date
  const usdFilled = forwardFill(rawUsd, nbuSeedDate, endObj);
  const eurFilled = forwardFill(rawEur, nbuSeedDate, endObj);

  // Merge all four datasets (inner join on date)
  let data = mergeAllDatasets(rawFuel, rawOil, usdFilled, eurFilled, lag);
  data     = data.filter(d => d.date >= startObj && d.date <= endObj);

  if (!data.length) {
    const empty = { data: [], anomalies: [], correlation: null, count: 0, cached: false };
    return empty;
  }

  // Apply analytics pipeline
  data = processNormalizeAndTaxClean(data, fuelType);
  data = calculateFairPriceWithTaxes(data);

  const anomalies = detectAnomalies(data);

  // Bug #5 fix: correlation only on non-distorted (positive) fuelClean points
  const validForCorr = data.filter(d => d.fuelClean > 0);
  const correlation  = validForCorr.length >= 2
    ? pearson(validForCorr.map(d => d.fuelClean), validForCorr.map(d => d.oilUah))
    : null;

  if (mode === 'month') data = aggregateMonthly(data);

  const result = { data, anomalies, correlation, count: data.length };
  memCache.set(memKey, result);
  return result;
}

module.exports = { getAnalyticsData };
