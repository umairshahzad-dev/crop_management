require('dotenv').config();
const { Pool } = require('pg');

/**
 * Centralised PostgreSQL connection pool.
 * All credentials are read exclusively from the .env file.
 * To move to another machine, only update .env — no source changes needed.
 */
const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'crop_management',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err.message);
});

/**
 * Execute a parameterised query via the shared pool.
 * @param {string} text   SQL string
 * @param {Array}  params Query parameters
 */
async function query(text, params = []) {
    const start  = Date.now();
    const result = await pool.query(text, params);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`  [db] ${Date.now() - start}ms — ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
    }
    return result;
}

module.exports = { pool, query };
