const IncidenciasModule = (() => {
  let currentPage = 1;

  function badgeEstado(estado) {
    const map = { 'Abierta': 'badge-open', 'En progreso': 'badge-progress', 'Cerrada': 'badge-closed' };
    return `<span class="badge ${map[estado] || ''}">${estado}</span>`;
  }

  function badgeCat(categoria) {
    return categoria ? `<span class="badge badge-cat">${categoria}</span>` : '&mdash;';
  }

  function badgePrioridad(prioridad) {
    const map = {
      'Nivel 1': 'badge-priority-1',
      'Nivel 2': 'badge-priority-2',
      'Nivel 3': 'badge-priority-3',
    };
    return prioridad ? `<span class="badge ${map[prioridad] || 'badge-cat'}">${prioridad}</span>` : '&mdash;';
  }

  function badgeRepetidaAutomatica(nc) {
    return nc.repetida_automatica
      ? '<span class="badge badge-repeat-auto">Repetida</span>'
      : '&mdash;';
  }

  async function copyProjectCode(code) {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      App.showToast('Proyecto copiado');
    } catch {
      App.showToast('No se pudo copiar el proyecto', 'error');
    }
  }

  function formatDate(value) {
    if (!value) return '&mdash;';
    const parts = value.split('T')[0].split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
  }

  function buildQuery(page = currentPage) {
    const search = document.getElementById('s-search')?.value || '';
    const estado = document.getElementById('s-estado')?.value || '';
    const departamento = document.getElementById('s-dept')?.value || '';
    const area = document.getElementById('s-area')?.value || '';
    const categoria = document.getElementById('s-cat')?.value || '';
    const prioridad = document.getElementById('s-prioridad')?.value || '';

    const q = new URLSearchParams({ page, limit: 25 });
    if (search) q.append('search', search);
    if (estado) q.append('estado', estado);
    if (departamento) q.append('departamento', departamento);
    if (area) q.append('area', area);
    if (categoria) q.append('categoria', categoria);
    if (prioridad) q.append('prioridad', prioridad);
    return q;
  }

  async function load(page = currentPage) {
    currentPage = page;
    const q = buildQuery(page);

    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.style.display = AuthModule.currentUser()?.role === 'admin' ? 'inline-flex' : 'none';
    }

    const container = document.getElementById('incidencias-table');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
      const { data, total, pages } = await API.get('/nc?' + q.toString());

      if (!data.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No se encontraron incidencias.</p></div>';
        document.getElementById('incidencias-pag').innerHTML = '';
        return;
      }

      container.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Proyecto</th>
                <th>Departamento</th>
                <th>Área</th>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Prioridad</th>
                <th>Repetida</th>
                <th>Estado</th>
                <th>Valoración</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.map(nc => `
                <tr>
                  <td><span class="nc-code">${nc.id}</span></td>
                  <td><button class="copy-project-btn" type="button" onclick="App.incidencias.copyProjectCode('${String(nc.codigo_proyecto || '').replace(/'/g, "\\'")}')">${nc.codigo_proyecto}</button></td>
                  <td>${nc.departamento}</td>
                  <td>${nc.area || '&mdash;'}</td>
                  <td>${formatDate(nc.fecha_deteccion)}</td>
                  <td>${badgeCat(nc.categoria)}</td>
                  <td>${badgePrioridad(nc.prioridad)}</td>
                  <td>${badgeRepetidaAutomatica(nc)}</td>
                  <td>${badgeEstado(nc.estado)}</td>
                  <td style="font-family:'DM Mono',monospace;font-size:12.5px">${nc.valoracion_euros ? parseFloat(nc.valoracion_euros).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : '&mdash;'}</td>
                  <td><button class="btn btn-secondary btn-sm" onclick="App.modal.open('${nc.id}')">Ver</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;

      const pag = document.getElementById('incidencias-pag');
      if (pages <= 1) {
        pag.innerHTML = '';
        return;
      }

      pag.innerHTML = `
        <button class="btn btn-ghost btn-sm" onclick="App.incidencias.load(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="page-info">Página ${page} de ${pages} (${total} total)</span>
        <button class="btn btn-ghost btn-sm" onclick="App.incidencias.load(${page + 1})" ${page >= pages ? 'disabled' : ''}>Siguiente →</button>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
    }
  }

  async function exportCsv() {
    const user = AuthModule.currentUser();
    if (user?.role !== 'admin') {
      App.showToast('Solo los administradores pueden exportar incidencias.', 'error');
      return;
    }

    const button = document.getElementById('btn-export-csv');
    const previousText = button?.textContent || 'Exportar CSV';
    if (button) {
      button.disabled = true;
      button.textContent = 'Exportando...';
    }

    try {
      const q = buildQuery(1);
      const token = localStorage.getItem('nc_token') || '';
      const response = await fetch(`/api/nc/export.csv?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo exportar el CSV.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = response.headers.get('Content-Disposition') || '';
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      link.href = url;
      link.download = fileNameMatch?.[1] || 'incidencias.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      App.showToast('CSV exportado correctamente.');
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previousText;
      }
    }
  }

  return { load, exportCsv, copyProjectCode };
})();

const ModalModule = (() => {
  let currentNCId = null;

  function formatDate(value) {
    if (!value) return '&mdash;';
    const parts = value.split('T')[0].split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
  }

  function calcDiasLaborables(inicio, fin) {
    if (!fin) return 'Pendiente de cerrar';
    const start = new Date(inicio);
    const end = new Date(fin);
    let dias = 0;
    const current = new Date(start);

    while (current <= end) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) dias++;
      current.setDate(current.getDate() + 1);
    }

    return dias === 1 ? '1 día laborable' : `${dias} días laborables`;
  }

  async function open(ncId) {
    currentNCId = ncId;
    document.getElementById('modal-nc-id').textContent = ncId;
    document.getElementById('modal-nc-meta').textContent = 'Cargando...';
    document.getElementById('modal-fields').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
    document.getElementById('modal-historial').innerHTML = '';
    document.getElementById('modal-nc').classList.add('open');

    try {
      const { nc, historial } = await API.get('/nc/' + ncId);

      document.getElementById('modal-nc-meta').textContent =
        `Registrada el ${formatDate(nc.fecha_deteccion)} por ${nc.creado_por_nombre || nc.detectado_por}`;

      const fields = [
        ['Código Proyecto', nc.codigo_proyecto],
        ['Proceso / PE', nc.proceso],
        ['Departamento', nc.departamento],
        ['Área', nc.area || '&mdash;'],
        ['Programa', nc.programa || '&mdash;'],
        ['Detectado por', nc.detectado_por],
        ['¿Afecta al MA?', nc.afecta_ma ? 'Sí' : 'No'],
        ['Afecta resultado', nc.afecta_resultado ? 'Sí' : 'No'],
        ['Categoría', nc.categoria || '&mdash;'],
        ['Prioridad', nc.prioridad || '&mdash;'],
        ['Repetida', nc.repetida_automatica ? 'Sí' : 'No'],
        ['Estado', nc.estado],
        ['Valoración €', nc.valoracion_euros ? parseFloat(nc.valoracion_euros).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : '&mdash;'],
        ['Email destino', nc.email_destino || '&mdash;'],
        ['Descripción', nc.descripcion, true],
        ['Causas', nc.causas || '&mdash;', true],
        ['Acción Inmediata', nc.accion_inmediata || '&mdash;', true],
        ['Acción Correctora', nc.accion_correctora || '&mdash;', true],
        ['Observaciones', nc.observaciones || '&mdash;', true],
        ['Tiempo resolución', calcDiasLaborables(nc.created_at, nc.closed_at)],
      ];

      document.getElementById('modal-fields').innerHTML = fields.map(([key, value, full]) => `
        <div class="detail-item ${full ? 'full' : ''}">
          <div class="detail-key">${key}</div>
          <div class="detail-val">${value}</div>
        </div>
      `).join('');

      const histEl = document.getElementById('modal-historial');
      if (historial.length) {
        histEl.innerHTML = historial.map(h => `
          <div class="historial-item">
            <div class="historial-dot"></div>
            <div class="historial-text">
              <strong>${h.campo}</strong> cambiado de <em>${h.valor_antes}</em> a <strong>${h.valor_nuevo}</strong>
              ${h.por_nombre ? `por <span style="color:var(--teal-600)">${h.por_nombre}</span>` : ''}
            </div>
            <div class="historial-date">${new Date(h.cambiado_at).toLocaleString('es-ES')}</div>
          </div>
        `).join('');
      } else {
        histEl.innerHTML = '<p style="font-size:13px;color:var(--text-low)">Sin cambios registrados.</p>';
      }

      const user = AuthModule.currentUser();
      document.getElementById('modal-admin-actions').style.display = user?.role === 'admin' ? 'block' : 'none';
    } catch (err) {
      document.getElementById('modal-fields').innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
    }
  }

  function close() {
    document.getElementById('modal-nc').classList.remove('open');
    currentNCId = null;
  }

  async function changeStatus(estado) {
    if (!currentNCId) return;
    try {
      await API.patch('/nc/' + currentNCId + '/estado', { estado });
      App.toast(`Estado actualizado a "${estado}"`);
      close();
      App.incidencias.load();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function startEdit(ncId) {
    if (ncId) currentNCId = ncId;
    const { nc } = await API.get('/nc/' + currentNCId);
    if (typeof CatalogosModule !== 'undefined') {
      await CatalogosModule.startEdit(nc);
    }

    document.getElementById('edit-nc-id').textContent = currentNCId;
    document.getElementById('edit-proyecto').value = nc.codigo_proyecto || '';
    document.getElementById('edit-proceso').value = nc.proceso || '';
    document.getElementById('edit-fecha').value = nc.fecha_deteccion?.split('T')[0] || '';
    document.getElementById('edit-detecta').value = nc.detectado_por || '';
    document.getElementById('edit-departamento').value = nc.departamento || '';
    document.getElementById('edit-area').value = nc.area || '';
    document.getElementById('edit-programa').value = nc.programa || '';
    document.getElementById('edit-categoria').value = nc.categoria || '';
    document.getElementById('edit-prioridad').value = nc.prioridad || '';
    document.getElementById('edit-afecta-ma').value = nc.afecta_ma ? 'true' : 'false';
    document.getElementById('edit-afecta-resultado').value = nc.afecta_resultado ? 'true' : 'false';
    document.getElementById('edit-valoracion').value = nc.valoracion_euros || 0;
    document.getElementById('edit-email-destino').value = nc.email_destino || '';
    document.getElementById('edit-descripcion').value = nc.descripcion || '';
    document.getElementById('edit-causas').value = nc.causas || '';
    document.getElementById('edit-accion-inmediata').value = nc.accion_inmediata || '';
    document.getElementById('edit-accion-correctora').value = nc.accion_correctora || '';
    document.getElementById('edit-observaciones').value = nc.observaciones || '';
    document.getElementById('edit-error').style.display = 'none';
    document.getElementById('modal-edit').classList.add('open');
  }

  async function saveEdit(notificar = false) {
    const errEl = document.getElementById('edit-error');
    errEl.style.display = 'none';

    try {
      await API.put('/nc/' + currentNCId, {
        codigo_proyecto: document.getElementById('edit-proyecto').value.trim(),
        proceso: document.getElementById('edit-proceso').value.trim(),
        fecha_deteccion: document.getElementById('edit-fecha').value,
        detectado_por: document.getElementById('edit-detecta').value.trim(),
        departamento: document.getElementById('edit-departamento').value,
        area: document.getElementById('edit-area').value,
        programa: document.getElementById('edit-programa').value,
        categoria: document.getElementById('edit-categoria').value,
        prioridad: document.getElementById('edit-prioridad').value,
        afecta_ma: document.getElementById('edit-afecta-ma').value === 'true',
        afecta_resultado: document.getElementById('edit-afecta-resultado').value === 'true',
        valoracion_euros: document.getElementById('edit-valoracion').value,
        email_destino: document.getElementById('edit-email-destino').value.trim(),
        descripcion: document.getElementById('edit-descripcion').value.trim(),
        causas: document.getElementById('edit-causas').value.trim(),
        accion_inmediata: document.getElementById('edit-accion-inmediata').value.trim(),
        accion_correctora: document.getElementById('edit-accion-correctora').value.trim(),
        observaciones: document.getElementById('edit-observaciones').value.trim(),
        notificar_creador: notificar,
      });

      document.getElementById('modal-edit').classList.remove('open');
      App.modal.close();
      App.showToast(notificar ? 'Incidencia guardada y creador notificado' : 'Incidencia guardada');
      IncidenciasModule.load();
      if (typeof PendientesModule !== 'undefined') {
        PendientesModule.loadBadge();
        const pendientesPage = document.getElementById('page-pendientes');
        if (pendientesPage && pendientesPage.style.display !== 'none') {
          PendientesModule.load();
        }
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  document.getElementById('modal-nc')?.addEventListener('click', function onOverlayClick(e) {
    if (e.target === this) close();
  });

  return { open, close, changeStatus, startEdit, saveEdit };
})();
