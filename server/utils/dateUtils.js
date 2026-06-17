'use strict';

/**
 * Parse DD.MM.YYYY string → Date (UTC midnight).
 */
function parseMinfinDate(str) {
  const parts = str.split('.');
  if (parts.length !== 3) return new Date('invalid');
  const [d, m, y] = parts;
  return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
}

/**
 * Generate array of 'YYYY-MM' strings covering [startDate, endDate].
 */
function getMonthRange(startDate, endDate) {
  const months = [];
  let year  = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth();
  const endYear  = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    if (++month > 11) { month = 0; year++; }
  }
  return months;
}

/**
 * Forward-fill a sorted {date, val}[] array so every calendar day in
 * [startDate, endDate] has a value (carries last known value forward).
 * Used to bridge weekends/holidays where NBU doesn't publish rates.
 */
function forwardFill(sortedEntries, startDate, endDate) {
  const map = new Map();
  for (const e of sortedEntries) {
    map.set(e.date.toDateString(), e.val);
  }

  const result = [];
  let lastVal = null;
  const cursor = new Date(startDate);
  const end    = new Date(endDate);

  while (cursor <= end) {
    const key = cursor.toDateString();
    if (map.has(key)) lastVal = map.get(key);
    if (lastVal !== null) {
      result.push({ date: new Date(cursor), val: lastVal });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/**
 * Returns true if the given YYYY-MM string is the current calendar month.
 * Current month is never permanently cached since data is still coming in.
 */
function isCurrentMonth(yyyyMm) {
  const now   = new Date();
  const curYM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return yyyyMm === curYM;
}

module.exports = { parseMinfinDate, getMonthRange, forwardFill, isCurrentMonth };
