const PendientesModule = (() => {

  function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('es-ES');
  }

  async function load() {
    const container = document.getElementById('pendientes-table');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
      const data = await API.get('/nc?pendientes=true&limit=100&page=1');
      const list = data.data || [];

      const badge = document.getElementById('badge-pendientes');
      if (badge) {
        if (list.length > 0) {
          badge.textContent = list.length;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      if (!list.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">OK</div>
            <p>No hay incidencias pendientes de revision.</p>
          </div>`;
        return;
      }

      container.innerHTML = `
        <table>
          <thead><tr>
            <th>ID</th>
            <th>Proyecto</th>
            <th>Departamento</th>
            <th>Area</th>
            <th>Detectado por</th>
            <th>Fecha</th>
            <th>Remitente</th>
            <th>Acciones</th>
          </tr></thead>
          <tbody>
          ${list.map(nc => `
            <tr>
              <td><strong>${nc.id}</strong></td>
              <td>${nc.codigo_proyecto}</td>
              <td>${nc.departamento}</td>
              <td>${nc.area || '-'}</td>
              <td>${nc.detectado_por}</td>
              <td>${formatDate(nc.fecha_deteccion)}</td>
              <td style="font-size:12px;color:var(--text-low)">${nc.email_remitente || '-'}</td>
              <td>
                <button class="btn btn-sm" style="background:var(--teal-700);color:white;border:none"
                  onclick="PendientesModule.revisar('${nc.id}')">
                  Revisar
                </button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
    }
  }

  async function revisar(ncId) {
    await App.modal.startEdit(ncId);
  }

  async function loadBadge() {
    try {
      const data = await API.get('/nc?pendientes=true&limit=1&page=1');
      const badge = document.getElementById('badge-pendientes');
      if (!badge) return;

      const total = data.total || 0;

      if (total > 0) {
        badge.textContent = total > 9 ? '9+' : total;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }

    } catch (err) {
      console.error('Error cargando badge:', err);
    }
  }

  return { load, revisar, loadBadge };
})();
