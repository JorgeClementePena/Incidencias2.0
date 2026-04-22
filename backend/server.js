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
const { AREA_ALIASES, DEPARTAMENTO_ALIASES, DEFAULT_CATEGORIAS } = require('./config/catalogos');

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
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10),
  max: parseInt(
    process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? '300' : '5000'),
    10
  ),
  message: { error: 'Demasiadas solicitudes. Espera un momento.' }
});
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
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      name VARCHAR(120) NOT NULL,
      email VARCHAR(200) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin','user') NOT NULL DEFAULT 'user',
      department VARCHAR(100) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_users_email (email)
    ) ENGINE=InnoDB
  `);

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
      UNIQUE KEY uk_pending_email (email),
      KEY idx_pending_expires (expires_at)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS no_conformidades (
      id VARCHAR(20) NOT NULL,
      seq INT NOT NULL AUTO_INCREMENT UNIQUE,
      codigo_proyecto VARCHAR(100) NOT NULL,
      proceso VARCHAR(100) NOT NULL,
      fecha_deteccion DATE NOT NULL,
      detectado_por VARCHAR(150) NOT NULL,
      departamento VARCHAR(100) NOT NULL,
      area VARCHAR(50) DEFAULT NULL,
      programa VARCHAR(150) DEFAULT NULL,
      categoria VARCHAR(255) DEFAULT NULL,
      prioridad VARCHAR(20) DEFAULT NULL,
      importada_excel TINYINT(1) NOT NULL DEFAULT 0,
      repetida_automatica TINYINT(1) NOT NULL DEFAULT 0,
      programa_desc VARCHAR(200) DEFAULT NULL,
      afecta_ma TINYINT(1) NOT NULL DEFAULT 0,
      afecta_resultado TINYINT(1) NOT NULL DEFAULT 0,
      descripcion TEXT NOT NULL,
      causas TEXT DEFAULT NULL,
      accion_inmediata TEXT DEFAULT NULL,
      accion_correctora TEXT DEFAULT NULL,
      observaciones TEXT DEFAULT NULL,
      valoracion_euros DECIMAL(12,2) DEFAULT 0.00,
      estado ENUM('Abierta','Cerrada') NOT NULL DEFAULT 'Abierta',
      revisada TINYINT(1) NOT NULL DEFAULT 0,
      email_destino VARCHAR(200) DEFAULT NULL,
      email_cc VARCHAR(200) DEFAULT NULL,
      email_remitente VARCHAR(200) DEFAULT NULL,
      creado_por CHAR(36) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      closed_at DATETIME DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_nc_fecha (fecha_deteccion),
      KEY idx_nc_estado (estado),
      KEY idx_nc_revisada (revisada),
      KEY idx_nc_area (area),
      KEY idx_nc_dept (departamento),
      KEY idx_nc_programa (programa),
      KEY idx_nc_categoria (categoria),
      KEY idx_nc_prioridad (prioridad),
      KEY idx_nc_importada (importada_excel),
      KEY idx_nc_rep_auto (repetida_automatica),
      KEY idx_nc_created (created_at),
      CONSTRAINT fk_nc_creado_por FOREIGN KEY (creado_por) REFERENCES users(id) ON DELETE SET NULL
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
      UNIQUE KEY uk_area_categoria (area, nombre),
      KEY idx_area_categorias_area (area),
      KEY idx_area_categorias_activa (activa)
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS nc_repeticion_alertas (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      nc_id VARCHAR(20) NOT NULL,
      area VARCHAR(80) NOT NULL,
      categoria VARCHAR(255) NOT NULL,
      incidencias_total INT NOT NULL,
      ventana_dias INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_repeticion_alerta_nc (nc_id),
      CONSTRAINT fk_rep_alerta_nc FOREIGN KEY (nc_id) REFERENCES no_conformidades(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS nc_historial (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      nc_id VARCHAR(20) NOT NULL,
      campo VARCHAR(50) NOT NULL,
      valor_antes TEXT DEFAULT NULL,
      valor_nuevo TEXT DEFAULT NULL,
      cambiado_por CHAR(36) DEFAULT NULL,
      cambiado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_hist_nc (nc_id),
      CONSTRAINT fk_hist_nc FOREIGN KEY (nc_id) REFERENCES no_conformidades(id) ON DELETE CASCADE,
      CONSTRAINT fk_hist_cambiado_por FOREIGN KEY (cambiado_por) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      nc_id VARCHAR(20) DEFAULT NULL,
      destinatario VARCHAR(200) NOT NULL,
      cc VARCHAR(200) DEFAULT NULL,
      asunto VARCHAR(300) DEFAULT NULL,
      enviado TINYINT(1) NOT NULL DEFAULT 0,
      error_msg TEXT DEFAULT NULL,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT fk_email_log_nc FOREIGN KEY (nc_id) REFERENCES no_conformidades(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_responsabilidades (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      user_id CHAR(36) NOT NULL,
      tipo ENUM('area','departamento','programa') NOT NULL,
      valor VARCHAR(150) NOT NULL,
      PRIMARY KEY (id),
      KEY idx_resp_user (user_id),
      KEY idx_resp_tipo (tipo),
      KEY idx_resp_valor (valor),
      CONSTRAINT fk_resp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  const categoriaColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'categoria'`);
  const categoriaType = String(categoriaColumn.rows[0]?.Type || '').toLowerCase();
  if (categoriaType.startsWith('enum(')) {
    await query('ALTER TABLE no_conformidades MODIFY categoria VARCHAR(255) DEFAULT NULL');
  }

  const afectaResultadoColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'afecta_resultado'`);
  const afectaResultadoType = String(afectaResultadoColumn.rows[0]?.Type || '').toLowerCase();
  if (!afectaResultadoType.includes('tinyint(1)')) {
    await query(`
      UPDATE no_conformidades
      SET afecta_resultado = CASE
        WHEN TRIM(COALESCE(afecta_resultado, '')) <> ''
         AND LOWER(TRIM(COALESCE(afecta_resultado, ''))) NOT IN ('no', 'false', '0')
        THEN '1'
        ELSE '0'
      END
    `);
    await query('ALTER TABLE no_conformidades MODIFY afecta_resultado TINYINT(1) NOT NULL DEFAULT 0');
  }

  const observacionesColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'observaciones'`);
  if (!observacionesColumn.rows.length) {
    await query('ALTER TABLE no_conformidades ADD COLUMN observaciones TEXT DEFAULT NULL AFTER accion_correctora');
  }

  const prioridadColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'prioridad'`);
  if (!prioridadColumn.rows.length) {
    await query('ALTER TABLE no_conformidades ADD COLUMN prioridad VARCHAR(20) DEFAULT NULL AFTER categoria');
    await query('ALTER TABLE no_conformidades ADD INDEX idx_nc_prioridad (prioridad)');
  }

  const repetidaAutomaticaColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'repetida_automatica'`);
  if (!repetidaAutomaticaColumn.rows.length) {
    await query('ALTER TABLE no_conformidades ADD COLUMN repetida_automatica TINYINT(1) NOT NULL DEFAULT 0 AFTER prioridad');
    await query('ALTER TABLE no_conformidades ADD INDEX idx_nc_rep_auto (repetida_automatica)');
  }

  const importadaExcelColumn = await query(`SHOW COLUMNS FROM no_conformidades LIKE 'importada_excel'`);
  if (!importadaExcelColumn.rows.length) {
    await query('ALTER TABLE no_conformidades ADD COLUMN importada_excel TINYINT(1) NOT NULL DEFAULT 0 AFTER prioridad');
    await query('ALTER TABLE no_conformidades ADD INDEX idx_nc_importada (importada_excel)');
  }

  for (const [from, to] of Object.entries(AREA_ALIASES)) {
    if (from === to) continue;
    await query('UPDATE no_conformidades SET area = ? WHERE area = ?', [to, from]);
    await query(
      "UPDATE user_responsabilidades SET valor = ? WHERE tipo = 'area' AND valor = ?",
      [to, from]
    );
  }

  for (const [from, to] of Object.entries(DEPARTAMENTO_ALIASES)) {
    if (from === to) continue;
    await query('UPDATE no_conformidades SET departamento = ? WHERE departamento = ?', [to, from]);
    await query('UPDATE users SET department = ? WHERE department = ?', [to, from]);
    await query('UPDATE pending_registrations SET department = ? WHERE department = ?', [to, from]);
    await query(
      "UPDATE user_responsabilidades SET valor = ? WHERE tipo = 'departamento' AND valor = ?",
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
  console.log(`\n🚀 Incidencias Fidamc en http://localhost:${PORT}`);
  console.log(`   BD: ${process.env.DB_NAME||'nc_manager'} @ ${process.env.DB_HOST||'localhost'}:${process.env.DB_PORT||3306}\n`);
  await ensureRuntimeSchema();
  await initAdminUser();
});

module.exports = app;
