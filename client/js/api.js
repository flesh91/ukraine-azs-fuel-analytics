/**
 * AZS Analytics — API client
 * Wraps fetch() calls to our own Express server (/api/...).
 */
window.AZSApi = {
  /**
   * Fetch analytics data.
   * @param {object} params { brand, fuelType, startDate, endDate, mode }
   * @returns {Promise<{data, anomalies, correlation, count}>}
   */
  async fetchAnalytics(params) {
    const qs  = new URLSearchParams(params).toString();
    const res = await fetch(`/api/analytics?${qs}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    return res.json();
  },

  /** Fetch local cache summary from /api/cache-info */
  async fetchCacheInfo() {
    const res = await fetch('/api/cache-info');
    if (!res.ok) return null;
    return res.json();
  },
};
