'use strict';
const fs   = require('fs');
const path = require('path');

// Root directory for all persisted JSON data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Local JSON file-based persistent cache (acts as a lightweight "DB").
 *
 * File layout:
 *   data/fuel/<brand>/<YYYY-MM>.json   → [{date, val}, ...]
 *   data/oil/<YYYY-MM>.json
 *   data/nbu/<valcode>/<YYYY-MM>.json
 *
 * Past months are written once and never overwritten.
 * Current month is always re-fetched from the network.
 */

function _filePath(type, subKey, month) {
  // type: 'fuel' | 'oil' | 'nbu'
  // subKey: brand (for fuel), valcode (for nbu), '' (for oil)
  const parts = [DATA_DIR, type];
  if (subKey) parts.push(subKey);
  parts.push(`${month}.json`);
  return path.join(...parts);
}

/**
 * Read cached data for a given month.
 * Returns parsed array or null if not cached.
 */
function read(type, subKey, month) {
  const file = _filePath(type, subKey, month);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    // Rehydrate date strings to Date objects
    return parsed.map(item => ({ ...item, date: new Date(item.date) }));
  } catch {
    return null;
  }
}

/**
 * Write data for a given month to disk.
 * Serializes Date objects to ISO strings.
 */
function write(type, subKey, month, data) {
  const file = _filePath(type, subKey, month);
  const dir  = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const serializable = data.map(item => ({
    ...item,
    date: item.date instanceof Date ? item.date.toISOString() : item.date,
  }));
  fs.writeFileSync(file, JSON.stringify(serializable, null, 2), 'utf8');
}

/**
 * Check whether a month is already persisted locally.
 */
function has(type, subKey, month) {
  return fs.existsSync(_filePath(type, subKey, month));
}

/**
 * List all cached months for a given type/subKey combination.
 * Returns sorted array of 'YYYY-MM' strings.
 */
function listMonths(type, subKey) {
  const dir = path.join(DATA_DIR, type, ...(subKey ? [subKey] : []));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort();
}

/**
 * Return a summary of the entire local cache (for a /api/cache-info endpoint).
 */
function summary() {
  const result = {};
  if (!fs.existsSync(DATA_DIR)) return result;

  const walk = (dir, parts = []) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, [...parts, entry]);
      } else if (entry.endsWith('.json')) {
        const key = [...parts, entry.replace('.json', '')].join('/');
        result[key] = stat.size;
      }
    }
  };
  walk(DATA_DIR);
  return result;
}

module.exports = { read, write, has, listMonths, summary };
