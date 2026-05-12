const UsuariosModule = (() => {

  const AREAS = ['Producción', 'NDT', 'Laboratorio', 'Ingeniería', 'G-CAD'];
  const DEPARTAMENTOS = ['Ingeniería', 'Laboratorio y NDT', 'Nextgen factory', 'Producción', 'Prototipos', 'Termoplásticos', 'Termoestables'];
  const PROGRAMAS = ['Laboratorio y Calidad', 'Programa aeronáuticos', 'Programa Airbus comercial', 'Programa no aeronáuticos', 'Programa finanzas'];

  function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('es-ES');
  }

  async function load() {
    const container = document.getElementById('usuarios-table');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
      const users = await API.get('/users');
      const me = AuthModule.currentUser();

      if (!users.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">Users</div><p>No hay usuarios.</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Usuario</th><th>Email</th><th>Departamento</th>
            <th>Rol</th><th>Estado</th><th>Registrado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="avatar" style="width:30px;height:30px;font-size:12px">${u.name.charAt(0).toUpperCase()}</div>
                  <strong>${u.name}</strong> ${u.id === me?.id ? '<span style="font-size:11px;color:var(--text-low)">(tu)</span>' : ''}
                </div>
              </td>
              <td style="font-size:13px">${u.email}</td>
              <td>${u.department || '-'}</td>
              <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
              <td><span class="badge ${u.active ? 'badge-closed' : 'badge-open'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
              <td style="font-size:12.5px;color:var(--text-mid)">${formatDate(u.created_at)}</td>
              <td>
                ${u.id !== me?.id ? `
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-secondary btn-sm" onclick="App.usuarios.toggleRole('${u.id}','${u.role}')">
                      ${u.role === 'admin' ? 'A usuario' : 'A admin'}
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="App.usuarios.toggleActive('${u.id}',${u.active})">
                      ${u.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button class="btn btn-sm" style="background:var(--teal-50);color:var(--teal-700);border:1px solid var(--teal-200)"
                      onclick="App.usuarios.openResponsabilidades('${u.id}','${u.name}')">
                      Responsabilidades
                    </button>
                    ${u.role !== 'admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="App.usuarios.deleteUser('${u.id}','${u.name}')">Borrar</button>` : ''}
                  </div>` : '<span style="font-size:12px;color:var(--text-low)">-</span>'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
    }
  }

  async function toggleRole(id, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await API.patch('/users/' + id + '/role', { role: newRole });
      App.showToast(`Rol cambiado a ${newRole}`);
      load();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }

  async function toggleActive(id, currentActive) {
    try {
      await API.patch('/users/' + id + '/active', { active: !currentActive });
      App.showToast(currentActive ? 'Usuario desactivado' : 'Usuario activado');
      load();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }

  async function deleteUser(id, name) {
    if (!confirm(`Eliminar el usuario "${name}"? Esta accion no se puede deshacer.`)) return;
    try {
      await API.delete('/users/' + id);
      App.showToast('Usuario eliminado');
      load();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }

  let _respUserId = null;

  async function openResponsabilidades(userId, userName) {
    _respUserId = userId;
    const modal = document.getElementById('modal-responsabilidades');
    document.getElementById('resp-user-name').textContent = userName;
    document.getElementById('resp-error').style.display = 'none';
    modal.classList.add('open');
    await loadResponsabilidades();
  }

  async function loadResponsabilidades() {
    const list = document.getElementById('resp-list');
    list.innerHTML = '<div style="font-size:13px;color:var(--text-low)">Cargando...</div>';
    try {
      const resps = await API.get('/users/' + _respUserId + '/responsabilidades');
      if (!resps.length) {
        list.innerHTML = '<div style="font-size:13px;color:var(--text-low)">Sin responsabilidades asignadas.</div>';
        return;
      }
      const tipoLabel = { area: 'Area', departamento: 'Departamento', programa: 'Programa' };
      list.innerHTML = resps.map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--teal-50);border-radius:8px;margin-bottom:6px">
          <div>
            <span style="font-size:11px;color:var(--teal-600);font-weight:700;text-transform:uppercase">${tipoLabel[r.tipo] || r.tipo}</span>
            <div style="font-size:13px;font-weight:600">${r.valor}</div>
          </div>
          <button class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:12px" onclick="App.usuarios.deleteResponsabilidad('${r.id}')">X</button>
        </div>`).join('');
    } catch (err) {
      list.innerHTML = `<div style="color:var(--danger);font-size:13px">${err.message}</div>`;
    }
  }

  async function addResponsabilidad() {
    const tipo = document.getElementById('resp-tipo').value;
    const valor = document.getElementById('resp-valor').value;
    const errEl = document.getElementById('resp-error');
    errEl.style.display = 'none';

    if (!tipo || !valor) {
      errEl.textContent = 'Selecciona tipo y valor.';
      errEl.style.display = 'block';
      return;
    }

    try {
      await API.post('/users/' + _respUserId + '/responsabilidades', { tipo, valor });
      document.getElementById('resp-tipo').value = '';
      document.getElementById('resp-valor').innerHTML = '<option value="">- Selecciona primero el tipo -</option>';
      App.showToast('Responsabilidad anadida');
      await loadResponsabilidades();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  async function deleteResponsabilidad(respId) {
    try {
      await API.delete('/users/' + _respUserId + '/responsabilidades/' + respId);
      App.showToast('Responsabilidad eliminada');
      await loadResponsabilidades();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }

  function updateValores() {
    const tipo = document.getElementById('resp-tipo').value;
    const sel = document.getElementById('resp-valor');
    const opts = {
      area: (typeof CatalogosModule !== 'undefined' ? CatalogosModule.getAreas() : AREAS),
      departamento: (typeof CatalogosModule !== 'undefined' ? CatalogosModule.getDepartamentos() : DEPARTAMENTOS),
      programa: (typeof CatalogosModule !== 'undefined' ? CatalogosModule.getProgramas() : PROGRAMAS),
    };
    const list = opts[tipo] || [];
    sel.innerHTML = list.length
      ? '<option value="">- Seleccionar -</option>' + list.map(v => `<option value="${v}">${v}</option>`).join('')
      : '<option value="">- Selecciona primero el tipo -</option>';
  }

  return { load, toggleRole, toggleActive, deleteUser, openResponsabilidades, addResponsabilidad, deleteResponsabilidad, updateValores };
})();
