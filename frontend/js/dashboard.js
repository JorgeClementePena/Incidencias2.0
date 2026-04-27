// frontend/js/dashboard.js
// Dashboard con todas las gráficas solicitadas

const DashboardModule = (() => {
  // Mapa de instancias Chart.js para destruir antes de redibujar
  const charts = {};

  // Paleta de colores corporativa
  const COLORS = {
    teal:   ['#0d5c4e','#1a8870','#4db896','#a8ddd0','#d4efe9'],
    area:   ['#0d5c4e','#2471a3','#d68910','#c0392b','#8e44ad'],
    multi:  ['#0d5c4e','#2471a3','#d68910','#c0392b','#8e44ad','#16a085','#d35400','#2980b9','#27ae60'],
  };

  function getFilters() {
    return {
      area:         document.getElementById('f-area')?.value     || '',
      departamento: document.getElementById('f-dept')?.value     || '',
      programa:     document.getElementById('f-programa')?.value || '',
      estado:       document.getElementById('f-estado')?.value   || '',
      prioridad:    document.getElementById('f-prioridad')?.value || '',
      anio:         document.getElementById('f-anio')?.value     || '',
      mes:          document.getElementById('f-mes')?.value      || '',
    };
  }

  function buildQuery(filters) {
    return Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
  }

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function fmt(n) {
    const num = parseFloat(n) || 0;
    if (num >= 1000) return num.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
    return num.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' €';
  }

  function fmtNum(n) { return parseInt(n) || 0; }

  function colorForCategory(name) {
    if (name === 'Sin categoría') return '#bdc3c7';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
    return COLORS.multi[Math.abs(hash) % COLORS.multi.length];
  }

  async function load() {
    const f = getFilters();
    const q = buildQuery(f);

    // Cargar todos en paralelo
    const [kpis, porArea, valMes, porDept, porProg, porProy, porCat, porDia] = await Promise.all([
      API.get('/dashboard/kpis?' + q),
      API.get('/dashboard/por-area?' + q),
      API.get('/dashboard/valoracion-mensual?' + q),
      API.get('/dashboard/por-departamento?' + q),
      API.get('/dashboard/por-programa?' + q),
      API.get('/dashboard/por-proyecto?' + q),
      API.get('/dashboard/por-categoria?' + q),
      API.get('/dashboard/por-dia-semana?' + q),
    ]);

    renderKPIs(kpis);
    renderDonut(porArea);
    renderValoracionMes(valMes);
    renderPorArea(porDept);       // Incidencias por área (usamos departamento aquí)
    renderPorPrograma(porProg);
    renderPorProyecto(porProy);
    renderCatNum(porCat);
    renderCatEur(porCat);
    renderDiaSemana(porDia);
    renderTablaDias(porDia);
  }

  function renderKPIs(d) {
    document.getElementById('kpi-total').textContent    = fmtNum(d.total);
    document.getElementById('kpi-abiertas').textContent = fmtNum(d.abiertas);
    document.getElementById('kpi-cerradas').textContent = fmtNum(d.cerradas);
    //Si el dinero excede los 10 caracteres, se reduce la fuente, lo mismo al llegar a 14
      const eurosEl = document.getElementById('kpi-euros');
      const eurosStr = fmt(d.valoracion_total);
      eurosEl.textContent = eurosStr;
      eurosEl.style.fontSize = eurosStr.length > 10 ? (eurosStr.length > 14 ? '1.1rem' : '1.4rem') : '';
    document.getElementById('kpi-resultado').textContent = fmtNum(d.afecta_resultado);
    document.getElementById('kpi-ma').textContent       = fmtNum(d.afecta_ma);
  }

  // Gráfica 1: Donut por áreas + categorías
  function renderDonut(data) {
    destroyChart('donut');
    const ctx = document.getElementById('chart-donut');
    if (!ctx || !data.length) return;

    // Agrupar por área
    const byArea = {};
    data.forEach(d => {
      if (!byArea[d.area]) byArea[d.area] = 0;
      byArea[d.area] += parseInt(d.total);
    });

    const labels = Object.keys(byArea);
    const values = Object.values(byArea);

    charts['donut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: COLORS.area,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 12 }, padding: 14 } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}: ${c.raw} incidencias (${Math.round(c.raw/c.dataset.data.reduce((a,b)=>a+b,0)*100)}%)`
            }
          }
        }
      }
    });
  }

  // Gráfica 2: Valoración € por mes (barras + línea acumulado)
  function renderValoracionMes(data) {
    destroyChart('valmes');
    const ctx = document.getElementById('chart-valoracion-mes');
    if (!ctx) return;

    const labels  = data.map(d => d.periodo);
    const vals    = data.map(d => parseFloat(d.valoracion));
    const acum    = data.map(d => parseFloat(d.valoracion_acumulada));

    charts['valmes'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Individual €',
            data: vals,
            backgroundColor: 'rgba(13,92,78,0.7)',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Acumulado €',
            data: acum,
            type: 'line',
            borderColor: '#d68910',
            backgroundColor: 'rgba(214,137,16,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { font: { family: 'DM Sans' } } } },
        scales: {
          y:  { position: 'left',  title: { display: true, text: 'Mensual €' } },
          y1: { position: 'right', title: { display: true, text: 'Acumulado €' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // Gráfica 3: Incidencias por área (departamento) — número y €
  function renderPorArea(data) {
    destroyChart('pordept');
    const ctx = document.getElementById('chart-por-area');
    if (!ctx || !data.length) return;

    const labels = data.map(d => d.departamento);
    charts['pordept'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Nº Incidencias', data: data.map(d => parseInt(d.total)), backgroundColor: COLORS.teal[0], borderRadius: 4, yAxisID: 'y' },
          { label: 'Valoración €',   data: data.map(d => parseFloat(d.valoracion)), backgroundColor: COLORS.teal[2], borderRadius: 4, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { family: 'DM Sans' } } } },
        scales: {
          y:  { position: 'left',  title: { display: true, text: 'Nº' } },
          y1: { position: 'right', title: { display: true, text: '€' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // Gráfica 4: Incidencias por programa
  function renderPorPrograma(data) {
    destroyChart('porprog');
    const ctx = document.getElementById('chart-por-programa');
    if (!ctx || !data.length) return;

    const labels = data.map(d => {
      // Acortar etiquetas largas
      const s = d.programa;
      return s.length > 30 ? s.substring(0, 28) + '…' : s;
    });

    charts['porprog'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Nº Incidencias', data: data.map(d => parseInt(d.total)), backgroundColor: COLORS.multi.slice(0, data.length), borderRadius: 4, yAxisID: 'y' },
          { label: 'Valoración €',   data: data.map(d => parseFloat(d.valoracion)), backgroundColor: COLORS.multi.slice(0, data.length).map(c => c + '88'), borderRadius: 4, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { labels: { font: { family: 'DM Sans' } } } },
        scales: {
          y:  { position: 'left' },
          y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '€' } }
        }
      }
    });
  }

  // Gráfica 5: Incidencias por proyecto
  function renderPorProyecto(data) {
    destroyChart('porproy');
    const ctx = document.getElementById('chart-por-proyecto');
    if (!ctx || !data.length) return;

    const top = data.slice(0, 10);
    charts['porproy'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top.map(d => d.codigo_proyecto),
        datasets: [
          { label: 'Nº', data: top.map(d => parseInt(d.total)), backgroundColor: COLORS.teal[0], borderRadius: 4, yAxisID: 'y' },
          { label: '€',  data: top.map(d => parseFloat(d.valoracion)), backgroundColor: COLORS.teal[2], borderRadius: 4, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { labels: { font: { family: 'DM Sans' } } } },
        scales: {
          y:  { position: 'left' },
          y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '€' } }
        }
      }
    });
  }

  // Gráfica 6: Nº por categorías
  function renderCatNum(data) {
    destroyChart('catnum');
    const ctx = document.getElementById('chart-cat-num');
    if (!ctx || !data.length) return;

    charts['catnum'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.categoria),
        datasets: [{
          label: 'Nº Incidencias',
          data: data.map(d => parseInt(d.total)),
          backgroundColor: data.map(d => colorForCategory(d.categoria)),
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }

  // Gráfica 7: Valoración € por categorías
  function renderCatEur(data) {
    destroyChart('cateur');
    const ctx = document.getElementById('chart-cat-eur');
    if (!ctx || !data.length) return;

    charts['cateur'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.categoria),
        datasets: [{
          data: data.map(d => parseFloat(d.valoracion)),
          backgroundColor: data.map(d => colorForCategory(d.categoria)),
          borderWidth: 2, borderColor: '#fff', hoverOffset: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 12 }, padding: 14 } },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } }
        }
      }
    });
  }

  // Gráfica 8: Incidencias por día de la semana
  function renderDiaSemana(data) {
    destroyChart('diasem');
    const ctx = document.getElementById('chart-diasemana');
    if (!ctx) return;

    // Asegurar todos los días 1-5 (lunes-viernes), 0 si no hay datos
    const diasLabels = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const diasDow    = [1,2,3,4,5,6,0]; // DOW de PostgreSQL
    const byDow      = {};
    data.forEach(d => { byDow[parseInt(d.dow)] = parseInt(d.total); });

    const totales = diasDow.map(d => byDow[d] || 0);

    charts['diasem'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: diasLabels,
        datasets: [{
          label: 'Incidencias',
          data: totales,
          backgroundColor: totales.map((v, i) => i < 5 ? COLORS.teal[0] : '#cbd5d3'),
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }

  // Tabla días de la semana
  function renderTablaDias(data) {
    const container = document.getElementById('table-diasemana');
    if (!container) return;

    const diasLabels = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const diasDow    = [1,2,3,4,5,6,0];
    const byDow      = {};
    data.forEach(d => { byDow[parseInt(d.dow)] = d; });

    const total = diasDow.reduce((sum, d) => sum + (parseInt(byDow[d]?.total) || 0), 0);
    const totalEur = diasDow.reduce((sum, d) => sum + (parseFloat(byDow[d]?.valoracion) || 0), 0);

    const rows = diasDow.map((dow, i) => {
      const d = byDow[dow];
      const n = parseInt(d?.total) || 0;
      const e = parseFloat(d?.valoracion) || 0;
      const pct = total ? Math.round(n / total * 100) : 0;
      return `<tr>
        <td><strong>${diasLabels[i]}</strong></td>
        <td style="text-align:center">${n}</td>
        <td style="text-align:right">${e.toLocaleString('es-ES', {minimumFractionDigits:2})} €</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
              <div style="height:100%;background:var(--teal-600);border-radius:4px;width:${pct}%"></div>
            </div>
            <span style="font-size:12px;color:var(--text-mid);min-width:32px">${pct}%</span>
          </div>
        </td>
      </tr>`;
    });

    container.innerHTML = `
      <table>
        <thead><tr>
          <th>Día de la semana</th>
          <th style="text-align:center">Nº Incidencias</th>
          <th style="text-align:right">Valoración €</th>
          <th>Distribución</th>
        </tr></thead>
        <tbody>
          ${rows.join('')}
          <tr style="font-weight:700;background:var(--teal-50)">
            <td>Total</td>
            <td style="text-align:center">${total}</td>
            <td style="text-align:right">${totalEur.toLocaleString('es-ES', {minimumFractionDigits:2})} €</td>
            <td>100%</td>
          </tr>
        </tbody>
      </table>`;
  }

  async function loadYears() {
    try {
      const years = await API.get('/dashboard/anios');
      const sel = document.getElementById('f-anio');
      if (!sel) return;
      // Limpiar opciones excepto la primera ("Todos los años")
      while (sel.options.length > 1) sel.remove(1);
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        sel.appendChild(opt);
      });
    } catch { /* sin datos aún */ }
  }

  function resetFilters() {
    ['f-area','f-dept','f-programa','f-estado','f-prioridad','f-anio','f-mes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    load();
  }

  return { load, loadYears, resetFilters };
})();
