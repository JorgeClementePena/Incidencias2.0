// backend/routes/dashboard.js — MySQL

const express = require('express');
const { query } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function buildFilters(q) {
  const conditions = ['revisada = 1'];
  const params = [];

  if (q.area)         { conditions.push('area = ?');                         params.push(q.area); }
  if (q.departamento) { conditions.push('departamento = ?');                 params.push(q.departamento); }
  if (q.programa)     { conditions.push('programa = ?');                     params.push(q.programa); }
  if (q.anio)         { conditions.push('YEAR(fecha_deteccion) = ?');        params.push(q.anio); }
  if (q.mes)          { conditions.push('MONTH(fecha_deteccion) = ?');       params.push(q.mes); }

  return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '', params };
}

// GET /api/dashboard/kpis
router.get('/kpis', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const r = await query(
      `SELECT
          COUNT(*)                                                      AS total,
          SUM(estado = 'Abierta')                                       AS abiertas,
          SUM(estado = 'Cerrada')                                       AS cerradas,
          COALESCE(SUM(valoracion_euros), 0)                            AS valoracion_total,
          SUM(afecta_resultado IS NOT NULL AND afecta_resultado != '')  AS afecta_resultado,
          SUM(afecta_ma = 1)                                            AS afecta_ma
       FROM no_conformidades ${where}`,
      params
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error en KPIs.' });
  }
});

// GET /api/dashboard/por-area
router.get('/por-area', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const r = await query(
      `SELECT
          COALESCE(area, 'Sin área')       AS area,
          COALESCE(categoria, 'Sin cat.')  AS categoria,
          COUNT(*)                         AS total,
          COALESCE(SUM(valoracion_euros),0) AS valoracion
       FROM no_conformidades ${where}
       GROUP BY area, categoria ORDER BY area, total DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en por-area.' });
  }
});

// GET /api/dashboard/valoracion-mensual
router.get('/valoracion-mensual', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    // MySQL no tiene funciones de ventana tan simples, calculamos acumulado en JS
    const r = await query(
      `SELECT
          YEAR(fecha_deteccion)                        AS anio,
          MONTH(fecha_deteccion)                       AS mes,
          DATE_FORMAT(fecha_deteccion, '%Y-%m')        AS periodo,
          COUNT(*)                                     AS incidencias,
          COALESCE(SUM(valoracion_euros), 0)           AS valoracion
       FROM no_conformidades ${where}
       GROUP BY anio, mes, periodo ORDER BY anio, mes`,
      params
    );
    // Calcular acumulado en JS
    let acum = 0;
    const rows = r.rows.map(row => {
      acum += parseFloat(row.valoracion);
      return { ...row, valoracion_acumulada: acum };
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en valoracion-mensual.' });
  }
});

// GET /api/dashboard/por-departamento
router.get('/por-departamento', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const r = await query(
      `SELECT departamento, COUNT(*) AS total, COALESCE(SUM(valoracion_euros),0) AS valoracion
       FROM no_conformidades ${where}
       GROUP BY departamento ORDER BY total DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en por-departamento.' });
  }
});

// GET /api/dashboard/por-programa
router.get('/por-programa', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const r = await query(
      `SELECT COALESCE(programa,'Sin programa') AS programa,
              COUNT(*) AS total, COALESCE(SUM(valoracion_euros),0) AS valoracion
       FROM no_conformidades ${where}
       GROUP BY programa ORDER BY total DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en por-programa.' });
  }
});

// GET /api/dashboard/por-proyecto
router.get('/por-proyecto', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const r = await query(
      `SELECT codigo_proyecto, COUNT(*) AS total, COALESCE(SUM(valoracion_euros),0) AS valoracion
       FROM no_conformidades ${where}
       GROUP BY codigo_proyecto ORDER BY total DESC LIMIT 20`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en por-proyecto.' });
  }
});

// GET /api/dashboard/por-categoria
router.get('/por-categoria', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const r = await query(
      `SELECT COALESCE(categoria,'Sin categoría') AS categoria,
              COUNT(*) AS total, COALESCE(SUM(valoracion_euros),0) AS valoracion
       FROM no_conformidades ${where}
       GROUP BY categoria
       ORDER BY (categoria IS NULL), total DESC, categoria ASC`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en por-categoria.' });
  }
});

// GET /api/dashboard/por-dia-semana
router.get('/por-dia-semana', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    // MySQL DAYOFWEEK: 1=domingo, 2=lunes... 7=sábado → convertimos a 0=domingo...6=sábado
    const r = await query(
      `SELECT
          (DAYOFWEEK(fecha_deteccion) - 1) AS dow,
          CASE DAYOFWEEK(fecha_deteccion)
            WHEN 1 THEN 'Domingo'  WHEN 2 THEN 'Lunes'   WHEN 3 THEN 'Martes'
            WHEN 4 THEN 'Miércoles' WHEN 5 THEN 'Jueves' WHEN 6 THEN 'Viernes'
            WHEN 7 THEN 'Sábado'
          END AS dia,
          COUNT(*) AS total,
          COALESCE(SUM(valoracion_euros),0) AS valoracion
       FROM no_conformidades ${where}
       GROUP BY dow, dia ORDER BY dow`,
      params
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en por-dia-semana.' });
  }
});

// GET /api/dashboard/anios
router.get('/anios', async (req, res) => {
  try {
    const r = await query(
      `SELECT DISTINCT YEAR(fecha_deteccion) AS anio
       FROM no_conformidades
       WHERE revisada = 1
       ORDER BY anio DESC`
    );
    res.json([...new Set(r.rows.map(x => x.anio))]);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo años.' });
  }
});

module.exports = router;
