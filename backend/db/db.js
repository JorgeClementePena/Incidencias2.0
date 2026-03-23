// backend/db/db.js — MySQL con mysql2

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  database:           process.env.DB_NAME     || 'nc_manager',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           '+00:00',
  charset:            'utf8mb4',
});

async function query(sql, params) {
  try {
    const [rows] = await pool.query(sql, params || []);
    return { rows: Array.isArray(rows) ? rows : [rows], raw: rows };
  } catch (err) {
    console.error('[DB] Error:', err.message);
    console.error('[DB] Query:', sql);
    throw err;
  }
}

async function getClient() {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  return {
    query: async (sql, params) => {
      const [rows] = await conn.query(sql, params || []);
      return { rows: Array.isArray(rows) ? rows : [rows], raw: rows };
    },
    commit:   () => conn.commit(),
    rollback: () => conn.rollback(),
    release:  () => conn.release(),
  };
}

module.exports = { query, getClient, pool };
