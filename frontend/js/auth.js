const AuthModule = (() => {
  function switchTab(tab) {
    document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
    document.getElementById('tab-reg-btn').classList.toggle('active', tab === 'register');
    document.getElementById('login-panel').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-panel').style.display = tab === 'register' ? 'block' : 'none';
  }

  async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.remove('show');

    if (!email || !password) {
      errEl.textContent = 'Introduce tu email y contrasena.';
      errEl.classList.add('show');
      return;
    }

    try {
      const { token, user } = await API.post('/auth/login', { email, password });
      _saveSession(token, user);
      _enterApp(user);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  }

  async function register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const dept = document.getElementById('reg-dept').value;
    const password = document.getElementById('reg-pass').value;
    const errEl = document.getElementById('reg-error');
    errEl.classList.remove('show');

    if (!name || !email || !password) {
      errEl.textContent = 'Rellena todos los campos obligatorios.';
      errEl.classList.add('show');
      return;
    }

    try {
      const { tempId } = await API.post('/auth/register', { name, email, department: dept, password });
      _showVerifyPanel(tempId);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  }

  function _showVerifyPanel(tempId) {
    document.getElementById('register-panel').innerHTML = `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:48px;margin-bottom:12px">Codigo</div>
        <h3 style="color:var(--teal-800);margin-bottom:8px;font-size:16px">Revisa tu correo</h3>
        <p style="font-size:13px;color:#666;margin-bottom:20px;line-height:1.5">
          Hemos enviado un codigo de 6 digitos a tu email corporativo.<br>Introduce aqui el codigo:
        </p>
        <input id="verify-code" type="text" maxlength="6" placeholder="000000"
          style="text-align:center;font-size:32px;letter-spacing:10px;font-weight:700;
                 border:2px solid var(--teal-400);border-radius:10px;padding:12px 16px;
                 width:200px;color:var(--teal-800);display:block;margin:0 auto 16px">
        <div id="verify-error" style="color:#c0392b;font-size:13px;margin-bottom:12px;display:none"></div>
        <button class="btn btn-primary" style="width:100%;margin-bottom:10px" onclick="AuthModule.verifyCode('${tempId}')">
          Verificar cuenta
        </button>
        <p style="font-size:12px;color:#999">El codigo expira en 15 minutos.</p>
      </div>`;
  }

  async function verifyCode(tempId) {
    const code = document.getElementById('verify-code').value.trim();
    const errEl = document.getElementById('verify-error');
    errEl.style.display = 'none';

    if (code.length !== 6) {
      errEl.textContent = 'Introduce el codigo de 6 digitos.';
      errEl.style.display = 'block';
      return;
    }

    try {
      const { token, user } = await API.post('/auth/verify', { tempId, code });
      _saveSession(token, user);
      _enterApp(user);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  }

  function logout() {
    localStorage.removeItem('nc_token');
    localStorage.removeItem('nc_user');
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
  }

  function _saveSession(token, user) {
    localStorage.setItem('nc_token', token);
    localStorage.setItem('nc_user', JSON.stringify(user));
  }

  function _enterApp(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('tb-avatar').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('tb-name').textContent = user.name;
    document.getElementById('tb-role').textContent = user.role === 'admin' ? 'Admin' : 'Usuario';
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = user.role === 'admin' ? '' : 'none';
    });
    const detectaInput = document.getElementById('nc-detecta');
    if (detectaInput && !detectaInput.value) detectaInput.value = user.name;
    if (typeof CatalogosModule !== 'undefined') {
      CatalogosModule.init().catch(() => {});
    }
    App.navigate('nueva-nc');
  }

  function tryRestoreSession() {
    const token = localStorage.getItem('nc_token');
    const user = localStorage.getItem('nc_user');
    if (token && user) {
      try {
        _enterApp(JSON.parse(user));
        return true;
      } catch {
        localStorage.removeItem('nc_token');
        localStorage.removeItem('nc_user');
      }
    }
    return false;
  }

  function currentUser() {
    try { return JSON.parse(localStorage.getItem('nc_user')); } catch { return null; }
  }

  return { switchTab, login, register, logout, tryRestoreSession, currentUser, verifyCode };
})();
