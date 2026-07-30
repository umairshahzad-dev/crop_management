const svc = require('../services/db.service');

// Validation rules per table
const VALIDATION_RULES = {
    crop_recommendations: {
        district_name:      { required: true, label: 'District Name', type: 'text', minLen: 2 },
        province:           { required: true, label: 'Province',      type: 'text', minLen: 2 },
        month:              { required: true, label: 'Month',         type: 'enum',
                              values: ['January','February','March','April','May','June',
                                       'July','August','September','October','November','December'] },
        season:             { required: true, label: 'Season',        type: 'enum',
                              values: ['Rabi','Kharif','Zaid'] },
        recommended_crops:  { required: true, label: 'Recommended Crops', type: 'text', minLen: 2 },
        crop_priority:      { required: true, label: 'Crop Priority',     type: 'text', minLen: 1 },
        temperature_range:  { required: false, label: 'Temperature Range', type: 'text' },
        rainfall_category:  { required: false, label: 'Rainfall Category', type: 'text' },
    },
    provinces:   { province_name: { required: true, label: 'Province Name', type: 'text', minLen: 2 } },
    districts:   {
        district_name: { required: true, label: 'District Name', type: 'text', minLen: 2 },
        province_id:   { required: true, label: 'Province', type: 'number' },
    },
    soil_types:  { soil_name:        { required: true, label: 'Soil Name',      type: 'text', minLen: 2 } },
    fertilizers: {
        fertilizer_name: { required: true, label: 'Fertilizer Name', type: 'text', minLen: 2 },
        fertilizer_type: { required: true, label: 'Fertilizer Type', type: 'text', minLen: 2 },
    },
    seasons:     { season_name: { required: true, label: 'Season Name', type: 'text', minLen: 2 } },
};

function validateData(table, data) {
    const rules = VALIDATION_RULES[table] || {};
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
        const val = (data[field] || '').trim();
        if (rule.required && !val) {
            errors.push(`${rule.label} is required.`);
            continue;
        }
        if (val) {
            if (rule.type === 'enum' && !rule.values.includes(val)) {
                errors.push(`${rule.label} must be one of: ${rule.values.join(', ')}.`);
            }
            if (rule.type === 'text' && rule.minLen && val.length < rule.minLen) {
                errors.push(`${rule.label} must be at least ${rule.minLen} characters.`);
            }
            if (rule.type === 'number' && isNaN(parseFloat(val))) {
                errors.push(`${rule.label} must be a valid number.`);
            }
        }
    }
    return errors;
}

async function createRecordApi(req, res) {
    try {
        const table = req.query.table || req.body.table || '';
        const data  = { ...req.body };
        delete data.action;
        delete data.table;

        // Validate
        const errors = validateData(table, data);
        if (errors.length > 0) {
            return res.status(422).json({ success: false, errors });
        }

        await svc.saveRow(table, data);
        return res.json({ success: true });
    } catch (err) {
        console.error('API create error:', err.message);
        return res.status(500).json({ success: false, errors: [err.message] });
    }
}

async function showCrud(req, res, next) {
    try {
        const tables = await svc.getDatabaseTables();
        let table    = req.query.table || '';
        if (!table || !tables.includes(table)) table = tables[0] || '';

        const page      = Math.max(1, parseInt(req.query.page  || '1',   10));
        const search    = (req.query.search    || '').trim();
        const sort      = (req.query.sort      || '').trim();
        const direction = (req.query.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        const { rows, columns, total, primaryKey: pk } = await svc.getTableRows(
            table, page, 10, search, sort, direction
        );
        const totalPages = Math.max(1, Math.ceil(total / 10));

        const fkOptions = {};
        for (const col of columns) {
            if (col.name === pk) continue;
            fkOptions[col.name] = await svc.getForeignKeyOptions(table, col.name);
        }

        const viewRow = req.query.view ? await svc.getRowById(table, req.query.view) : null;
        const editRow = req.query.edit ? await svc.getRowById(table, req.query.edit) : null;

        // Special grouped view for crop_recommendations
        if (table === 'crop_recommendations') {
            const DISTRICTS_PER_PAGE = 10;
            const districtPage = Math.max(1, parseInt(req.query.page || '1', 10));

            // Fetch ALL rows for grouping (search-aware)
            const allResult = await svc.getTableRows(table, 1, 9999, search, '', 'ASC');

            // Hidden columns (PKs / FKs)
            const hiddenCols = new Set(['id', 'district_id', 'recommendation_id']);
            const visibleCols = allResult.columns.filter(c => !hiddenCols.has(c.name));

            // Group by district_name
            const groupMap = new Map();
            for (const row of allResult.rows) {
                const key = row.district_name || 'Unknown';
                if (!groupMap.has(key)) groupMap.set(key, []);
                groupMap.get(key).push(row);
            }

            const MONTH_ORDER = ['January','February','March','April','May','June',
                                  'July','August','September','October','November','December'];

            // Build full sorted grouped array
            const allGrouped = [...groupMap.entries()].map(([district, recs]) => {
                recs.sort((a, b) => {
                    const ai = MONTH_ORDER.indexOf(a.month);
                    const bi = MONTH_ORDER.indexOf(b.month);
                    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                });
                return { district, first: recs[0], rest: recs.slice(1), pk: recs[0]?.[pk] };
            }).sort((a, b) => a.district.localeCompare(b.district));

            // Paginate districts
            const totalDistricts = allGrouped.length;
            const totalDistrictPages = Math.max(1, Math.ceil(totalDistricts / DISTRICTS_PER_PAGE));
            const offset = (districtPage - 1) * DISTRICTS_PER_PAGE;
            const grouped = allGrouped.slice(offset, offset + DISTRICTS_PER_PAGE);

            // Fetch districts for the dropdown (with province names)
            const districtRows = await require('../../database/connection').query(`
                SELECT d.district_id, d.district_name, p.province_name
                FROM public.districts d
                LEFT JOIN public.provinces p ON p.province_id = d.province_id
                ORDER BY d.district_name`);
            const districtOptions = districtRows.rows;

            return res.render('crop-recommendations', {
                title: 'Crop Recommendations',
                tables, table, columns: visibleCols, grouped,
                search,
                totalDistricts,      // 165
                totalRows: allResult.total,
                page: districtPage,
                totalPages: totalDistrictPages,
                fkOptions,
                districtOptions,
                created:     'created' in req.query,
                updated:     'updated' in req.query,
                currentPath: '/crud',
                currentTable: table,
                formatValue:  svc.formatValue,
                toTitleCase:  svc.toTitleCase,
            });
        }

        res.render('crud', {
            title: svc.toTitleCase(table),
            tables, table, columns, rows, pk,
            total, totalPages, page, search, sort, direction,
            fkOptions, viewRow, editRow,
            created:     'created' in req.query,
            updated:     'updated' in req.query,
            deleted:     'deleted' in req.query,
            currentPath: '/crud',
            currentTable: table,
            formatValue:  svc.formatValue,
            toTitleCase:  svc.toTitleCase,
        });
    } catch (err) { next(err); }
}

async function createRecord(req, res, next) {
    try {
        // table can come from query string (/crud?table=x) or body
        const table = req.query.table || req.body.table || '';
        const data  = { ...req.body };
        delete data.action;
        delete data.table;

        await svc.saveRow(table, data);
        res.redirect(`/crud?table=${encodeURIComponent(table)}&created=1`);
    } catch (err) { next(err); }
}

async function updateRecord(req, res, next) {
    try {
        const table = req.query.table || req.body.table || '';
        const data  = { ...req.body };
        delete data.action;
        delete data.table;

        await svc.updateRow(table, data);
        res.redirect(`/crud?table=${encodeURIComponent(table)}&updated=1`);
    } catch (err) { next(err); }
}

async function deleteRecord(req, res, next) {
    try {
        const table = req.query.table || '';
        const id    = req.query.id    || '';
        if (table && id) await svc.deleteRow(table, id);
        res.redirect(`/crud?table=${encodeURIComponent(table)}&deleted=1`);
    } catch (err) { next(err); }
}

module.exports = { showCrud, createRecord, createRecordApi, updateRecord, deleteRecord };
