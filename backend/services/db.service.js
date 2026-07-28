const db = require('../../database/connection');

// ---------------------------------------------------------------------------
// Identifier helpers (prevent SQL injection via table/column names)
// ---------------------------------------------------------------------------

function sanitizeIdentifier(name) {
    return /^[a-zA-Z0-9_]+$/.test(name) ? name : '';
}

function quoteIdentifier(name) {
    return `"${name.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

async function getDatabaseTables() {
    const { rows } = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`);
    return rows.map(r => r.table_name);
}

async function getTableColumns(table) {
    table = sanitizeIdentifier(table);
    if (!table) return [];
    const { rows } = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`, [table]);
    return rows.map(r => ({
        name:     r.column_name,
        dataType: r.data_type,
        nullable: r.is_nullable === 'YES',
        default:  r.column_default,
    }));
}

async function getPrimaryKey(table) {
    table = sanitizeIdentifier(table);
    if (!table) return null;
    const { rows } = await db.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        WHERE tc.table_schema   = 'public'
          AND tc.table_name     = $1
          AND tc.constraint_type = 'PRIMARY KEY'
        LIMIT 1`, [table]);
    return rows[0]?.column_name || null;
}

async function getForeignKeys(table) {
    table = sanitizeIdentifier(table);
    if (!table) return {};
    const { rows } = await db.query(`
        SELECT kcu.column_name,
               ccu.table_name  AS foreign_table_name,
               ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema    = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema    = 'public'
          AND tc.table_name      = $1`, [table]);
    const fks = {};
    for (const r of rows) {
        fks[r.column_name] = {
            columnName:    r.column_name,
            foreignTable:  r.foreign_table_name,
            foreignColumn: r.foreign_column_name,
        };
    }
    return fks;
}

async function getForeignKeyOptions(table, column) {
    const fks = await getForeignKeys(table);
    if (!fks[column]) return [];
    const { foreignTable, foreignColumn } = fks[column];
    const rt = sanitizeIdentifier(foreignTable);
    const rc = sanitizeIdentifier(foreignColumn);
    if (!rt || !rc) return [];
    const { rows } = await db.query(
        `SELECT ${quoteIdentifier(rc)} AS value, ${quoteIdentifier(rc)} AS label FROM ${quoteIdentifier(rt)} ORDER BY ${quoteIdentifier(rc)}`
    );
    return rows;
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

async function getSummaryStats() {
    const tables = ['provinces', 'districts', 'soil_types', 'fertilizers', 'irrigation_methods', 'crop_recommendations'];
    const stats  = {};
    for (const table of tables) {
        const safe = sanitizeIdentifier(table);
        if (!safe) continue;
        try {
            const { rows } = await db.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(safe)}`);
            stats[table] = parseInt(rows[0].total, 10);
        } catch { stats[table] = 0; }
    }
    return stats;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

async function getTableRows(table, page = 1, perPage = 10, search = '', sort = '', direction = 'ASC') {
    table     = sanitizeIdentifier(table);
    direction = direction === 'DESC' ? 'DESC' : 'ASC';
    if (!table) return { rows: [], total: 0, columns: [], primaryKey: null };

    const columns    = await getTableColumns(table);
    const pk         = await getPrimaryKey(table);
    const whereParts = [];
    const params     = [];

    if (search) {
        const terms = [];
        for (const col of columns) {
            if (['integer','numeric','bigint','smallint'].includes(col.dataType)) continue;
            params.push(`%${search}%`);
            terms.push(`${quoteIdentifier(col.name)} ILIKE $${params.length}`);
        }
        if (terms.length) whereParts.push(`(${terms.join(' OR ')})`);
    }

    let orderCol = pk ? quoteIdentifier(pk) : 'ctid';
    if (sort) {
        const safe = sanitizeIdentifier(sort);
        if (safe && columns.find(c => c.name === safe)) orderCol = quoteIdentifier(safe);
    }

    const where  = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const select = pk ? 'SELECT *' : 'SELECT *, ctid::text AS __row_id';

    const { rows: cr } = await db.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)} ${where}`, params);
    const total = parseInt(cr[0].total, 10);

    params.push(perPage, (page - 1) * perPage);
    const { rows } = await db.query(
        `${select} FROM ${quoteIdentifier(table)} ${where} ORDER BY ${orderCol} ${direction} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return { rows, total, columns, primaryKey: pk };
}

async function getRowById(table, id) {
    table     = sanitizeIdentifier(table);
    const pk  = await getPrimaryKey(table);
    if (!table || !pk) return null;
    const { rows } = await db.query(
        `SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(pk)} = $1`, [id]
    );
    return rows[0] || null;
}

async function saveRow(table, data) {
    table = sanitizeIdentifier(table);
    if (!table) return false;
    const columns    = await getTableColumns(table);
    const pk         = await getPrimaryKey(table);
    const colNames   = [], placeholders = [], params = [];
    for (const col of columns) {
        if (col.name === pk || !(col.name in data)) continue;
        colNames.push(quoteIdentifier(col.name));
        params.push(normalizeValue(data[col.name], col.dataType));
        placeholders.push(`$${params.length}`);
    }
    if (!colNames.length) return false;
    await db.query(`INSERT INTO ${quoteIdentifier(table)} (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`, params);
    return true;
}

async function updateRow(table, data) {
    table    = sanitizeIdentifier(table);
    const pk = await getPrimaryKey(table);
    if (!table || !pk || !(pk in data)) return false;
    const columns = await getTableColumns(table);
    const sets = [], params = [];
    for (const col of columns) {
        if (col.name === pk || !(col.name in data)) continue;
        params.push(normalizeValue(data[col.name], col.dataType));
        sets.push(`${quoteIdentifier(col.name)} = $${params.length}`);
    }
    if (!sets.length) return false;
    params.push(data[pk]);
    await db.query(
        `UPDATE ${quoteIdentifier(table)} SET ${sets.join(', ')} WHERE ${quoteIdentifier(pk)} = $${params.length}`,
        params
    );
    return true;
}

async function deleteRow(table, id) {
    table    = sanitizeIdentifier(table);
    const pk = await getPrimaryKey(table);
    if (!table) return false;
    const sql = pk
        ? `DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(pk)} = $1`
        : `DELETE FROM ${quoteIdentifier(table)} WHERE ctid = $1`;
    await db.query(sql, [id]);
    return true;
}

// ---------------------------------------------------------------------------
// District details
// ---------------------------------------------------------------------------

async function getDistrictByName(name) {
    const { rows } = await db.query(`
        SELECT d.district_id, d.district_name, p.province_name
        FROM public.districts d
        LEFT JOIN public.provinces p ON p.province_id = d.province_id
        WHERE LOWER(d.district_name) = LOWER($1)`, [name]);
    return rows[0] || null;
}

async function getCropRecommendations(districtName) {
    const { rows } = await db.query(`
        SELECT * FROM public.crop_recommendations
        WHERE LOWER(district_name) = LOWER($1) ORDER BY month`, [districtName]);
    return rows;
}

async function getDistrictDataset(districtName) {
    const { rows } = await db.query(
        `SELECT * FROM public.district_dataset WHERE LOWER(district_name) = LOWER($1)`, [districtName]
    );
    return rows[0] || null;
}

async function getDistrictImagePath(districtId) {
    const { rows } = await db.query(
        `SELECT image_path FROM public.district_maps WHERE district_id = $1 LIMIT 1`, [districtId]
    );
    if (!rows[0]?.image_path) return null;
    return '/' + rows[0].image_path.replace(/^\//, '');
}

async function getAllDistrictNames() {
    const { rows } = await db.query(`SELECT district_name FROM public.districts ORDER BY district_name`);
    return rows.map(r => r.district_name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeValue(value, dataType) {
    if (value === '' || value == null) return null;
    if (['integer','bigint','smallint','numeric','decimal'].some(t => dataType.includes(t))) {
        return parseFloat(value);
    }
    return String(value);
}

function formatValue(value) {
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function toTitleCase(str) {
    return str.replace(/_/g, ' ').replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

module.exports = {
    sanitizeIdentifier,
    getDatabaseTables,
    getTableColumns,
    getPrimaryKey,
    getForeignKeys,
    getForeignKeyOptions,
    getSummaryStats,
    getTableRows,
    getRowById,
    saveRow,
    updateRow,
    deleteRow,
    getDistrictByName,
    getCropRecommendations,
    getDistrictDataset,
    getDistrictImagePath,
    getAllDistrictNames,
    formatValue,
    toTitleCase,
};
