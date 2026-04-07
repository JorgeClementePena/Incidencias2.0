const XLSX = require('xlsx');
const {
  AREAS,
  DEPARTAMENTOS,
  PROGRAMAS,
  AREA_ALIASES,
  DEPARTAMENTO_ALIASES,
  PROGRAMA_ALIASES,
} = require('../config/catalogos');

const REQUIRED_HEADERS = [
  'area',
  'categoria',
  'departamento',
  'programa',
  'codigo_proyecto',
  'fecha_deteccion',
  'afecta_ma',
  'afecta_resultado',
  'accion_correctora',
];

const HEADER_ALIASES = {
  'no incidencias': 'numero_externo',
  area: 'area',
  categoria: 'categoria',
  'departamento que reporta': 'departamento',
  departamento: 'departamento',
  programa: 'programa',
  'cuenta proyecto': 'codigo_proyecto',
  fecha: 'fecha_deteccion',
  'valoracion': 'valoracion_euros',
  'valoracion eur': 'valoracion_euros',
  'valoracion euros': 'valoracion_euros',
  'valoracion ee': 'valoracion_euros',
  causas: 'causas',
  'accion inmediata': 'accion_inmediata',
  'afecta al ma': 'afecta_ma',
  'afecta resultado': 'afecta_resultado',
  'accion correcta': 'accion_correctora',
  'accion correctora': 'accion_correctora',
  observaciones: 'observaciones',
  descripcion: 'descripcion',
};

const DEFAULT_PROCESO_IMPORT = 'Importacion Excel';
const DEFAULT_DETECTADO_POR_IMPORT = 'Importacion Excel';
const DEFAULT_DESCRIPCION_IMPORT = 'Incidencia importada desde Excel sin descripción informada.';

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildLookup(values, aliases = {}) {
  const map = new Map();
  for (const value of values) {
    map.set(normalizeText(value), value);
  }
  for (const [alias, value] of Object.entries(aliases)) {
    map.set(normalizeText(alias), value);
  }
  return map;
}

const areaLookup = buildLookup(AREAS, AREA_ALIASES);
const departamentoLookup = buildLookup(DEPARTAMENTOS, DEPARTAMENTO_ALIASES);
const programaLookup = buildLookup(PROGRAMAS, PROGRAMA_ALIASES);

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo Excel no contiene hojas.');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (!rows.length) {
    throw new Error('El archivo Excel esta vacio.');
  }

  return rows;
}

function parseHeaders(headerRow) {
  const mapping = {};
  headerRow.forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeText(cell)];
    if (key && !(key in mapping)) {
      mapping[key] = index;
    }
  });
  return mapping;
}

function getCell(row, headerMap, key) {
  const index = headerMap[key];
  if (index === undefined) return '';
  return row[index] ?? '';
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function parseMoneyValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : null;
}

function parseBooleanValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (['si', 's', 'true', '1', 'yes'].includes(normalized)) return 1;
  if (['no', 'false', '0'].includes(normalized)) return 0;
  return null;
}

function normalizeWithLookup(value, lookup) {
  const normalized = normalizeText(value);
  return normalized ? lookup.get(normalized) || null : null;
}

function buildRawRow(headerMap, row) {
  return {
    numero_externo: getCell(row, headerMap, 'numero_externo'),
    area: getCell(row, headerMap, 'area'),
    categoria: getCell(row, headerMap, 'categoria'),
    departamento: getCell(row, headerMap, 'departamento'),
    programa: getCell(row, headerMap, 'programa'),
    codigo_proyecto: getCell(row, headerMap, 'codigo_proyecto'),
    fecha_deteccion: getCell(row, headerMap, 'fecha_deteccion'),
    valoracion_euros: getCell(row, headerMap, 'valoracion_euros'),
    causas: getCell(row, headerMap, 'causas'),
    accion_inmediata: getCell(row, headerMap, 'accion_inmediata'),
    afecta_ma: getCell(row, headerMap, 'afecta_ma'),
    afecta_resultado: getCell(row, headerMap, 'afecta_resultado'),
    accion_correctora: getCell(row, headerMap, 'accion_correctora'),
    observaciones: getCell(row, headerMap, 'observaciones'),
    descripcion: getCell(row, headerMap, 'descripcion'),
  };
}

function normalizeImportRow(rawRow, categoriasPorArea) {
  const errors = [];
  const area = normalizeWithLookup(rawRow.area, areaLookup);
  const departamento = normalizeWithLookup(rawRow.departamento, departamentoLookup);
  const programa = normalizeWithLookup(rawRow.programa, programaLookup);
  const categoria = String(rawRow.categoria || '').trim();
  const fechaDeteccion = parseDateValue(rawRow.fecha_deteccion);
  const valoracion = parseMoneyValue(rawRow.valoracion_euros);
  const afectaMa = parseBooleanValue(rawRow.afecta_ma);
  const afectaResultado = parseBooleanValue(rawRow.afecta_resultado);
  const categoriasValidas = area ? categoriasPorArea[area] || [] : [];

  if (!area) errors.push('Area no valida.');
  if (!departamento) errors.push('Departamento no valido.');
  if (!programa) errors.push('Programa no valido.');
  if (!categoria) errors.push('Categoria obligatoria.');
  if (area && categoria && !categoriasValidas.includes(categoria)) {
    errors.push('La categoria no pertenece al area seleccionada.');
  }
  if (!String(rawRow.codigo_proyecto || '').trim()) errors.push('Cuenta proyecto obligatoria.');
  if (!fechaDeteccion) errors.push('Fecha no valida.');
  if (valoracion === null) errors.push('Valoracion no valida.');
  if (afectaMa === null) errors.push('Afecta al MA debe ser SI o NO.');
  if (afectaResultado === null) errors.push('Afecta resultado debe ser SI o NO.');
  if (!String(rawRow.accion_correctora || '').trim()) errors.push('Accion correctora obligatoria.');

  return {
    errors,
    values: {
      codigo_proyecto: String(rawRow.codigo_proyecto || '').trim(),
      proceso: DEFAULT_PROCESO_IMPORT,
      fecha_deteccion: fechaDeteccion,
      detectado_por: DEFAULT_DETECTADO_POR_IMPORT,
      departamento,
      area,
      programa,
      categoria,
      afecta_ma: afectaMa,
      afecta_resultado: afectaResultado,
      descripcion: String(rawRow.descripcion || '').trim() || DEFAULT_DESCRIPCION_IMPORT,
      causas: String(rawRow.causas || '').trim() || null,
      accion_inmediata: String(rawRow.accion_inmediata || '').trim() || null,
      accion_correctora: String(rawRow.accion_correctora || '').trim(),
      valoracion_euros: valoracion ?? 0,
      observaciones: String(rawRow.observaciones || '').trim() || null,
    },
  };
}

function validateImportHeaders(headerMap) {
  const missing = REQUIRED_HEADERS.filter(key => headerMap[key] === undefined);
  if (!missing.length) return [];

  const labels = {
    area: 'AREA',
    categoria: 'CATEGORIA',
    departamento: 'DEPARTAMENTO QUE REPORTA',
    programa: 'PROGRAMA',
    codigo_proyecto: 'CUENTA PROYECTO',
    fecha_deteccion: 'FECHA',
    afecta_ma: 'AFECTA AL MA',
    afecta_resultado: 'AFECTA RESULTADO',
    accion_correctora: 'ACCION CORRECTA',
    descripcion: 'DESCRIPCION',
  };

  return missing.map(key => labels[key] || key);
}

module.exports = {
  parseWorkbook,
  parseHeaders,
  buildRawRow,
  normalizeImportRow,
  validateImportHeaders,
};
