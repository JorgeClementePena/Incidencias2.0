// backend/server.js

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcrypt');

const authRoutes      = require('./routes/auth');
const ncRoutes        = require('./routes/nc');
const dashboardRoutes = require('./routes/dashboard');
const usersRoutes     = require('./routes/users');
const catalogosRoutes = require('./routes/catalogos');
const { query }       = require('./db/db');
const { AREA_ALIASES, DEFAULT_CATEGORIAS } = require('./config/catalogos');

const app  = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Rate limiting — 300 req / 15min por IP (suficiente para desarrollo y uso normal)
const limiter = rateLimit({ windowMs: 15*60*1000, max: 300, message: { error: 'Demasiadas solicitudes. Espera un momento.' } });
app.use('/api/', limiter);

// Rutas API
app.use('/api/auth',      authRoutes);
app.use('/api/nc',        ncRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users',     usersRoutes);
app.use('/api/catalogos', catalogosRoutes);

// Frontend estático
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND, { index: false }));

// Detección de móvil
function isMobile(ua) {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(ua || '');
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint no encontrado.' });
  const ua = req.headers['user-agent'] || '';
  if (isMobile(ua) && req.path !== '/mobile' && req.path !== '/mobile.html') {
    return res.redirect('/mobile');
  }
  if (req.path === '/mobile') {
    return res.sendFile(path.join(FRONTEND, 'mobile.html'));
  }
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[SERVER] Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

async function ensureRuntimeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS pending_registrations (
      temp_id CHAR(36) NOT NULL,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(200) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      department VARCHAR(100) DEFAULT NULL,
      code CHAR(6) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (temp_id),
      UNIQUE KEY uk_pending_email (email)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS area_categorias (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      area VARCHAR(80) NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      orden INT NOT NULL DEFAULT 0,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_area_categoria (area, nombre)
    ) ENGINE=InnoDB
  `);

  const categoriaColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'categoria'`);
  const categoriaType = String(categoriaColumn.rows[0]?.Type || '').toLowerCase();
  if (categoriaType.startsWith('enum(')) {
    await query('ALTER TABLE no_conformidades MODIFY categoria VARCHAR(255) DEFAULT NULL');
  }

  for (const [from, to] of Object.entries(AREA_ALIASES)) {
    if (from === to) continue;
    await query('UPDATE no_conformidades SET area = ? WHERE area = ?', [to, from]);
    await query(
      "UPDATE user_responsabilidades SET valor = ? WHERE tipo = 'area' AND valor = ?",
      [to, from]
    );
  }

  const currentCategorias = await query('SELECT COUNT(*) AS total FROM area_categorias');
  if (!parseInt(currentCategorias.rows[0]?.total || 0, 10)) {
    for (const [area, categorias] of Object.entries(DEFAULT_CATEGORIAS)) {
      for (let index = 0; index < categorias.length; index++) {
        await query(
          `INSERT INTO area_categorias (id, area, nombre, orden, activa)
           VALUES (UUID(), ?, ?, ?, 1)`,
          [area, categorias[index], index + 1]
        );
      }
    }
  }
}

// Crear usuario admin si no existe
async function initAdminUser() {
  try {
    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
    const name = (process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador').trim();
    const department = (process.env.BOOTSTRAP_ADMIN_DEPARTMENT || 'Calidad').trim();

    if (!email || !password) {
      const admins = await query('SELECT COUNT(*) AS total FROM users WHERE role = ?', ['admin']);
      if (!parseInt(admins.rows[0]?.total || 0, 10)) {
        console.warn('[INIT] No hay administradores y no se han configurado BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD.');
      }
      return;
    }

    const result = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (!result.rows.length) {
      const hash = await bcrypt.hash(password, 12);
      await query(
        'INSERT INTO users (id, name, email, password, role, department) VALUES (UUID(),?,?,?,?,?)',
        [name, email, hash, 'admin', department]
      );
      console.log(`[INIT] Usuario admin bootstrap creado: ${email}`);
    }
  } catch (err) {
    console.error('[INIT] Error creando admin:', err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`\n🚀 NC Manager en http://localhost:${PORT}`);
  console.log(`   BD: ${process.env.DB_NAME||'nc_manager'} @ ${process.env.DB_HOST||'localhost'}:${process.env.DB_PORT||3306}\n`);
  await ensureRuntimeSchema();
  await initAdminUser();
});

module.exports = app;
