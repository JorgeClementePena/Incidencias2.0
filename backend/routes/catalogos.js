const express = require('express');
const { query } = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AREAS, DEPARTAMENTOS, PROGRAMAS } = require('../config/catalogos');

const router = express.Router();
router.use(requireAuth);

async function getCategoriasActivas() {
  const result = await query(
    `SELECT id, area, nombre, orden, activa
     FROM area_categorias
     WHERE activa = 1
     ORDER BY area, orden, nombre`
  );
  return result.rows;
}

router.get('/config', async (req, res) => {
  try {
    const categorias = await getCategoriasActivas();
    const categoriasPorArea = AREAS.reduce((acc, area) => {
      acc[area] = categorias
        .filter(item => item.area === area)
        .map(item => item.nombre);
      return acc;
    }, {});

    const categoriasDisponibles = [...new Set(categorias.map(item => item.nombre))];

    res.json({
      areas: AREAS,
      departamentos: DEPARTAMENTOS,
      programas: PROGRAMAS,
      categorias,
      categoriasPorArea,
      categoriasDisponibles,
    });
  } catch (err) {
    console.error('[CATALOGOS] Config error:', err.message);
    res.status(500).json({ error: 'Error al obtener los catálogos.' });
  }
});

router.get('/categorias', async (req, res) => {
  try {
    const categorias = await getCategoriasActivas();
    if (req.query.area) {
      return res.json(categorias.filter(item => item.area === req.query.area));
    }
    res.json(categorias);
  } catch (err) {
    console.error('[CATALOGOS] Categorias error:', err.message);
    res.status(500).json({ error: 'Error al obtener categorías.' });
  }
});

router.post('/categorias', requireAdmin, async (req, res) => {
  try {
    const area = String(req.body.area || '').trim();
    const nombre = String(req.body.nombre || '').trim();

    if (!AREAS.includes(area) || !nombre) {
      return res.status(400).json({ error: 'Área o nombre inválido.' });
    }

    const ordenRes = await query(
      'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM area_categorias WHERE area = ?',
      [area]
    );
    const orden = parseInt(ordenRes.rows[0]?.siguiente || 1, 10);

    await query(
      `INSERT INTO area_categorias (id, area, nombre, orden, activa)
       VALUES (UUID(), ?, ?, ?, 1)`,
      [area, nombre, orden]
    );

    const categorias = await getCategoriasActivas();
    res.status(201).json(categorias.filter(item => item.area === area));
  } catch (err) {
    const duplicated = err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
    console.error('[CATALOGOS] Create categoria error:', err.message);
    res.status(duplicated ? 409 : 500).json({
      error: duplicated
        ? 'Esa categoría ya existe para el área seleccionada.'
        : 'Error al crear la categoría.',
    });
  }
});

router.put('/categorias/:id', requireAdmin, async (req, res) => {
  try {
    const area = String(req.body.area || '').trim();
    const nombre = String(req.body.nombre || '').trim();

    if (!AREAS.includes(area) || !nombre) {
      return res.status(400).json({ error: 'Área o nombre inválido.' });
    }

    const current = await query('SELECT id, area, nombre FROM area_categorias WHERE id = ?', [req.params.id]);
    if (!current.rows.length) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    await query(
      'UPDATE area_categorias SET area = ?, nombre = ? WHERE id = ?',
      [area, nombre, req.params.id]
    );

    const previous = current.rows[0];
    if (previous.area !== area || previous.nombre !== nombre) {
      await query(
        `UPDATE no_conformidades
         SET area = ?, categoria = ?
         WHERE area = ? AND categoria = ?`,
        [area, nombre, previous.area, previous.nombre]
      );
    }

    const categorias = await getCategoriasActivas();
    res.json(categorias);
  } catch (err) {
    const duplicated = err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
    console.error('[CATALOGOS] Update categoria error:', err.message);
    res.status(duplicated ? 409 : 500).json({
      error: duplicated
        ? 'Ya existe otra categoría con ese nombre en el área indicada.'
        : 'Error al actualizar la categoría.',
    });
  }
});

router.delete('/categorias/:id', requireAdmin, async (req, res) => {
  try {
    const found = await query('SELECT id FROM area_categorias WHERE id = ?', [req.params.id]);
    if (!found.rows.length) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    await query('DELETE FROM area_categorias WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[CATALOGOS] Delete categoria error:', err.message);
    res.status(500).json({ error: 'Error al eliminar la categoría.' });
  }
});

module.exports = router;
