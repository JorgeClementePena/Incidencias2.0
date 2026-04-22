const {
  REPEAT_WINDOW_DAYS,
  REPEAT_ALERT_THRESHOLD,
} = require('../config/repeticiones');

function executorQuery(executor, sql, params) {
  if (typeof executor === 'function') {
    return executor(sql, params || []);
  }
  return executor.query(sql, params || []);
}

async function getNcBase(executor, ncId) {
  const result = await executorQuery(
    executor,
    `SELECT id, codigo_proyecto, area, categoria, fecha_deteccion, revisada, importada_excel
     FROM no_conformidades
     WHERE id = ?
     LIMIT 1`,
    [ncId]
  );
  return result.rows[0] || null;
}

async function recalculateAutomaticRepeat(executor, ncId) {
  const nc = await getNcBase(executor, ncId);
  if (!nc) return null;

  if (!nc.revisada || !nc.codigo_proyecto || !nc.area || !nc.categoria || !nc.fecha_deteccion || nc.importada_excel) {
    await executorQuery(executor, 'UPDATE no_conformidades SET repetida_automatica = 0 WHERE id = ?', [ncId]);
    return {
      repetida_automatica: 0,
      totalCoincidencias: 0,
      thresholdReached: false,
      alertContext: null,
    };
  }

  const countResult = await executorQuery(
    executor,
    `SELECT COUNT(*) AS total
     FROM no_conformidades
     WHERE revisada = 1
       AND importada_excel = 0
       AND codigo_proyecto = ?
       AND area = ?
       AND categoria = ?
       AND fecha_deteccion BETWEEN DATE_SUB(?, INTERVAL ? DAY) AND ?
       AND id <> ?`,
    [nc.codigo_proyecto, nc.area, nc.categoria, nc.fecha_deteccion, REPEAT_WINDOW_DAYS, nc.fecha_deteccion, ncId]
  );

  const previousCount = parseInt(countResult.rows[0]?.total || 0, 10);
  const totalCoincidencias = previousCount + 1;
  const repetidaAutomatica = previousCount > 0 ? 1 : 0;

  await executorQuery(executor, 'UPDATE no_conformidades SET repetida_automatica = ? WHERE id = ?', [repetidaAutomatica, ncId]);

  let alertContext = null;
  if (totalCoincidencias >= REPEAT_ALERT_THRESHOLD) {
    const existingAlert = await executorQuery(
      executor,
      'SELECT id FROM nc_repeticion_alertas WHERE nc_id = ? LIMIT 1',
      [ncId]
    );

    if (!existingAlert.rows.length) {
      await executorQuery(
        executor,
        `INSERT INTO nc_repeticion_alertas (id, nc_id, area, categoria, incidencias_total, ventana_dias)
         VALUES (UUID(), ?, ?, ?, ?, ?)`,
        [ncId, nc.area, nc.categoria, totalCoincidencias, REPEAT_WINDOW_DAYS]
      );
      alertContext = {
        ncId,
        codigoProyecto: nc.codigo_proyecto,
        area: nc.area,
        categoria: nc.categoria,
        incidenciasTotal: totalCoincidencias,
        ventanaDias: REPEAT_WINDOW_DAYS,
      };
    }
  }

  return {
    repetida_automatica: repetidaAutomatica,
    totalCoincidencias,
    thresholdReached: totalCoincidencias >= REPEAT_ALERT_THRESHOLD,
    alertContext,
  };
}

async function recalculateAutomaticRepeatSeries(executor, codigoProyecto, area, categoria) {
  if (!codigoProyecto || !area || !categoria) return [];

  const rows = await executorQuery(
    executor,
    `SELECT id, fecha_deteccion
     FROM no_conformidades
     WHERE revisada = 1
       AND importada_excel = 0
       AND codigo_proyecto = ?
       AND area = ?
       AND categoria = ?
     ORDER BY fecha_deteccion ASC, created_at ASC`,
    [codigoProyecto, area, categoria]
  );

  const alerts = [];
  const incidencias = rows.rows;

  for (let index = 0; index < incidencias.length; index++) {
    const actual = incidencias[index];
    const fechaActual = new Date(actual.fecha_deteccion);
    let totalVentana = 1;
    let repetida = 0;

    for (let prev = index - 1; prev >= 0; prev--) {
      const previa = incidencias[prev];
      const fechaPrevia = new Date(previa.fecha_deteccion);
      const diffDays = Math.floor((fechaActual - fechaPrevia) / (1000 * 60 * 60 * 24));
      if (diffDays > REPEAT_WINDOW_DAYS) break;
      if (diffDays >= 0) {
        totalVentana += 1;
        repetida = 1;
      }
    }

    await executorQuery(executor, 'UPDATE no_conformidades SET repetida_automatica = ? WHERE id = ?', [repetida, actual.id]);

    if (totalVentana >= REPEAT_ALERT_THRESHOLD) {
      const existingAlert = await executorQuery(
        executor,
        'SELECT id FROM nc_repeticion_alertas WHERE nc_id = ? LIMIT 1',
        [actual.id]
      );
      if (!existingAlert.rows.length) {
        await executorQuery(
          executor,
          `INSERT INTO nc_repeticion_alertas (id, nc_id, area, categoria, incidencias_total, ventana_dias)
           VALUES (UUID(), ?, ?, ?, ?, ?)`,
          [actual.id, area, categoria, totalVentana, REPEAT_WINDOW_DAYS]
        );
        alerts.push({
          ncId: actual.id,
          codigoProyecto,
          area,
          categoria,
          incidenciasTotal: totalVentana,
          ventanaDias: REPEAT_WINDOW_DAYS,
        });
      }
    }
  }

  return alerts;
}

module.exports = {
  recalculateAutomaticRepeat,
  recalculateAutomaticRepeatSeries,
};
