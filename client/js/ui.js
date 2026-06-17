/**
 * AZS Analytics — UI module
 * Handles all DOM mutations: loading state, stats, anomalies, correlation badge.
 */
(function () {
  window.AZSUI = {

    /* ─── Loading state ──────────────────────────────────────── */

    /**
     * Toggle loading state: disables button, shows/hides overlay.
     * Bug #10 fix: button is disabled during fetch so double-click is impossible.
     */
    setLoading(on) {
      const btn     = document.getElementById('load-btn');
      const btnText = document.getElementById('btn-text');
      const spinner = document.getElementById('btn-spinner');
      const overlay = document.getElementById('loading-overlay');

      btn.disabled   = on;
      btnText.hidden = on;
      spinner.hidden = !on;

      // Always explicitly set overlay visibility to avoid race conditions
      // when cache returns data faster than React-style re-renders
      overlay.hidden = !on;
    },

    /* ─── Chart visibility ───────────────────────────────────── */

    showChart(visible) {
      document.getElementById('chart-placeholder').hidden = visible;
      document.getElementById('chart-wrapper').hidden     = !visible;
    },

    /* ─── Correlation badge ──────────────────────────────────── */

    updateCorrelation(corr, brand, fuelType) {
      const badge = document.getElementById('corr-badge');
      const text  = document.getElementById('corr-text');

      if (corr === null || corr === undefined) {
        text.textContent = 'Недостатньо даних для кореляції';
        badge.classList.remove('live');
        return;
      }

      const r     = Number(corr);
      const sign  = r >= 0 ? '+' : '';
      const label = Math.abs(r) >= 0.7 ? 'висока' : Math.abs(r) >= 0.4 ? 'середня' : 'слабка';
      text.textContent = `r = ${sign}${r.toFixed(3)} · ${brand} / Brent · ${label}`;
      badge.classList.add('live');
    },

    /* ─── Stats bar ──────────────────────────────────────────── */

    updateStats(data, cacheInfo) {
      const bar = document.getElementById('stats-bar');

      if (!data || !data.length) {
        bar.hidden = true;
        return;
      }

      const fuels  = data.map(d => d.fuel);
      const taxes  = data.map(d => d.taxGrn);
      const min    = Math.min(...fuels);
      const max    = Math.max(...fuels);
      const avg    = fuels.reduce((a, b) => a + b, 0) / fuels.length;
      const avgTax = taxes.reduce((a, b) => a + b, 0) / taxes.length;

      document.getElementById('stat-min').textContent   = `${min.toFixed(2)} грн`;
      document.getElementById('stat-max').textContent   = `${max.toFixed(2)} грн`;
      document.getElementById('stat-avg').textContent   = `${avg.toFixed(2)} грн`;
      document.getElementById('stat-tax').textContent   = `~${avgTax.toFixed(2)} грн`;
      document.getElementById('stat-count').textContent = data.length;

      if (cacheInfo) {
        const kb = (cacheInfo.totalBytes / 1024).toFixed(1);
        document.getElementById('stat-cache').textContent = `💾 ${cacheInfo.count} файлів · ${kb} KB`;
      }

      bar.hidden = false;

      // Staggered fade-in animation for stat cards
      bar.querySelectorAll('.stat-card').forEach((el, i) => {
        el.style.animationDelay = `${i * 55}ms`;
      });
    },

    /* ─── Anomalies panel ────────────────────────────────────── */

    renderAnomalies(anomalies) {
      const list  = document.getElementById('alerts');
      const badge = document.getElementById('anomaly-count');

      if (!anomalies || !anomalies.length) {
        badge.textContent = '';
        list.innerHTML = `<div class="alerts-ok">✅ Аномалій не виявлено — ціни відповідають податковій моделі.</div>`;
        return;
      }

      badge.textContent = anomalies.length;

      list.innerHTML = anomalies.map((a, i) => {
        const date = new Date(a.date).toLocaleDateString('uk-UA', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        const isOverpriced = a.type === 'overpriced';
        const cls  = isOverpriced ? 'alert-overpriced' : 'alert-price-up';
        const icon = isOverpriced ? '⚠️' : '🚨';
        return `
          <div class="alert-item ${cls}" style="animation-delay:${Math.min(i * 35, 400)}ms">
            <span class="alert-date">${icon} ${date}</span>
            ${a.message}
          </div>`;
      }).join('');
    },

    /* ─── Error state ────────────────────────────────────────── */

    showError(message) {
      document.getElementById('alerts').innerHTML =
        `<div class="alert-item alert-overpriced">❌ ${message}</div>`;
      document.getElementById('anomaly-count').textContent = '';
      this.showChart(false);
    },
  };
})();
