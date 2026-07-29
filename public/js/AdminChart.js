// AdminChart.js
// Grafik volume laporan mingguan di dashboard admin (data masih dummy/statis).

let myChart = null;

function renderAdminChart() {
  const ctx = document.getElementById('adminChartMock');
  if (!ctx) return;
  if (myChart) myChart.destroy();
  myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'],
      datasets: [{
        label: 'Laporan Masuk',
        data: [12, 19, 3, 5, 2],
        backgroundColor: 'rgba(232,121,249,0.32)',
        borderColor: 'rgba(232,121,249,0.75)',
        borderWidth: 1,
        borderRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: 'rgba(255,255,255,0.38)', font: { size: 11 } } } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.055)' }, ticks: { color: 'rgba(255,255,255,0.32)' } },
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.32)' } }
      }
    }
  });
}

window.renderAdminChart = renderAdminChart;
