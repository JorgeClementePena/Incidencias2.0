// frontend/js/api.js — Cliente HTTP centralizado

const API = (() => {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('nc_token') || '';
  }

  function headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...extra
    };
  }

  async function request(method, path, body = null) {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (err) {
      throw new Error('Error de conexión con el servidor.');
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      // Token expirado — forzar logout
      localStorage.removeItem('nc_token');
      localStorage.removeItem('nc_user');
      window.location.reload();
      throw new Error('Sesión expirada.');
    }

    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status}`);
    }

    return data;
  }

  return {
    get:    (path)        => request('GET',    path),
    post:   (path, body)  => request('POST',   path, body),
    put:    (path, body)  => request('PUT',    path, body),
    patch:  (path, body)  => request('PATCH',  path, body),
    delete: (path)        => request('DELETE', path),
  };
})();
