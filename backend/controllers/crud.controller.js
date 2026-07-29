const svc = require('../services/db.service');

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

            return res.render('crop-recommendations', {
                title: 'Crop Recommendations',
                tables, table, columns: visibleCols, grouped,
                search,
                totalDistricts,      // 165
                totalRows: allResult.total,
                page: districtPage,
                totalPages: totalDistrictPages,
                fkOptions,
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

module.exports = { showCrud, createRecord, updateRecord, deleteRecord };
