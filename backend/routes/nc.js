// backend/routes/nc.js

const express  = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { query, getClient } = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendNCEmail, sendEditNotification } = require('../services/email');
const {
  parseWorkbook,
  parseHeaders,
  buildRawRow,
  normalizeImportRow,
  validateImportHeaders,
} = require('../services/ncImport');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
router.use(requireAuth);

function toBoolFlag(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  return 0;
}

async function buildCategoriasPorArea() {
  const result = await query(
    `SELECT area, nombre
     FROM area_categorias
     WHERE activa = 1
     ORDER BY area ASC, orden ASC, nombre ASC`
  );

  return result.rows.reduce((acc, row) => {
    if (!acc[row.area]) acc[row.area] = [];
    acc[row.area].push(row.nombre);
    return acc;
  }, {});
}

async function createNcRecord(client, payload) {
  const tempId = `TMP-${crypto.randomUUID().slice(0, 12)}`;

  await client.query(
    `INSERT INTO no_conformidades (
      id, codigo_proyecto, proceso, fecha_deteccion, detectado_por,
      departamento, area, programa, categoria, programa_desc,
      afecta_ma, afecta_resultado, descripcion,
      causas, accion_inmediata, accion_correctora, observaciones,
      valoracion_euros, email_destino, email_cc, creado_por, email_remitente, revisada
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      tempId,
      payload.codigo_proyecto,
      payload.proceso,
      payload.fecha_deteccion,
      payload.detectado_por,
      payload.departamento,
      payload.area || null,
      payload.programa || null,
      payload.categoria || null,
      payload.programa_desc || null,
      toBoolFlag(payload.afecta_ma),
      toBoolFlag(payload.afecta_resultado),
      payload.descripcion,
      payload.causas || null,
      payload.accion_inmediata || null,
      payload.accion_correctora || null,
      payload.observaciones || null,
      parseFloat(payload.valoracion_euros) || 0,
      payload.email_destino || null,
      payload.email_cc || null,
      payload.creado_por || null,
      payload.email_remitente || null,
      payload.revisada ? 1 : 0,
    ]
  );

  const insertRes = await client.query('SELECT seq FROM no_conformidades WHERE id = ?', [tempId]);
  const nextSeq = insertRes.rows[0]?.seq;
  const ncId = 'NC-' + String(nextSeq).padStart(4, '0');

  await client.query('UPDATE no_conformidades SET id = ? WHERE id = ?', [ncId, tempId]);
  return ncId;
}

async function categoriaValida(area, categoria) {
  if (!categoria) return true;
  if (!area) return false;
  const result = await query(
    `SELECT id
     FROM area_categorias
     WHERE area = ? AND nombre = ? AND activa = 1
     LIMIT 1`,
    [area, categoria]
  );
  return result.rows.length > 0;
}

// GET /api/nc
router.get('/', async (req, res) => {
  try {
    const { estado, area, departamento, programa, categoria, anio, mes, search } = req.query;
    const page   = parseInt(req.query.page  || '1');
    const limit  = parseInt(req.query.limit || '50');
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    // Si no se piden pendientes, mostrar solo revisadas
    if (req.query.pendientes === 'true') {
      conditions.push('n.revisada = 0');
    } else {
      conditions.push('n.revisada = 1');
    }

    if (estado)       { conditions.push('n.estado = ?');                        params.push(estado); }
    if (area)         { conditions.push('n.area = ?');                          params.push(area); }
    if (departamento) { conditions.push('n.departamento = ?');                  params.push(departamento); }
    if (programa)     { conditions.push('n.programa = ?');                      params.push(programa); }
    if (categoria)    { conditions.push('n.categoria = ?');                     params.push(categoria); }
    if (anio)         { conditions.push('YEAR(n.fecha_deteccion) = ?');         params.push(anio); }
    if (mes)          { conditions.push('MONTH(n.fecha_deteccion) = ?');        params.push(mes); }
    if (search) {
      conditions.push('(n.id LIKE ? OR n.codigo_proyecto LIKE ? OR n.descripcion LIKE ? OR n.detectado_por LIKE ?)');
      const like = '%' + search + '%';
      params.push(like, like, like, like);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) AS total FROM no_conformidades n ${where}`, params);
    const total = parseInt(countRes.rows[0].total);

    const dataRes = await query(
        `SELECT n.*, u.name AS creado_por_nombre
         FROM no_conformidades n
                LEFT JOIN users u ON u.id = n.creado_por
           ${where}
         ORDER BY n.created_at DESC
           LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ data: dataRes.rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[NC] List error:', err.message);
    res.status(500).json({ error: 'Error al obtener incidencias.' });
  }
});

router.post('/import/preview', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Selecciona un archivo Excel antes de continuar.' });
    }

    const rows = parseWorkbook(req.file.buffer);
    const headerMap = parseHeaders(rows[0] || []);
    const missingHeaders = validateImportHeaders(headerMap);

    if (missingHeaders.length) {
      return res.status(400).json({
        error: `Faltan columnas obligatorias: ${missingHeaders.join(', ')}`,
      });
    }

    const categoriasPorArea = await buildCategoriasPorArea();
    const dataRows = rows.slice(1).filter(row => row.some(cell => String(cell ?? '').trim() !== ''));
    const preview = dataRows.map((row, index) => {
      const raw = buildRawRow(headerMap, row);
      const normalized = normalizeImportRow(raw, categoriasPorArea);
      return {
        rowNumber: index + 2,
        raw,
        values: normalized.values,
        errors: normalized.errors,
      };
    });

    const validRows = preview.filter(row => !row.errors.length).length;
    const invalidRows = preview.length - validRows;

    res.json({
      summary: {
        totalRows: preview.length,
        validRows,
        invalidRows,
      },
      rows: preview,
      defaults: {
        proceso: 'Importacion Excel',
        detectado_por: 'Importacion Excel',
      },
    });
  } catch (err) {
    console.error('[NC] Import preview error:', err.message);
    res.status(500).json({ error: 'No se pudo leer el archivo Excel.' });
  }
});

router.post('/import/commit', requireAdmin, async (req, res) => {
  const client = await getClient();
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      await client.rollback();
      client.release();
      return res.status(400).json({ error: 'No hay filas para importar.' });
    }

    const categoriasPorArea = await buildCategoriasPorArea();
    const preparedRows = rows.map((row, index) => {
      const raw = row?.raw || row;
      const normalized = normalizeImportRow(raw, categoriasPorArea);
      return {
        rowNumber: row?.rowNumber || index + 2,
        raw,
        values: normalized.values,
        errors: normalized.errors,
      };
    });

    const invalidRows = preparedRows.filter(row => row.errors.length);
    if (invalidRows.length) {
      await client.rollback();
      client.release();
      return res.status(400).json({
        error: 'Hay filas invalidas en la importacion.',
        rows: invalidRows,
      });
    }

    const createdIds = [];

    for (const row of preparedRows) {
      if (!(await categoriaValida(row.values.area, row.values.categoria))) {
        const error = new Error(`La categoria de la fila ${row.rowNumber} ya no es valida para el area seleccionado.`);
        error.statusCode = 400;
        throw error;
      }

      const { responsables, admins } = await getResponsables(row.values.area, row.values.departamento, row.values.programa);
      const destinatarios = responsables.map(item => item.email);
      const adminEmails = admins.map(item => item.email);
      const emailDestino = destinatarios.length ? destinatarios.join(',') : adminEmails.join(',');
      const emailCC = destinatarios.length ? adminEmails.join(',') : null;

      const ncId = await createNcRecord(client, {
        ...row.values,
        programa_desc: null,
        email_destino: emailDestino || null,
        email_cc: emailCC || null,
        creado_por: req.user.id,
        email_remitente: req.user.email,
        revisada: true,
      });

      createdIds.push(ncId);

      await client.query(
        'INSERT INTO email_log (nc_id, destinatario, cc, asunto, enviado) VALUES (?,?,?,?,1)',
        [ncId, emailDestino || '', emailCC || null, `[NC] ${ncId} - ${row.values.codigo_proyecto}`]
      );
    }

    await client.commit();
    client.release();

    res.status(201).json({
      success: true,
      imported: createdIds.length,
      ids: createdIds,
    });
  } catch (err) {
    await client.rollback();
    client.release();
    console.error('[NC] Import commit error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'No se pudo completar la importacion.' });
  }
});

// GET /api/nc/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
        `SELECT n.*, u.name AS creado_por_nombre
         FROM no_conformidades n
                LEFT JOIN users u ON u.id = n.creado_por
         WHERE n.id = ?`,
        [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Incidencia no encontrada.' });

    const nc = result.rows[0];

    const hist = await query(
        `SELECT h.*, u.name AS por_nombre
         FROM nc_historial h
                LEFT JOIN users u ON u.id = h.cambiado_por
         WHERE h.nc_id = ? ORDER BY h.cambiado_at ASC`,
        [req.params.id]
    );

    res.json({ nc, historial: hist.rows });
  } catch (err) {
    console.error('[NC] Get error:', err.message);
    res.status(500).json({ error: 'Error al obtener la incidencia.' });
  }
});

// Helper: buscar responsables
async function getResponsables(area, departamento, programa) {
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

  return { responsables, admins: admins.rows };
}

// POST /api/nc
router.post('/', async (req, res) => {
  const client = await getClient();
  try {
    const {
      codigo_proyecto, proceso, fecha_deteccion, detectado_por,
      departamento, area, programa, programa_desc,
      afecta_ma, afecta_resultado, descripcion,
      causas, accion_inmediata, valoracion_euros, email_cc, observaciones
    } = req.body;

    if (!codigo_proyecto || !proceso || !fecha_deteccion || !detectado_por ||
        !departamento || !descripcion) {
      await client.rollback();
      client.release();
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const { responsables, admins } = await getResponsables(area, departamento, programa);
    const destinatarios = responsables.map(r => r.email);
    const adminEmails   = admins.map(a => a.email);
    const emailDestino  = destinatarios.length ? destinatarios.join(',') : adminEmails.join(',');
    const emailCC       = destinatarios.length ? adminEmails.join(',') : null;

    const ncId = await createNcRecord(client, {
      codigo_proyecto,
      proceso,
      fecha_deteccion,
      detectado_por,
      departamento,
      area: area || null,
      programa: programa || null,
      categoria: null,
      programa_desc: programa_desc || null,
      afecta_ma,
      afecta_resultado,
      descripcion,
      causas: causas || null,
      accion_inmediata: accion_inmediata || null,
      accion_correctora: null,
      observaciones: observaciones || null,
      valoracion_euros,
      email_destino: emailDestino,
      email_cc: emailCC || email_cc || null,
      creado_por: req.user.id,
      email_remitente: req.user.email,
      revisada: false,
    });

    await client.query(
        'INSERT INTO email_log (nc_id, destinatario, cc, asunto) VALUES (?,?,?,?)',
        [ncId, emailDestino, emailCC||null, `[NC] ${ncId} - ${codigo_proyecto}`]
    );

    await client.commit();
    client.release();

    const created = await query('SELECT * FROM no_conformidades WHERE id = ?', [ncId]);
    const nc = created.rows[0];

    sendNCEmail(nc).catch(err => console.error('[EMAIL]', err.message));

    res.status(201).json({ nc });
  } catch (err) {
    await client.rollback();
    client.release();
    console.error('[NC] Create error:', err.message);
    res.status(500).json({ error: 'Error al crear la incidencia.' });
  }
});

// PATCH /api/nc/:id/estado
router.patch('/:id/estado', requireAdmin, async (req, res) => {
  const client = await getClient();
  try {
    const { estado } = req.body;
    if (!['Abierta','Cerrada'].includes(estado)) {
      await client.rollback(); client.release();
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const current = await client.query('SELECT estado FROM no_conformidades WHERE id = ?', [req.params.id]);
    if (!current.rows.length) {
      await client.rollback(); client.release();
      return res.status(404).json({ error: 'Incidencia no encontrada.' });
    }

    const estadoAntes = current.rows[0].estado;
    const closedAt = estado === 'Cerrada' ? new Date().toISOString().slice(0,19).replace('T',' ') : null;

    await client.query(
        'UPDATE no_conformidades SET estado = ?, closed_at = ? WHERE id = ?',
        [estado, closedAt, req.params.id]
    );

    await client.query(
        'INSERT INTO nc_historial (id, nc_id, campo, valor_antes, valor_nuevo, cambiado_por) VALUES (UUID(),?,?,?,?,?)',
        [req.params.id, 'estado', estadoAntes, estado, req.user.id]
    );

    await client.commit();
    client.release();
    res.json({ success: true, estado });
  } catch (err) {
    await client.rollback();
    client.release();
    console.error('[NC] Estado error:', err.message);
    res.status(500).json({ error: 'Error al actualizar estado.' });
  }
});

// DELETE /api/nc/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const check = await query('SELECT id FROM no_conformidades WHERE id = ?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Incidencia no encontrada.' });
    await query('DELETE FROM no_conformidades WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[NC] Delete error:', err.message);
    res.status(500).json({ error: 'Error al eliminar la incidencia.' });
  }
});

// PUT /api/nc/:id — edición por admin
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const {
      codigo_proyecto, proceso, fecha_deteccion, detectado_por,
      departamento, area, programa, categoria, programa_desc,
      afecta_ma, afecta_resultado, descripcion,
      causas, accion_inmediata, accion_correctora,
      valoracion_euros, email_destino, notificar_creador, observaciones
    } = req.body;

    if (!codigo_proyecto || !proceso || !fecha_deteccion || !detectado_por ||
        !departamento || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    if (!(await categoriaValida(area, categoria))) {
      return res.status(400).json({ error: 'La categoría no pertenece al área seleccionada.' });
    }

    const check = await query(
        'SELECT id, email_remitente, creado_por FROM no_conformidades WHERE id = ?',
        [req.params.id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Incidencia no encontrada.' });

    // Si se rellena categoría → marcar como revisada
    const revisada = categoria ? 1 : 0;

    await query(
        `UPDATE no_conformidades SET
        codigo_proyecto=?, proceso=?, fecha_deteccion=?, detectado_por=?,
        departamento=?, area=?, programa=?, categoria=?, programa_desc=?,
        afecta_ma=?, afecta_resultado=?, descripcion=?,
        causas=?, accion_inmediata=?, accion_correctora=?, observaciones=?,
        valoracion_euros=?, email_destino=?, revisada=?
       WHERE id=?`,
        [
          codigo_proyecto, proceso, fecha_deteccion, detectado_por,
          departamento, area||null, programa||null, categoria||null, programa_desc||null,
          toBoolFlag(afecta_ma),
          toBoolFlag(afecta_resultado), descripcion,
          causas||null, accion_inmediata||null, accion_correctora||null, observaciones||null,
          parseFloat(valoracion_euros)||0,
          email_destino||null,
          revisada,
          req.params.id
        ]
    );

    await query(
        'INSERT INTO nc_historial (id, nc_id, campo, valor_antes, valor_nuevo, cambiado_por) VALUES (UUID(),?,?,?,?,?)',
        [req.params.id, 'edicion', 'datos anteriores', 'datos actualizados', req.user.id]
    );

    const updated = await query('SELECT * FROM no_conformidades WHERE id = ?', [req.params.id]);
    const nc = updated.rows[0];

    if (notificar_creador && nc.email_remitente) {
      sendEditNotification(nc, nc.email_remitente).catch(err =>
          console.error('[EMAIL] Notificación creador:', err.message)
      );
    }

    res.json({ nc });
  } catch (err) {
    console.error('[NC] Update error:', err.message);
    res.status(500).json({ error: 'Error al actualizar la incidencia.' });
  }
});

module.exports = router;
