/**
 * AZS Analytics — Chart manager (Chart.js wrapper)
 */
(function () {
  let instance = null;

  window.AZSChart = {
    destroy() {
      if (instance) { instance.destroy(); instance = null; }
    },

    /**
     * Render (or re-render) the analytics chart.
     * @param {Array}  data      Processed data points from the server
     * @param {string} brand     Human-readable brand label
     * @param {string} fuelType  e.g. "A-95+"
     * @param {string} mode      "day" | "month"
     */
    render(data, brand, fuelType, mode) {
      this.destroy();

      const ctx    = document.getElementById('chart').getContext('2d');

      // Enforce a minimum span of 15 UAH for the Y-axis to prevent
      // extreme line stretching on narrow price ranges (e.g. cheap networks on short periods)
      const fuelValues = data.map(d => d.fuel).concat(data.map(d => d.fairFuel));
      const rawMin = Math.min(...fuelValues);
      const rawMax = Math.max(...fuelValues);
      const span = rawMax - rawMin;
      let yMin = rawMin;
      let yMax = rawMax;

      if (span < 15) {
        const center = (rawMax + rawMin) / 2;
        yMin = Math.floor(center - 7.5);
        yMax = Math.ceil(center + 7.5);
      } else {
        const buffer = span * 0.05;
        yMin = Math.floor(rawMin - buffer);
        yMax = Math.ceil(rawMax + buffer);
      }
      const sparse = data.length > 90; // skip point dots for dense datasets

      const labels = data.map(d => {
        const date = new Date(d.date);
        return mode === 'month'
          ? date.toLocaleDateString('uk-UA', { month: 'short', year: '2-digit' })
          : date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
      });

      instance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label:           `${brand} · ${fuelType} (грн/л)`,
              data:            data.map(d => +d.fuel.toFixed(3)),
              borderColor:     '#f59e0b',
              backgroundColor: 'rgba(245,158,11,0.07)',
              borderWidth:     2.5,
              tension:         0.22,
              fill:            true,
              pointRadius:     sparse ? 0 : 3,
              pointHoverRadius: 6,
              yAxisID:         'y',
            },
            {
              label:       'Справедлива ціна (грн/л)',
              data:        data.map(d => +d.fairFuel.toFixed(3)),
              borderColor: '#10b981',
              borderWidth: 2,
              borderDash:  [5, 5],
              tension:     0.22,
              pointRadius: 0,
              pointHoverRadius: 5,
              yAxisID:     'y',
            },
            {
              label:       'Brent ($/бар)',
              data:        data.map(d => +d.rawOil.toFixed(2)),
              borderColor: '#3b82f6',
              borderWidth: 1.8,
              tension:     0.22,
              pointRadius: 0,
              pointHoverRadius: 4,
              yAxisID:     'y1',
            },
            {
              label:       'Курс USD НБУ (грн)',
              data:        data.map(d => +d.usd.toFixed(2)),
              borderColor: '#a855f7',
              borderWidth: 1.4,
              borderDash:  [3, 3],
              tension:     0.22,
              pointRadius: 0,
              yAxisID:     'y1',
            },
          ],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          animation:           { duration: 500, easing: 'easeInOutQuart' },
          interaction:         { mode: 'index', intersect: false },
          plugins: {
            legend: {
              labels: {
                color:    '#8b949e',
                font:     { size: 12, family: 'Inter, sans-serif' },
                boxWidth: 22,
                padding:  16,
                usePointStyle: true,
                pointStyleWidth: 22,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(22,27,34,0.96)',
              borderColor:     'rgba(48,54,61,0.9)',
              borderWidth:     1,
              padding:         14,
              titleColor:      '#e6edf3',
              bodyColor:       '#8b949e',
              bodySpacing:     5,
              callbacks: {
                title(items) {
                  return items[0].label;
                },
                label(ctx) {
                  const d = data[ctx.dataIndex];
                  switch (ctx.datasetIndex) {
                    case 0: return `⛽ Роздріб: ${d.fuel.toFixed(2)} грн/л`;
                    case 1: return [
                      `⚖️  Справедлива ціна: ${d.fairFuel.toFixed(2)} грн/л`,
                      `💶 Акциз+ПДВ: ${d.taxGrn.toFixed(2)} грн/л`,
                    ];
                    case 2: return `🛢️  Brent: $${d.rawOil.toFixed(2)}/бар`;
                    case 3: return [
                      `💵 USD: ${d.usd.toFixed(2)} грн`,
                      `🇪🇺 EUR: ${d.eur.toFixed(2)} грн`,
                    ];
                  }
                },
                labelColor(ctx) {
                  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
                  return { borderColor: colors[ctx.datasetIndex], backgroundColor: colors[ctx.datasetIndex] };
                },
              },
            },
          },
          scales: {
            y: {
              type:     'linear',
              position: 'left',
              min:      yMin,
              max:      yMax,
              grid:     { color: 'rgba(48,54,61,0.45)' },
              ticks:    { color: '#8b949e', font: { size: 11, family: 'Inter' } },
              title:    { display: true, text: 'Роздріб / Справедлива ціна (грн/л)', color: '#6e7681', font: { size: 11 } },
            },
            y1: {
              type:     'linear',
              position: 'right',
              grace:    '10%',
              grid:     { drawOnChartArea: false },
              ticks:    { color: '#6e7681', font: { size: 11, family: 'Inter' } },
              title:    { display: true, text: 'Brent ($/бар)  ·  USD (грн)', color: '#6e7681', font: { size: 11 } },
            },
            x: {
              grid:  { color: 'rgba(48,54,61,0.35)' },
              ticks: {
                color:          '#6e7681',
                font:           { size: 10, family: 'Inter' },
                maxRotation:    45,
                minRotation:    0,
                maxTicksLimit:  24,
              },
            },
          },
        },
      });
    },
  };
})();
