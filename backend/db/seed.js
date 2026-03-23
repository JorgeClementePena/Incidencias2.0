require('dotenv').config();
const crypto = require('crypto');
const { query, pool } = require('./db');
const { AREAS, DEPARTAMENTOS, PROGRAMAS, DEFAULT_CATEGORIAS } = require('../config/catalogos');

const areas = AREAS;
const departamentos = DEPARTAMENTOS;
const programas = PROGRAMAS;
const categoriasPorArea = DEFAULT_CATEGORIAS;
const estados = ['Abierta', 'Cerrada'];

const proyectos = [
  'AIRBUS-A320',
  'AIRBUS-A350',
  'BOEING-787',
  'FIDAMC-PROTO-01',
  'FIDAMC-LAB-22',
  'NDT-INSP-03',
  'GCAD-2024',
  'TERMO-X1',
  'NEXTGEN-05',
  'PROD-LINE-B',
];

const procesos = ['PE-01', 'PE-02', 'PE-03', 'PE-04', 'PE-05', 'PE-06', 'PE-07'];

const detectores = [
  'Carlos Martínez (Calidad)',
  'Laura García (Ingeniería)',
  'Pedro Sánchez (Producción)',
  'Ana López (NDT)',
  'Miguel Torres (Laboratorio)',
  'Sara Ruiz (Prototipos)',
  'Juan Pérez (Termoestables)',
];

const areaContext = {
  'Producción': {
    descripcion: [
      'Se detecta desviación durante la fabricación del lote y la operación no cumple la secuencia prevista.',
      'La pieza presenta una incidencia en planta durante el ciclo productivo y requiere revisión inmediata.',
      'Se identifica una no conformidad en proceso antes de liberar el material al siguiente puesto.',
    ],
    causas: [
      'No se siguió el estándar de trabajo definido para la operación.',
      'Fallo de coordinación entre planificación, utillaje y ejecución en línea.',
      'Formación insuficiente del operario asignado a la tarea.',
    ],
    accionesInmediatas: [
      'Se bloquea el lote y se detiene temporalmente la operación afectada.',
      'Se aparta el material y se avisa al responsable de Producción para evaluación.',
      'Se revisa el 100% de las piezas del mismo lote antes de continuar.',
    ],
    accionesCorrectoras: [
      'Reentrenar al personal implicado y reforzar el checklist de fabricación.',
      'Actualizar el estándar de trabajo y validar el utillaje antes de la siguiente orden.',
      'Implantar un punto de control adicional en la operación afectada.',
    ],
  },
  NDT: {
    descripcion: [
      'Durante la inspección NDT se detecta una desviación en la trazabilidad o en la documentación asociada.',
      'La pieza llega a NDT con información incompleta y no puede garantizarse la correcta inspección.',
      'Se identifica una incidencia en el reporte o en la secuencia de inspección prevista.',
    ],
    causas: [
      'La hoja de proceso no incluía toda la información necesaria para la inspección.',
      'La planificación no estaba actualizada en el sistema y generó una revisión incompleta.',
      'Falta de formación o criterio homogéneo en la ejecución del control.',
    ],
    accionesInmediatas: [
      'Se retiene la pieza hasta completar la documentación e identificar el alcance.',
      'Se comunica la incidencia a Calidad y al responsable de NDT.',
      'Se revisan las piezas afectadas y se corrige el reporte antes de su envío.',
    ],
    accionesCorrectoras: [
      'Actualizar la instrucción de trabajo e incorporar validación previa de documentación.',
      'Reforzar la formación específica del personal de inspección.',
      'Añadir revisión cruzada del reporte antes de liberar resultados al cliente.',
    ],
  },
  Laboratorio: {
    descripcion: [
      'Se observa una desviación durante la preparación o ejecución del ensayo en laboratorio.',
      'El resultado obtenido no es fiable por una incidencia en el set-up o en la muestra ensayada.',
      'Se detecta un error en la preparación de probetas o en la emisión del informe de ensayo.',
    ],
    causas: [
      'Parámetros de ensayo seleccionados de forma incorrecta.',
      'Mantenimiento preventivo insuficiente del equipo utilizado.',
      'Error de preparación de la muestra o montaje del set-up.',
    ],
    accionesInmediatas: [
      'Se paraliza el ensayo y se inmovilizan las probetas afectadas.',
      'Se repite la verificación del equipo antes de continuar con nuevos ensayos.',
      'Se revisa el informe emitido y se bloquea su distribución.',
    ],
    accionesCorrectoras: [
      'Revisar la instrucción de ensayo y reforzar el checklist previo.',
      'Planificar mantenimiento y verificación intermedia del equipo.',
      'Formar al técnico en la configuración correcta del set-up y registro de resultados.',
    ],
  },
  'Ingeniería': {
    descripcion: [
      'Se detecta una definición incorrecta en la documentación técnica que impacta en el proceso.',
      'El proyecto presenta una desviación de ingeniería que afecta a la fabricación o inspección.',
      'Se identifica una carencia en la información técnica entregada al área usuaria.',
    ],
    causas: [
      'Revisión técnica incompleta antes de liberar la documentación.',
      'Falta de coordinación entre proyecto, proceso y soporte de ingeniería.',
      'Planificación no actualizada o definición ambigua en documentación interna.',
    ],
    accionesInmediatas: [
      'Se bloquea el uso de la versión vigente y se comunica a las áreas afectadas.',
      'Se revisa la documentación técnica antes de liberar nuevas órdenes.',
      'Se convoca revisión urgente con Ingeniería y Calidad para acotar el impacto.',
    ],
    accionesCorrectoras: [
      'Implantar revisión técnica adicional antes de liberar documentación.',
      'Actualizar la plantilla de definición técnica y el circuito de aprobación.',
      'Reforzar el soporte de Ingeniería a producción y laboratorio en incidencias repetitivas.',
    ],
  },
  'G-CAD': {
    descripcion: [
      'Se detecta una incidencia en la preparación digital o programación asociada al utillaje.',
      'La documentación de G-CAD no refleja correctamente la necesidad del proceso.',
      'Se identifica un problema de planificación o programa máquina antes de ejecutar la operación.',
    ],
    causas: [
      'Programa máquina incompleto o no validado antes de uso.',
      'Diseño de utillaje con definición insuficiente para fabricación.',
      'Falta de sincronización entre planificación y documentación de G-CAD.',
    ],
    accionesInmediatas: [
      'Se bloquea la orden hasta verificar programa, diseño y documentación.',
      'Se avisa al responsable de G-CAD para revisar el fichero y su versión.',
      'Se comprueba el alcance del problema en órdenes y piezas relacionadas.',
    ],
    accionesCorrectoras: [
      'Definir validación formal del programa máquina antes de liberar la orden.',
      'Revisar la metodología de diseño y aprobación del utillaje.',
      'Añadir control de planificación y trazabilidad documental en G-CAD.',
    ],
  },
};

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDate() {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 18);
  const diff = now - start;
  const d = new Date(start.getTime() + Math.random() * diff);
  return d.toISOString().split('T')[0];
}

function buildNarrative(area, categoria) {
  const data = areaContext[area] || areaContext['Producción'];
  return {
    descripcion: `${categoria}: ${rand(data.descripcion)}`,
    causas: rand(data.causas),
    accionInmediata: rand(data.accionesInmediatas),
    accionCorrectora: rand(data.accionesCorrectoras),
  };
}

async function nextNcId() {
  const tempId = `TMP-${crypto.randomUUID().slice(0, 12)}`;

  await query(
    `INSERT INTO no_conformidades (
      id, codigo_proyecto, proceso, fecha_deteccion, detectado_por,
      departamento, descripcion, email_destino, revisada
    ) VALUES (?, 'TMP', 'TMP', CURDATE(), 'seed', 'TMP', 'seed', 'seed@local', 0)`,
    [tempId]
  );

  const inserted = await query('SELECT seq FROM no_conformidades WHERE id = ?', [tempId]);
  const seq = inserted.rows[0].seq;
  const ncId = `NC-${String(seq).padStart(4, '0')}`;
  await query('UPDATE no_conformidades SET id = ? WHERE id = ?', [ncId, tempId]);
  return ncId;
}

async function seed() {
  console.log('Iniciando seed de datos de prueba...');

  const adminRes = await query(
    'SELECT id, email FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1',
    ['admin']
  );
  if (!adminRes.rows.length) {
    console.error('No se encontro ningun admin. Configura BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD y arranca el backend una vez.');
    process.exit(1);
  }

  const adminId = adminRes.rows[0].id;
  await query("DELETE FROM no_conformidades WHERE email_destino = 'prueba@empresa.com'");

  let creadas = 0;

  for (let i = 0; i < 50; i++) {
    const ncId = await nextNcId();
    const area = rand(areas);
    const categoria = rand(categoriasPorArea[area] || []);
    const narrativa = buildNarrative(area, categoria);
    const estado = rand(estados);
    const fecha = randDate();
    const valoracion = Math.random() < 0.25 ? 0 : randInt(100, 15000);
    const afectaMA = Math.random() < 0.2 ? 1 : 0;
    const closedAt = estado === 'Cerrada'
      ? new Date(new Date(fecha).getTime() + randInt(1, 30) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')
      : null;

    await query(
      `UPDATE no_conformidades SET
        codigo_proyecto = ?, proceso = ?, fecha_deteccion = ?, detectado_por = ?,
        departamento = ?, area = ?, programa = ?, categoria = ?,
        afecta_ma = ?, afecta_resultado = ?, descripcion = ?,
        causas = ?, accion_inmediata = ?, accion_correctora = ?,
        valoracion_euros = ?, estado = ?, email_destino = ?, creado_por = ?, closed_at = ?, revisada = 1
       WHERE id = ?`,
      [
        rand(proyectos),
        rand(procesos),
        fecha,
        rand(detectores),
        rand(departamentos),
        area,
        rand(programas),
        categoria,
        afectaMA,
        afectaMA ? 'Resultado de auditoría interna' : null,
        narrativa.descripcion,
        narrativa.causas,
        narrativa.accionInmediata,
        narrativa.accionCorrectora,
        valoracion,
        estado,
        'prueba@empresa.com',
        adminId,
        closedAt,
        ncId,
      ]
    );

    creadas++;
    process.stdout.write(`\rCreando NCs: ${creadas}/50`);
  }

  console.log('\n50 No Conformidades de prueba creadas correctamente.');
  await pool.end();
  process.exit(0);
}

seed().catch(async err => {
  console.error('\nError en seed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
