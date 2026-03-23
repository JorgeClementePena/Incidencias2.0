const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../db/db');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../services/email');

const router = express.Router();
const SALT_ROUNDS = 12;

setInterval(() => {
  query('DELETE FROM pending_registrations WHERE expires_at < NOW()').catch(() => {});
}, 10 * 60 * 1000);

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    const normalizedEmail = (email || '').toLowerCase().trim();

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseÃ±a son obligatorios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseÃ±a debe tener al menos 6 caracteres.' });
    }
    if (!normalizedEmail.endsWith('@fidamc.es')) {
      return res.status(400).json({ error: 'Solo se permiten correos corporativos (@fidamc.es).' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Este correo ya estÃ¡ registrado.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const tempId = crypto.randomUUID();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await query('DELETE FROM pending_registrations WHERE email = ?', [normalizedEmail]);
    await query(
      `INSERT INTO pending_registrations (temp_id, name, email, password_hash, department, code, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tempId, name.trim(), normalizedEmail, hash, department || null, code, expires]
    );

    await sendVerificationEmail(normalizedEmail, name.trim(), code);
    res.status(200).json({ message: 'CÃ³digo enviado. Revisa tu email.', tempId });
  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { tempId, code } = req.body;
    if (!tempId || !code) return res.status(400).json({ error: 'Datos incompletos.' });

    const pendingRes = await query(
      `SELECT temp_id, name, email, password_hash, department, code, expires_at
       FROM pending_registrations
       WHERE temp_id = ?`,
      [tempId]
    );

    const pending = pendingRes.rows[0];
    if (!pending) {
      return res.status(400).json({ error: 'CÃ³digo expirado o invÃ¡lido. Vuelve a registrarte.' });
    }

    if (Date.now() > new Date(pending.expires_at).getTime()) {
      await query('DELETE FROM pending_registrations WHERE temp_id = ?', [tempId]);
      return res.status(400).json({ error: 'El cÃ³digo ha expirado. Vuelve a registrarte.' });
    }

    if (pending.code !== code.trim()) {
      return res.status(400).json({ error: 'CÃ³digo incorrecto.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [pending.email]);
    if (existing.rows.length) {
      await query('DELETE FROM pending_registrations WHERE temp_id = ?', [tempId]);
      return res.status(409).json({ error: 'Este correo ya estÃ¡ registrado.' });
    }

    const userId = crypto.randomUUID();
    await query(
      'INSERT INTO users (id, name, email, password, role, department) VALUES (?,?,?,?,?,?)',
      [userId, pending.name, pending.email, pending.password_hash, 'user', pending.department]
    );

    await query('DELETE FROM pending_registrations WHERE temp_id = ?', [tempId]);

    const userRes = await query('SELECT id, name, email, role, department FROM users WHERE id = ?', [userId]);
    const token = signToken(userRes.rows[0]);

    res.status(201).json({ token, user: userRes.rows[0] });
  } catch (err) {
    console.error('[AUTH] Verify error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseÃ±a requeridos.' });
    }

    const result = await query(
      'SELECT id, name, email, password, role, department, active FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada. Contacta con el administrador.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas.' });

    delete user.password;
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
