// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db/db');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  console.warn('[AUTH] JWT_SECRET no configurado. Se usa una clave efimera solo valida hasta reiniciar el servidor.');
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Token requerido.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await query(
      'SELECT id, name, email, role, department, active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!result.rows.length || !result.rows[0].active) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
}

module.exports = { signToken, requireAuth, requireAdmin };
