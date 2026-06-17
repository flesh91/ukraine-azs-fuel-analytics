'use strict';
const fetch          = require('node-fetch');
const { parse }      = require('node-html-parser');
const { parseMinfinDate } = require('../utils/dateUtils');

const MINFIN_OIL_BASE = 'https://index.minfin.com.ua/ua/markets/oil';

/**
 * Fetch Brent crude oil prices (USD/barrel) for one month from minfin.com.ua.
 * Returns [{date: Date, val: number}].
 */
async function getOilPrices(month) {
  try {
    const url = `${MINFIN_OIL_BASE}/${month}/`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AZS-Analytics/1.0' } });
    if (!res.ok) return [];
    const html = await res.text();
    const root = parse(html);

    let rows = root.querySelectorAll('table.zebra tr');
    if (rows.length <= 2) rows = root.querySelectorAll('table tr');

    return rows.slice(2).map(row => {
      const cols = row.querySelectorAll('td');
      if (!cols.length) return null;
      const dateStr = cols[0].text.trim().split(/\s+/)[0];
      // Bug #7 fix: /,/g
      const val = parseFloat(cols[1]?.text.replace(/,/g, '.').trim());
      if (!dateStr || isNaN(val)) return null;
      const date = parseMinfinDate(dateStr);
      if (isNaN(date.getTime())) return null;
      return { date, val };
    }).filter(Boolean);
  } catch (err) {
    console.warn(`[oilRepo] Failed ${month}:`, err.message);
    return [];
  }
}

module.exports = { getOilPrices };
