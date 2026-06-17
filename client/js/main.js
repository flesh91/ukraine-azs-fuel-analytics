/**
 * AZS Analytics — Main entry point
 * Initializes defaults and wires the "Розрахувати" action.
 */
(function () {

  /* ─── Set default date range ────────────────────────────────── */
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = '2026-01-01';
  document.getElementById('endDate').value   = today;

  /* ─── Core load function (exposed globally for the button) ───── */
  window.loadData = async function () {
    const brand    = document.getElementById('brand').value;
    const fuelType = document.getElementById('fuelType').value;
    const start    = document.getElementById('startDate').value;
    const end      = document.getElementById('endDate').value;
    const mode     = document.getElementById('mode').value;
    const brandLabel = document.getElementById('brand')
      .options[document.getElementById('brand').selectedIndex].text;

    /* Basic validation */
    if (!start || !end) {
      alert('Оберіть період!');
      return;
    }
    if (new Date(start) > new Date(end)) {
      alert('Дата початку не може бути пізніше кінця!');
      return;
    }

    AZSUI.setLoading(true);
    AZSChart.destroy();
    AZSUI.showChart(false);

    try {
      const [result, cacheInfo] = await Promise.all([
        AZSApi.fetchAnalytics({ brand, fuelType, startDate: start, endDate: end, mode }),
        AZSApi.fetchCacheInfo(),
      ]);

      if (!result.data || !result.data.length) {
        AZSUI.showError('Дані відсутні. Спробуйте змінити параметри або звузити період.');
        AZSUI.updateCorrelation(null, brandLabel, fuelType);
        AZSUI.updateStats([], null);
        return;
      }

      AZSUI.showChart(true);
      AZSChart.render(result.data, brandLabel, fuelType, mode);
      AZSUI.updateCorrelation(result.correlation, brandLabel, fuelType);
      AZSUI.updateStats(result.data, cacheInfo);
      AZSUI.renderAnomalies(result.anomalies);

    } catch (err) {
      AZSUI.showError(`Помилка запиту: ${err.message}`);
    } finally {
      // Hide overlay only AFTER chart is rendered (avoids flash of overlay over chart)
      AZSUI.setLoading(false);
    }
  };

  /* ─── Enter key shortcut ────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('load-btn').disabled) {
      window.loadData();
    }
  });

})();
