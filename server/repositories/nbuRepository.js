'use strict';
const fetch = require('node-fetch');

const NBU_BASE = 'https://bank.gov.ua/NBU_Exchange/exchange_site';

// Numeric currency codes for the NBU API r030 field
const R030 = { USD: 840, EUR: 978 };

/**
 * Fetch NBU official exchange rates for a given currency and date range.
 * Returns a sorted [{date: Date, val: number}] array (only business days).
 * Caller must apply forwardFill() to cover weekends/holidays.
 */
async function getNbuRates(startIso, endIso, valcode) {
  try {
    const s    = startIso.replace(/-/g, '');
    const e    = endIso.replace(/-/g, '');
    const code = valcode.toUpperCase();
    const url  = `${NBU_BASE}?start=${s}&end=${e}&valcode=${valcode}&sort=exchangedate&order=asc&json`;

    const res = await fetch(url, { headers: { 'User-Agent': 'AZS-Analytics/1.0' } });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const r030 = R030[code];

    return data
      .filter(item => {
        const cc = (item.CurrencyCodeL || item.cc || '').toUpperCase();
        return cc === code || item.r030 === r030;
      })
      .map(item => {
        const rawDate = item.exchangedate || item.StartDate;
        if (!rawDate) return null;
        const [d, m, y] = rawDate.split('.');
        const date = new Date(`${y}-${m}-${d}`);
        const val  = parseFloat(item.rate !== undefined ? item.rate : item.Amount);
        if (isNaN(date.getTime()) || isNaN(val)) return null;
        return { date, val };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);
  } catch (err) {
    console.warn(`[nbuRepo] Failed ${valcode} ${startIso}–${endIso}:`, err.message);
    return [];
  }
}

module.exports = { getNbuRates };
