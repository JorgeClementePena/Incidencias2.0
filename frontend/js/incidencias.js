// frontend/js/incidencias.js

const IncidenciasModule = (() => {
  let currentPage = 1;
  let currentNC   = null;

  function badgeEstado(e) {
    const map = { 'Abierta':'badge-open', 'En progreso':'badge-progress', 'Cerrada':'badge-closed' };
    return `<span class="badge ${map[e]||''}">${e}</span>`;
  }

  function badgeCat(c) {
    return c ? `<span class="badge badge-cat">${c}</span>` : '—';
  }

  function formatDate(d) {
    if (!d) return '—';
    const p = d.split('T')[0].split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  }

  async function load(page = currentPage) {
    currentPage = page;
    const search = document.getElementById('s-search')?.value || '';
    const estado = document.getElementById('s-estado')?.value || '';
    const area   = document.getElementById('s-area')?.value   || '';
    const cat    = document.getElementById('s-cat')?.value    || '';

    const q = new URLSearchParams({ page, limit: 25 });
    if (search) q.append('search', search);
    if (estado) q.append('estado', estado);
    if (area)   q.append('area', area);
    if (cat)    q.append('categoria', cat);

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
          <thead><tr>
            <th>Código</th><th>Proyecto</th><th>Departamento</th>
            <th>Área</th><th>Fecha</th><th>Categoría</th>
            <th>Estado</th><th>Valoración</th><th></th>
          </tr></thead>
          <tbody>
          ${data.map(nc => `
            <tr>
              <td><span class="nc-code">${nc.id}</span></td>
              <td>${nc.codigo_proyecto}</td>
              <td>${nc.departamento}</td>
              <td>${nc.area || '—'}</td>
              <td>${formatDate(nc.fecha_deteccion)}</td>
              <td>${badgeCat(nc.categoria)}</td>
              <td>${badgeEstado(nc.estado)}</td>
              <td style="font-family:'DM Mono',monospace;font-size:12.5px">${nc.valoracion_euros ? parseFloat(nc.valoracion_euros).toLocaleString('es-ES',{minimumFractionDigits:2})+' €' : '—'}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="App.modal.open('${nc.id}')">Ver</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>`;

      // Paginación
      const pag = document.getElementById('incidencias-pag');
      if (pages <= 1) { pag.innerHTML = ''; return; }
      pag.innerHTML = `
        <button class="btn btn-ghost btn-sm" onclick="App.incidencias.load(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="page-info">Página ${page} de ${pages} (${total} total)</span>
        <button class="btn btn-ghost btn-sm" onclick="App.incidencias.load(${page + 1})" ${page >= pages ? 'disabled' : ''}>Siguiente →</button>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
    }
  }

  return { load };
})();

// ─── Modal NC ───────────────────────────────────────────────
const ModalModule = (() => {
  let currentNCId = null;

  function formatDate(d) {
    if (!d) return '—';
    const p = d.split('T')[0].split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  }

  async function open(ncId) {
    currentNCId = ncId;
    document.getElementById('modal-nc-id').textContent  = ncId;
    document.getElementById('modal-nc-meta').textContent = 'Cargando…';
    document.getElementById('modal-fields').innerHTML   = '<div class="spinner" style="margin:20px auto"></div>';
    document.getElementById('modal-historial').innerHTML = '';
    document.getElementById('modal-nc').classList.add('open');

    try {
      const { nc, historial } = await API.get('/nc/' + ncId);

      document.getElementById('modal-nc-meta').textContent =
        `Registrada el ${formatDate(nc.fecha_deteccion)} por ${nc.creado_por_nombre || nc.detectado_por}`;

      const fields = [
        ['Código Proyecto', nc.codigo_proyecto],
        ['Proceso / PE',    nc.proceso],
        ['Departamento',    nc.departamento],
        ['Área',            nc.area || '—'],
        ['Programa',        nc.programa || '—'],
        ['Detectado por',   nc.detectado_por],
        ['¿Afecta al MA?',  nc.afecta_ma ? 'Sí' : 'No'],
        ['Afecta resultado',nc.afecta_resultado || '—'],
        ['Categoría',       nc.categoria || '—'],
        ['Estado',          nc.estado],
        ['Valoración €',    nc.valoracion_euros ? parseFloat(nc.valoracion_euros).toLocaleString('es-ES',{minimumFractionDigits:2})+' €' : '—'],
        ['Email destino',   nc.email_destino],
        ['Descripción',     nc.descripcion, true],
        ['Causas',          nc.causas || '—', true],
        ['Acción Inmediata',nc.accion_inmediata || '—', true],
        ['Acción Correctora',nc.accion_correctora || '—', true],
        ['Tiempo resolución', calcDiasLaborables(nc.created_at, nc.closed_at)],
      ];

      document.getElementById('modal-fields').innerHTML = fields.map(([k, v, full]) =>
        `<div class="detail-item ${full ? 'full' : ''}">
          <div class="detail-key">${k}</div>
          <div class="detail-val">${v}</div>
        </div>`
      ).join('');

      // Historial
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
          </div>`).join('');
      } else {
        histEl.innerHTML = '<p style="font-size:13px;color:var(--text-low)">Sin cambios registrados.</p>';
      }

      // Acciones admin
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

  function calcDiasLaborables(inicio, fin) {
    if (!fin) return 'Pendiente de cerrar';
    let start = new Date(inicio);
    let end   = new Date(fin);
    let dias  = 0;
    const curr = new Date(start);
    while (curr <= end) {
      const dow = curr.getDay();
      if (dow !== 0 && dow !== 6) dias++;
      curr.setDate(curr.getDate() + 1);
    }
    return dias === 1 ? '1 día laborable' : `${dias} días laborables`;
  }

  async function startEdit(ncId) {
    if (ncId) currentNCId = ncId;
    const { nc } = await API.get('/nc/' + currentNCId);
    if (typeof CatalogosModule !== 'undefined') {
      await CatalogosModule.startEdit(nc);
    }
    document.getElementById('edit-nc-id').textContent = currentNCId;
    document.getElementById('edit-proyecto').value         = nc.codigo_proyecto || '';
    document.getElementById('edit-proceso').value          = nc.proceso || '';
    document.getElementById('edit-fecha').value            = nc.fecha_deteccion?.split('T')[0] || '';
    document.getElementById('edit-detecta').value          = nc.detectado_por || '';
    document.getElementById('edit-departamento').value     = nc.departamento || '';
    document.getElementById('edit-area').value             = nc.area || '';
    document.getElementById('edit-programa').value         = nc.programa || '';
    document.getElementById('edit-categoria').value        = nc.categoria || '';
    document.getElementById('edit-afecta-ma').value        = nc.afecta_ma ? 'true' : 'false';
    document.getElementById('edit-afecta-resultado').value = nc.afecta_resultado || '';
    document.getElementById('edit-valoracion').value       = nc.valoracion_euros || 0;
    document.getElementById('edit-email-destino').value    = nc.email_destino || '';
    document.getElementById('edit-descripcion').value      = nc.descripcion || '';
    document.getElementById('edit-causas').value           = nc.causas || '';
    document.getElementById('edit-accion-inmediata').value = nc.accion_inmediata || '';
    document.getElementById('edit-accion-correctora').value= nc.accion_correctora || '';
    document.getElementById('edit-error').style.display   = 'none';
    document.getElementById('modal-edit').classList.add('open');
  }

  async function saveEdit(notificar = false) {
    const errEl = document.getElementById('edit-error');
    errEl.style.display = 'none';
    try {
      await API.put('/nc/' + currentNCId, {
        codigo_proyecto:   document.getElementById('edit-proyecto').value.trim(),
        proceso:           document.getElementById('edit-proceso').value.trim(),
        fecha_deteccion:   document.getElementById('edit-fecha').value,
        detectado_por:     document.getElementById('edit-detecta').value.trim(),
        departamento:      document.getElementById('edit-departamento').value,
        area:              document.getElementById('edit-area').value,
        programa:          document.getElementById('edit-programa').value,
        categoria:         document.getElementById('edit-categoria').value,
        afecta_ma:         document.getElementById('edit-afecta-ma').value === 'true',
        afecta_resultado:  document.getElementById('edit-afecta-resultado').value.trim(),
        valoracion_euros:  document.getElementById('edit-valoracion').value,
        email_destino:     document.getElementById('edit-email-destino').value.trim(),
        descripcion:       document.getElementById('edit-descripcion').value.trim(),
        causas:            document.getElementById('edit-causas').value.trim(),
        accion_inmediata:  document.getElementById('edit-accion-inmediata').value.trim(),
        accion_correctora: document.getElementById('edit-accion-correctora').value.trim(),
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

  // Cerrar al click fuera
  document.getElementById('modal-nc')?.addEventListener('click', function(e) {
    if (e.target === this) close();
  });

  return { open, close, changeStatus, startEdit, saveEdit };
})();
