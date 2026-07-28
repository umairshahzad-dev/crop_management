require('dotenv').config();
const { Pool } = require('pg');

/**
 * Centralised PostgreSQL connection pool.
 *
 * Supports two modes:
 *   1. DATABASE_URL  — single connection string (Neon / Vercel integration sets this automatically)
 *   2. Individual vars — DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (local dev)
 *
 * SSL is enabled automatically when DATABASE_URL is present (required by Neon).
 */

let poolConfig;

if (process.env.DATABASE_URL) {
    // Neon / Vercel: use the full connection string with SSL
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
} else {
    // Local development: use individual variables
    poolConfig = {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME     || 'crop_management',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err.message);
});

async function query(text, params = []) {
    const start  = Date.now();
    const result = await pool.query(text, params);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`  [db] ${Date.now() - start}ms — ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
    }
    return result;
}

module.exports = { pool, query };
