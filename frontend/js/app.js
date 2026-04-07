// frontend/js/app.js — Router principal y namespace global

const App = (() => {
  // Módulos
  const auth        = AuthModule;
  const form        = FormModule;
  const dashboard   = DashboardModule;
  const incidencias = IncidenciasModule;
  const importacion = ImportacionModule;
  const usuarios    = UsuariosModule;
  const catalogos   = CatalogosModule;
  const modal       = ModalModule;

  // Toast
  let toastTimer = null;
  function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast ${type} show`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
  }

  // Navegación
  const pages = {
    'nueva-nc':   { el: 'page-nueva-nc',    onEnter: () => form.init() },
    'dashboard':  { el: 'page-dashboard',   onEnter: () => { dashboard.loadYears(); dashboard.load(); } },
    'incidencias':{ el: 'page-incidencias', onEnter: () => incidencias.load(1) },
    'usuarios':   { el: 'page-usuarios',    onEnter: () => usuarios.load(),                               adminOnly: true },
    'pendientes': { el: 'page-pendientes', onEnter: () => PendientesModule.load(), adminOnly: true },
    'categorias': { el: 'page-categorias',  onEnter: () => catalogos.renderAdminPage(), adminOnly: true },
    'importacion': { el: 'page-importacion', onEnter: () => importacion.init(), adminOnly: true },
  };

  function navigate(name) {
    const user = auth.currentUser();
    const page = pages[name];
    if (!page) return;
    if (page.adminOnly && user?.role !== 'admin') return;

    // Ocultar todas las páginas
    document.querySelectorAll('.page').forEach(el => el.style.display = 'none');
    // Mostrar la pedida
    const pageEl = document.getElementById(page.el);
    if (pageEl) pageEl.style.display = 'block';

    // Actualizar sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === name);
    });

    if (page.onEnter) page.onEnter();
  }

  // Inicialización
  function init() {
    if (!auth.tryRestoreSession()) {
      document.getElementById('auth-screen').style.display = 'flex';
    } else {
      catalogos.init().catch(() => {});
      PendientesModule.loadBadge();
    }
  }

  window.addEventListener('DOMContentLoaded', init);

  return { auth, form, dashboard, incidencias, importacion, usuarios, catalogos, modal, navigate, toast, showToast: toast };
})();
