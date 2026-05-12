const ImportacionModule = (() => {
  let previewRows = [];

  function token() {
    return localStorage.getItem('nc_token') || '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function yesNo(value) {
    return value ? 'Sí' : 'No';
  }

  function renderEmpty() {
    const confirmBtn = document.getElementById('import-confirm-btn');
    document.getElementById('import-summary').innerHTML =
      '<div class="empty-state compact-empty"><p>Sube un archivo para revisar la importación.</p></div>';
    document.getElementById('import-preview-table').innerHTML = '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Importar filas válidas';
    }
    previewRows = [];
  }

  function init() {
    if (!previewRows.length) renderEmpty();
  }

  async function preview() {
    const fileInput = document.getElementById('import-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      App.toast('Selecciona un archivo Excel antes de continuar.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    document.getElementById('import-summary').innerHTML = '<div class="empty-state compact-empty"><div class="spinner"></div></div>';
    document.getElementById('import-preview-table').innerHTML = '';
    document.getElementById('import-confirm-btn').disabled = true;

    let res;
    try {
      res = await fetch('/api/nc/import/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: formData,
      });
    } catch {
      App.toast('Error de conexión con el servidor.', 'error');
      renderEmpty();
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      App.toast(data.error || 'No se pudo analizar el archivo.', 'error');
      renderEmpty();
      return;
    }

    previewRows = data.rows || [];
    renderSummary(data.summary || { totalRows: 0, validRows: 0, invalidRows: 0 }, data.defaults || {});
    renderTable(previewRows);
    document.getElementById('import-confirm-btn').disabled = !(data.summary?.validRows > 0);
  }

  function renderSummary(summary, defaults) {
    document.getElementById('import-summary').innerHTML = `
      <div class="import-summary-grid">
        <div class="import-kpi"><strong>${summary.totalRows || 0}</strong><span>Filas leídas</span></div>
        <div class="import-kpi ok"><strong>${summary.validRows || 0}</strong><span>Válidas</span></div>
        <div class="import-kpi bad"><strong>${summary.invalidRows || 0}</strong><span>Con errores</span></div>
      </div>
      <div class="import-note">
        Campos no presentes en el Excel:
        <strong>Proceso/PE</strong> = ${escapeHtml(defaults.proceso || 'Importacion Excel')},
        <strong>Detectado por</strong> = ${escapeHtml(defaults.detectado_por || 'Importacion Excel')}.
      </div>
    `;
  }

  function renderTable(rows) {
    const container = document.getElementById('import-preview-table');
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state compact-empty"><p>No hay filas para mostrar.</p></div>';
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fila</th>
            <th>Estado</th>
            <th>Área</th>
            <th>Categoría</th>
            <th>Departamento</th>
            <th>Programa</th>
            <th>Código proyecto</th>
            <th>Fecha</th>
            <th>MA</th>
            <th>Resultado</th>
            <th>Observaciones</th>
            <th>Errores</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${row.rowNumber}</td>
              <td>${row.errors.length ? '<span class="badge badge-error">Error</span>' : '<span class="badge badge-ok">Válida</span>'}</td>
              <td>${escapeHtml(row.values?.area || row.raw?.area || '—')}</td>
              <td>${escapeHtml(row.values?.categoria || row.raw?.categoria || '—')}</td>
              <td>${escapeHtml(row.values?.departamento || row.raw?.departamento || '—')}</td>
              <td>${escapeHtml(row.values?.programa || row.raw?.programa || '—')}</td>
              <td>${escapeHtml(row.values?.codigo_proyecto || row.raw?.codigo_proyecto || '—')}</td>
              <td>${escapeHtml(row.values?.fecha_deteccion || row.raw?.fecha_deteccion || '—')}</td>
              <td>${row.values ? yesNo(row.values.afecta_ma) : '—'}</td>
              <td>${row.values ? yesNo(row.values.afecta_resultado) : '—'}</td>
              <td>${escapeHtml(row.values?.observaciones || row.raw?.observaciones || '—')}</td>
              <td>${row.errors.length ? escapeHtml(row.errors.join(' ')) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function commit() {
    const validRows = previewRows.filter(row => !row.errors.length);
    if (!validRows.length) {
      App.toast('No hay filas válidas para importar.', 'error');
      return;
    }

    const button = document.getElementById('import-confirm-btn');
    button.disabled = true;
    button.textContent = 'Importando...';

    try {
      const result = await API.post('/nc/import/commit', {
        rows: validRows.map(row => ({
          rowNumber: row.rowNumber,
          raw: row.raw,
        })),
      });

      App.toast(`${result.imported} incidencias importadas`);
      document.getElementById('import-file').value = '';
      renderEmpty();
      if (typeof PendientesModule !== 'undefined') {
        PendientesModule.loadBadge();
      }
      if (typeof IncidenciasModule !== 'undefined') {
        IncidenciasModule.load(1);
      }
    } catch (err) {
      App.toast(err.message, 'error');
      button.disabled = false;
      button.textContent = 'Importar filas válidas';
      return;
    }

    button.textContent = 'Importar filas válidas';
  }

  return { init, preview, commit };
})();
