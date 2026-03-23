const FormModule = (() => {

  async function loadNextNumber() {
    try {
      const data = await API.get('/nc?limit=1&page=1');
      const next = (data.total || 0) + 1;
      document.getElementById('nc-preview-num').textContent = 'NC-' + String(next).padStart(4, '0');
    } catch {
      document.getElementById('nc-preview-num').textContent = 'NC-XXXX';
    }
  }

  function init() {
    const d = new Date().toISOString().split('T')[0];
    document.getElementById('nc-fecha').value = d;
    loadNextNumber();
  }

  function reset() {
    const fields = [
      'nc-proyecto', 'nc-proceso', 'nc-programa', 'nc-descripcion',
      'nc-causas', 'nc-accion-inmediata',
      'nc-afecta-resultado', 'nc-valoracion'
    ];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('nc-area').value = '';
    document.getElementById('nc-departamento').value = '';
    document.getElementById('nc-afecta-ma').value = 'false';
    document.getElementById('nc-fecha').value = new Date().toISOString().split('T')[0];

    const user = AuthModule.currentUser();
    document.getElementById('nc-detecta').value = user ? user.name : '';

    loadNextNumber();
  }

  async function submit() {
    const proyecto = document.getElementById('nc-proyecto').value.trim();
    const proceso = document.getElementById('nc-proceso').value.trim();
    const fecha = document.getElementById('nc-fecha').value;
    const detecta = document.getElementById('nc-detecta').value.trim();
    const departamento = document.getElementById('nc-departamento').value;
    const descripcion = document.getElementById('nc-descripcion').value.trim();

    if (!proyecto || !proceso || !fecha || !detecta || !departamento || !descripcion) {
      App.toast('Rellena todos los campos obligatorios (*)', 'error');
      return;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      const body = {
        codigo_proyecto: proyecto,
        proceso,
        fecha_deteccion: fecha,
        detectado_por: detecta,
        departamento,
        area: document.getElementById('nc-area').value || null,
        programa: document.getElementById('nc-programa').value || null,
        afecta_ma: document.getElementById('nc-afecta-ma').value === 'true',
        afecta_resultado: document.getElementById('nc-afecta-resultado').value.trim() || null,
        descripcion,
        causas: document.getElementById('nc-causas').value.trim() || null,
        accion_inmediata: document.getElementById('nc-accion-inmediata').value.trim() || null,
        valoracion_euros: parseFloat(document.getElementById('nc-valoracion').value) || 0,
      };

      const { nc } = await API.post('/nc', body);

      document.getElementById('nc-form-wrapper').style.display = 'none';
      document.getElementById('nc-success').classList.add('show');
      document.getElementById('success-msg').textContent =
        `${nc.id} registrada correctamente. Se ha enviado notificacion a los responsables.`;

      App.toast(`${nc.id} registrada`);
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Enviar Incidencia';
    }
  }

  function newNC() {
    document.getElementById('nc-form-wrapper').style.display = 'block';
    document.getElementById('nc-success').classList.remove('show');
    reset();
  }

  function syncAccionCorrectora() {
    const sel = document.getElementById('nc-accion-correctora-tipo');
    const txt = document.getElementById('nc-accion-correctora');
    if (sel && txt) {
      if (sel.value && sel.value !== 'Otro') {
        txt.value = sel.value;
      } else if (sel.value === 'Otro') {
        txt.value = '';
        txt.focus();
      }
    }
  }

  return { init, reset, submit, newNC, syncAccionCorrectora };
})();
