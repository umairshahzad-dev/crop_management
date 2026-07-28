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
