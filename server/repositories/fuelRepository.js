'use strict';
const fetch          = require('node-fetch');
const { parse }      = require('node-html-parser');
const { parseMinfinDate } = require('../utils/dateUtils');

const MINFIN_FUEL_BASE = 'https://index.minfin.com.ua/ua/markets/fuel/tm';

/**
 * Normalize a table header cell to a clean, comparable ASCII-uppercase string.
 * Removes whitespace, dashes, non-breaking spaces.
 * Converts Cyrillic А (U+0410) → Latin A to avoid silent mismatches.
 */
function normalizeHeader(text) {
  return text
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/\u00a0/g, '')       // &nbsp;
    .toUpperCase()
    .replace(/\u0410/g, 'A');     // Cyrillic А → Latin A (Bug #6 fix)
}

/**
 * Find the column index for the requested fuel type.
 * Bug #6 fix: use includes() for A-95 instead of strict equality;
 * guard A-95 against matching A-95+ headers.
 */
function findFuelColumn(headers, fuelType) {
  for (let i = 1; i < headers.length; i++) {
    const h = headers[i];
    if (fuelType === 'A-95+' && (h.includes('95+') || h.includes('PLUS') || h.includes('96') || h.includes('MUSTANG'))) return i;
    if (fuelType === 'A-95'  && h.includes('A95') && !h.includes('95+') && !h.includes('96')) return i;
    if (fuelType === 'A-92'  && h.includes('92'))  return i;
    if (fuelType === 'ДП'    && (h.includes('ДП')  || h.includes('ДИЗ') || h.includes('DIESEL'))) return i;
    if (fuelType === 'Газ'   && (h.includes('ГАЗ') || h.includes('LPG') || h.includes('GAS')))   return i;
  }
  return -1;
}

/**
 * Fetch fuel prices for one brand/month/fuelType from minfin.com.ua.
 * Returns [{date: Date, val: number}].
 * Server-side fetch avoids browser CORS restrictions entirely.
 */
async function getFuelPrices(brand, month, fuelType) {
  try {
    const url = `${MINFIN_FUEL_BASE}/${brand}/${month}/`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AZS-Analytics/1.0' } });
    if (!res.ok) return [];
    const html = await res.text();
    const root = parse(html);

    const table = root.querySelector('table.zebra') || root.querySelector('table');
    if (!table) return [];

    const headers = table.querySelectorAll('th').map(th => normalizeHeader(th.text));
    const targetIndex = findFuelColumn(headers, fuelType);
    if (targetIndex === -1) return [];

    const rows = table.querySelectorAll('tr').slice(1);
    return rows.map(row => {
      const cols = row.querySelectorAll('td');
      if (!cols.length || cols.length <= targetIndex) return null;

      const dateStr = cols[0].text.trim().split(/\s+/)[0];
      // Bug #7 fix: replace ALL commas, not just first
      const val = parseFloat(cols[targetIndex].text.replace(/,/g, '.').trim());

      if (!dateStr || isNaN(val) || val === 0) return null;
      const date = parseMinfinDate(dateStr);
      if (isNaN(date.getTime())) return null;
      return { date, val };
    }).filter(Boolean);
  } catch (err) {
    console.warn(`[fuelRepo] Failed ${brand}/${month}:`, err.message);
    return [];
  }
}

module.exports = { getFuelPrices };
