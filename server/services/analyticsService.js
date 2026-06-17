'use strict';

// ─── Excise Schedule (EUR / 1000 litres) ─────────────────────────────────────
// Official Ukrainian excise tax rates with annual adjustments.
// Bug #1 fix: jan_27 was declared in original code but never used → 2027 rates added.

const SEP_24 = new Date('2024-09-01');

const PRE_SEP24 = { petrol: 213.50, diesel: 139.50, gas: 52.00 };

// Sorted periods; last entry has to=null (open-ended).
// Annual increment pattern: petrol +29.10, diesel +38.10, gas +25.00.
const EXCISE_PERIODS = [
  { from: new Date('2024-09-01'), to: new Date('2024-12-31'), petrol: 242.60, diesel: 177.60, gas: 148.00 },
  { from: new Date('2025-01-01'), to: new Date('2025-12-31'), petrol: 271.70, diesel: 215.70, gas: 173.00 },
  { from: new Date('2026-01-01'), to: new Date('2026-12-31'), petrol: 300.80, diesel: 253.80, gas: 198.00 },
  { from: new Date('2027-01-01'), to: null,                   petrol: 329.90, diesel: 291.90, gas: 223.00 },
];

function _pickRate(period, fuelType) {
  if (['A-95+', 'A-95', 'A-92'].includes(fuelType)) return period.petrol;
  if (fuelType === 'ДП')  return period.diesel;
  if (fuelType === 'Газ') return period.gas;
  return 0;
}

/**
 * Return excise rate in EUR per 1000 litres for a given fuel type and date.
 */
function getExciseRateEuro(fuelType, date) {
  if (date < SEP_24) return _pickRate(PRE_SEP24, fuelType);

  for (const p of EXCISE_PERIODS) {
    if (date >= p.from && (p.to === null || date <= p.to)) return _pickRate(p, fuelType);
  }
  // Fallback: use last defined period (future-proof)
  return _pickRate(EXCISE_PERIODS[EXCISE_PERIODS.length - 1], fuelType);
}

// ─── Dataset merge ────────────────────────────────────────────────────────────

/**
 * Merge fuel, oil, USD, EUR arrays by calendar date.
 * Only rows where all four sources have data are kept.
 */
function mergeAllDatasets(fuel, oil, usd, eur) {
  const map = new Map();

  for (const f of fuel) {
    map.set(f.date.toDateString(), { date: f.date, fuel: f.val });
  }
  for (const o of oil) {
    const key = o.date.toDateString();
    const entry = map.get(key) || { date: o.date };
    entry.rawOil = o.val;
    map.set(key, entry);
  }
  for (const u of usd) {
    const key = u.date.toDateString();
    const entry = map.get(key) || { date: u.date };
    entry.usd = u.val;
    map.set(key, entry);
  }
  for (const e of eur) {
    const key = e.date.toDateString();
    const entry = map.get(key) || { date: e.date };
    entry.eur = e.val;
    map.set(key, entry);
  }

  return [...map.values()]
    .filter(x => x.fuel !== undefined && x.rawOil !== undefined && x.usd !== undefined && x.eur !== undefined)
    .sort((a, b) => a.date - b.date);
}

// ─── Tax cleaning ─────────────────────────────────────────────────────────────

/**
 * Calculate tax component and derive "clean" fuel price (ex-excise).
 *
 * Formula: taxGrn = (exciseEUR / 1000) × eurRate × 1.2
 *   - exciseEUR/1000 converts the per-1000L rate to per-litre
 *   - ×eurRate converts EUR→UAH
 *   - ×1.2 adds the 20% VAT portion attributable to the excise component
 *     (in Ukraine, VAT base includes excise, so excise tax wedge = excise×1.2)
 *
 * Bug #5 fix: fuelClean is NOT clamped to 0 here so the Pearson correlation
 * and linear regression are not distorted.  Negative values indicate data
 * artefacts and are filtered downstream where needed.
 */
function processNormalizeAndTaxClean(data, fuelType) {
  if (!data.length) return [];
  return data.map(d => {
    const rateEurPerLiter = getExciseRateEuro(fuelType, d.date) / 1000;
    const taxGrn          = rateEurPerLiter * d.eur * 1.2;
    const fuelClean       = d.fuel - taxGrn;   // intentionally not clamped
    const oilUah          = d.rawOil * d.usd;
    return { ...d, taxGrn, fuelClean, oilUah };
  });
}

// ─── Linear regression (oil-normalised → fuel clean) ─────────────────────────

/**
 * Fit a linear model: fuelClean ~ oilNormalized, then compute fairFuel.
 *
 * Bug #3 fix: denominator=0 yields Infinity (not NaN). isNaN(Infinity)===false
 *   so the original code silently used ±Infinity as slope → fairFuel=Infinity.
 *   Fixed with Number.isFinite().
 *
 * Bug #4 fix: if the first data point has fuelClean≤0 (oilUah0 normalisation
 *   anchor = 0), all oilNormalized values collapse to 0, breaking regression.
 *   Fixed by using the mean of positive fuelClean values as anchor.
 */
function calculateFairPriceWithTaxes(data) {
  const n = data.length;
  if (n < 2) {
    return data.map(d => ({ ...d, fairFuel: d.fuel, oilNormalized: d.oilUah }));
  }

  const oilUah0 = data[0].oilUah;

  // Bug #4 fix: use mean of positive fuelClean as normalisation anchor
  const posCleans = data.map(d => d.fuelClean).filter(v => v > 0);
  const anchor    = posCleans.length > 0
    ? posCleans.reduce((a, b) => a + b, 0) / posCleans.length
    : Math.abs(data[0].oilUah); // last resort

  for (const d of data) {
    d.oilNormalized = oilUah0 > 0
      ? (d.oilUah / oilUah0) * anchor
      : anchor;
  }

  const x    = data.map(d => d.oilNormalized);
  const y    = data.map(d => d.fuelClean);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
  const sumXX = x.reduce((s, xi) => s + xi * xi, 0);

  const denom = n * sumXX - sumX * sumX;

  // Bug #3 fix: check isFinite, not just isNaN
  const slope     = Number.isFinite(denom) && denom !== 0
    ? (n * sumXY - sumX * sumY) / denom
    : null;
  const intercept = slope !== null ? (sumY - slope * sumX) / n : null;

  return data.map(d => {
    const fairClean = slope !== null
      ? slope * d.oilNormalized + intercept
      : d.fuelClean;
    return { ...d, fairFuel: fairClean + d.taxGrn };
  });
}

// ─── Pearson correlation ──────────────────────────────────────────────────────

/**
 * Pearson r between two numeric arrays.
 * Returns null (not 0) if n < 2 or variance is zero — caller can distinguish
 * "no data" from "zero correlation".
 *
 * Bug fix: require n >= 2 for a meaningful result.
 */
function pearson(x, y) {
  const n = x.length;
  if (n < 2) return null;
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx  = avg(x), my = avg(y);
  let num = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    vx  += (x[i] - mx) ** 2;
    vy  += (y[i] - my) ** 2;
  }
  const denom = Math.sqrt(vx * vy);
  return denom > 0 ? num / denom : null;
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

// Bug #8 fix: the original 2% relative threshold is too sensitive for cheap gas
// (2% of 10 грн = 0.20 грн → noise-level false positives).
// Use whichever is larger: absolute 0.5 грн or 3% of fairFuel.
const MIN_SPREAD_ABS = 0.5;   // грн/л
const MIN_SPREAD_REL = 0.03;  // 3%

function detectAnomalies(data) {
  const alerts = [];
  for (let i = 1; i < data.length; i++) {
    const curr = data[i];
    const prev = data[i - 1];

    if (curr.oilUah < prev.oilUah && curr.fuel > prev.fuel) {
      alerts.push({
        type:    'price_up_oil_down',
        date:    curr.date,
        message: `Нафта знизилась (${prev.oilUah.toFixed(0)}→${curr.oilUah.toFixed(0)} грн/бар), але ціна АЗС зросла.`,
      });
    }

    const spread    = curr.fuel - curr.fairFuel;
    const threshold = Math.max(MIN_SPREAD_ABS, Math.abs(curr.fairFuel) * MIN_SPREAD_REL);
    if (spread > threshold) {
      alerts.push({
        type:    'overpriced',
        date:    curr.date,
        spread,
        message: `Роздріб перевищує модель на ${spread.toFixed(2)} грн/л (${((spread / Math.abs(curr.fairFuel)) * 100).toFixed(1)}%).`,
      });
    }
  }
  return alerts;
}

// ─── Monthly aggregation ──────────────────────────────────────────────────────

function aggregateMonthly(data) {
  const buckets = {};
  const fields  = ['fuel', 'fairFuel', 'rawOil', 'usd', 'eur', 'taxGrn', 'oilUah', 'fuelClean'];

  for (const d of data) {
    const key = d.date.toISOString().slice(0, 7);
    if (!buckets[key]) {
      buckets[key] = { date: new Date(`${key}-01`) };
      for (const f of fields) buckets[key][f] = [];
    }
    for (const f of fields) {
      if (d[f] !== undefined) buckets[key][f].push(d[f]);
    }
  }

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return Object.keys(buckets).sort().map(key => {
    const b   = buckets[key];
    const row = { date: b.date };
    for (const f of fields) row[f] = avg(b[f]);
    return row;
  });
}

module.exports = {
  getExciseRateEuro,
  mergeAllDatasets,
  processNormalizeAndTaxClean,
  calculateFairPriceWithTaxes,
  pearson,
  detectAnomalies,
  aggregateMonthly,
};
