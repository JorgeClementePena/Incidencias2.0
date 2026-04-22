const CatalogosModule = (() => {
  const fallback = {
    areas: ['Producción', 'NDT', 'Laboratorio', 'Ingeniería', 'G-CAD'],
    departamentos: [
      'Ingeniería',
      'Laboratorio y NDT',
      'Nextgen factory',
      'Producción',
      'Prototipos',
      'Termoplásticos',
      'Termoestables',
    ],
    programas: [
      'Laboratorio y Calidad',
      'Programa aeronáuticos',
      'Programa Airbus comercial',
      'P. no aeronáuticos y P. financiados',
      'Programa no aeronáuticos',
      'Programa finanzas',
    ],
    categorias: [],
    categoriasPorArea: {},
    categoriasDisponibles: [],
  };

  let config = { ...fallback };
  let loadPromise = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toIdSuffix(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  async function load(force = false) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = API.get('/catalogos/config')
      .then(data => {
        config = {
          ...fallback,
          ...data,
          categorias: Array.isArray(data.categorias) ? data.categorias : [],
          categoriasPorArea: data.categoriasPorArea || {},
          categoriasDisponibles: data.categoriasDisponibles || [],
        };
        applySelects();
        renderAdminPage();
        return config;
      })
      .catch(err => {
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  }

  function getAreas() {
    return config.areas?.length ? config.areas : fallback.areas;
  }

  function getDepartamentos() {
    return config.departamentos?.length ? config.departamentos : fallback.departamentos;
  }

  function getProgramas() {
    return config.programas?.length ? config.programas : fallback.programas;
  }

  function getCategoriasPorArea(area) {
    return config.categoriasPorArea?.[area] || [];
  }

  function getCategoriasDisponibles() {
    return config.categoriasDisponibles || [];
  }

  function fillSelect(selectId, values, placeholder, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const options = [`<option value="">${escapeHtml(placeholder)}</option>`]
      .concat(values.map(value => {
        const selected = value === selectedValue ? ' selected' : '';
        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
      }));
    select.innerHTML = options.join('');
  }

  function applySelects() {
    const areas = getAreas();
    const departamentos = getDepartamentos();
    const programas = getProgramas();

    fillSelect('nc-area', areas, '— Seleccionar —', document.getElementById('nc-area')?.value || '');
    fillSelect('edit-area', areas, '— Seleccionar —', document.getElementById('edit-area')?.value || '');
    fillSelect('f-area', areas, 'Todas las áreas', document.getElementById('f-area')?.value || '');
    fillSelect('s-area', areas, 'Todas las áreas', document.getElementById('s-area')?.value || '');

    fillSelect('nc-departamento', departamentos, '— Seleccionar —', document.getElementById('nc-departamento')?.value || '');
    fillSelect('edit-departamento', departamentos, '— Seleccionar —', document.getElementById('edit-departamento')?.value || '');
    fillSelect('f-dept', departamentos, 'Todos los depts.', document.getElementById('f-dept')?.value || '');
    fillSelect('s-dept', departamentos, 'Todos los departamentos', document.getElementById('s-dept')?.value || '');

    fillSelect('nc-programa', programas, '— Seleccionar —', document.getElementById('nc-programa')?.value || '');
    fillSelect('edit-programa', programas, '— Seleccionar —', document.getElementById('edit-programa')?.value || '');
    fillSelect('f-programa', programas, 'Todos los programas', document.getElementById('f-programa')?.value || '');

    fillSelect('s-cat', getCategoriasDisponibles(), 'Todas las categorías', document.getElementById('s-cat')?.value || '');
  }

  function syncCategoriaSelect(area, selectedValue = '') {
    const categorias = getCategoriasPorArea(area);
    fillSelect(
      'edit-categoria',
      categorias,
      area ? '— Seleccionar —' : '— Selecciona primero el área —',
      categorias.includes(selectedValue) ? selectedValue : ''
    );

    const select = document.getElementById('edit-categoria');
    if (!select) return;

    if (selectedValue && !categorias.includes(selectedValue)) {
      const option = document.createElement('option');
      option.value = selectedValue;
      option.textContent = `${selectedValue} (legacy)`;
      option.selected = true;
      select.appendChild(option);
    }

    select.disabled = !area;
  }

  function bindEditArea() {
    const areaSelect = document.getElementById('edit-area');
    if (!areaSelect || areaSelect.dataset.catalogosBound === 'true') return;
    areaSelect.dataset.catalogosBound = 'true';
    areaSelect.addEventListener('change', () => {
      syncCategoriaSelect(areaSelect.value, '');
    });
  }

  function renderAdminPage() {
    const container = document.getElementById('categorias-admin-grid');
    if (!container) return;

    const areas = getAreas();
    container.innerHTML = areas.map(area => {
      const areaKey = toIdSuffix(area);
      const categorias = (config.categorias || []).filter(item => item.area === area);
      return `
        <section class="card categorias-card">
          <div class="card-header">
            <div class="card-title">${escapeHtml(area)}</div>
            <span class="categorias-count">${categorias.length}</span>
          </div>
          <div class="card-body">
            <div class="categorias-list">
              ${categorias.length ? categorias.map(item => `
                <div class="categoria-row">
                  <input
                    class="field-input categoria-input"
                    id="categoria-nombre-${escapeHtml(item.id)}"
                    type="text"
                    value="${escapeHtml(item.nombre)}"
                  >
                  <button class="btn btn-secondary btn-sm" onclick="App.catalogos.saveCategoria('${escapeHtml(item.id)}','${escapeHtml(item.area)}')">Guardar</button>
                  <button class="btn btn-danger btn-sm" onclick="App.catalogos.deleteCategoria('${escapeHtml(item.id)}')">Quitar</button>
                </div>
              `).join('') : '<div class="empty-state compact-empty"><p>Sin categorías configuradas.</p></div>'}
            </div>
            <div class="categoria-row categoria-row-new">
              <input
                class="field-input categoria-input"
                id="categoria-nueva-${areaKey}"
                type="text"
                placeholder="Nueva categoría para ${escapeHtml(area)}"
              >
              <button class="btn btn-primary btn-sm" onclick="App.catalogos.addCategoria('${escapeHtml(area)}')">Añadir</button>
            </div>
          </div>
        </section>`;
    }).join('');
  }

  async function init() {
    bindEditArea();
    await load();
  }

  async function refresh() {
    loadPromise = null;
    await load(true);
  }

  async function startEdit(nc) {
    await load();
    syncCategoriaSelect(nc.area || '', nc.categoria || '');
  }

  async function addCategoria(area) {
    const input = document.getElementById(`categoria-nueva-${toIdSuffix(area)}`);
    const nombre = input?.value.trim() || '';
    if (!nombre) {
      App.toast('Escribe una categoría antes de añadirla.', 'error');
      return;
    }

    try {
      await API.post('/catalogos/categorias', { area, nombre });
      if (input) input.value = '';
      await refresh();
      App.toast('Categoría añadida');
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function saveCategoria(id, previousArea) {
    const input = document.getElementById(`categoria-nombre-${id}`);
    const nombre = input?.value.trim() || '';
    if (!nombre) {
      App.toast('El nombre no puede quedar vacío.', 'error');
      return;
    }

    try {
      await API.put(`/catalogos/categorias/${id}`, { area: previousArea, nombre });
      await refresh();
      App.toast('Categoría actualizada');
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function deleteCategoria(id) {
    if (!confirm('¿Quitar esta categoría del desplegable?')) return;
    try {
      await API.delete(`/catalogos/categorias/${id}`);
      await refresh();
      App.toast('Categoría eliminada');
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  return {
    init,
    load,
    refresh,
    startEdit,
    getAreas,
    getDepartamentos,
    getProgramas,
    getCategoriasPorArea,
    getCategoriasDisponibles,
    syncCategoriaSelect,
    renderAdminPage,
    addCategoria,
    saveCategoria,
    deleteCategoria,
  };
})();
