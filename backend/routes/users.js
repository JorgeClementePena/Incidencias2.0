// backend/routes/users.js

const express = require('express');
const { query } = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const r = await query(
        'SELECT id, name, email, role, department, active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(r.rows);
  } catch (err) {
    console.error('[USERS] List error:', err.message);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// PATCH /api/users/:id/role
router.patch('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol.' });
    }
    const check = await query('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (check.rows[0].role === 'admin' && role !== 'admin') {
      const admins = await query('SELECT COUNT(*) AS total FROM users WHERE role = ? AND active = 1', ['admin']);
      if (parseInt(admins.rows[0]?.total || 0, 10) <= 1) {
        return res.status(400).json({ error: 'No puedes dejar la aplicaciÃ³n sin administradores activos.' });
      }
    }
    await query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    const updated = await query('SELECT id, name, role FROM users WHERE id = ?', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[USERS] Role error:', err.message);
    res.status(500).json({ error: 'Error al cambiar rol.' });
  }
});

// PATCH /api/users/:id/active
router.patch('/:id/active', async (req, res) => {
  try {
    const { active } = req.body;
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    const check = await query('SELECT id, role, active FROM users WHERE id = ?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (check.rows[0].role === 'admin' && !active) {
      const admins = await query('SELECT COUNT(*) AS total FROM users WHERE role = ? AND active = 1', ['admin']);
      if (parseInt(admins.rows[0]?.total || 0, 10) <= 1) {
        return res.status(400).json({ error: 'No puedes desactivar al Ãºltimo administrador activo.' });
      }
    }
    await query('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, req.params.id]);
    const updated = await query('SELECT id, name, active FROM users WHERE id = ?', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[USERS] Active error:', err.message);
    res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }
    const check = await query('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (check.rows[0].role === 'admin') {
      const admins = await query('SELECT COUNT(*) AS total FROM users WHERE role = ? AND active = 1', ['admin']);
      if (parseInt(admins.rows[0]?.total || 0, 10) <= 1) {
        return res.status(400).json({ error: 'No puedes eliminar al Ãºltimo administrador activo.' });
      }
    }
    await query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] Delete error:', err.message);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

// ── RESPONSABILIDADES ────────────────────────────────────────

// GET /api/users/:id/responsabilidades
router.get('/:id/responsabilidades', async (req, res) => {
  try {
    const r = await query(
        'SELECT id, tipo, valor FROM user_responsabilidades WHERE user_id = ? ORDER BY tipo, valor',
        [req.params.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('[USERS] Resp get error:', err.message);
    res.status(500).json({ error: 'Error al obtener responsabilidades.' });
  }
});

// POST /api/users/:id/responsabilidades
router.post('/:id/responsabilidades', async (req, res) => {
  try {
    const { tipo, valor } = req.body;
    if (!['area', 'departamento', 'programa'].includes(tipo) || !valor) {
      return res.status(400).json({ error: 'Tipo o valor inválido.' });
    }

    const exists = await query(
        'SELECT id FROM user_responsabilidades WHERE user_id = ? AND tipo = ? AND valor = ?',
        [req.params.id, tipo, valor]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: 'Esta responsabilidad ya está asignada.' });
    }

    await query(
        'INSERT INTO user_responsabilidades (id, user_id, tipo, valor) VALUES (UUID(), ?, ?, ?)',
        [req.params.id, tipo, valor]
    );

    const r = await query(
        'SELECT id, tipo, valor FROM user_responsabilidades WHERE user_id = ? ORDER BY tipo, valor',
        [req.params.id]
    );
    res.status(201).json(r.rows);
  } catch (err) {
    console.error('[USERS] Resp post error:', err.message);
    res.status(500).json({ error: 'Error al añadir responsabilidad.' });
  }
});

// DELETE /api/users/:id/responsabilidades/:respId
router.delete('/:id/responsabilidades/:respId', async (req, res) => {
  try {
    await query(
        'DELETE FROM user_responsabilidades WHERE id = ? AND user_id = ?',
        [req.params.respId, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] Resp delete error:', err.message);
    res.status(500).json({ error: 'Error al eliminar responsabilidad.' });
  }
});

// GET /api/users/responsables/buscar?area=X&programa=Y&departamento=Z
router.get('/responsables/buscar', async (req, res) => {
  try {
    const { area, programa, departamento } = req.query;
    const conditions = [];
    const params = [];

    if (area)         { conditions.push('(r.tipo = ? AND r.valor = ?)'); params.push('area', area); }
    if (programa)     { conditions.push('(r.tipo = ? AND r.valor = ?)'); params.push('programa', programa); }
    if (departamento) { conditions.push('(r.tipo = ? AND r.valor = ?)'); params.push('departamento', departamento); }

    let responsables = [];
    if (conditions.length) {
      const r = await query(
          `SELECT DISTINCT u.email, u.name FROM users u
         INNER JOIN user_responsabilidades r ON r.user_id = u.id
         WHERE u.active = 1 AND (${conditions.join(' OR ')})`,
          params
      );
      responsables = r.rows;
    }

    const admins = await query(
        'SELECT email, name FROM users WHERE role = ? AND active = 1',
        ['admin']
    );

    res.json({ responsables, admins: admins.rows });
  } catch (err) {
    console.error('[USERS] Responsables error:', err.message);
    res.status(500).json({ error: 'Error al buscar responsables.' });
  }
});

module.exports = router;
