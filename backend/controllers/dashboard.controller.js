const svc = require('../services/db.service');
const db  = require('../../database/connection');

const TABLE_ICONS = {
    crop_recommendations: 'bi-flower1',
    district_dataset:     'bi-bar-chart-fill',
    district_maps:        'bi-map-fill',
    districts:            'bi-geo-alt-fill',
    fertilizers:          'bi-droplet-fill',
    irrigation_methods:   'bi-moisture',
    provinces:            'bi-buildings-fill',
    seasons:              'bi-calendar3',
    soil_types:           'bi-layers-fill',
};

const STAT_CARDS = {
    provinces:            { label: 'Provinces',            icon: 'bi-buildings-fill', color: 'primary' },
    districts:            { label: 'Districts',            icon: 'bi-geo-alt-fill',   color: 'success' },
    soil_types:           { label: 'Soil Types',           icon: 'bi-layers-fill',    color: 'warning' },
    fertilizers:          { label: 'Fertilizers',          icon: 'bi-droplet-fill',   color: 'info' },
    irrigation_methods:   { label: 'Irrigation Methods',   icon: 'bi-moisture',       color: 'secondary' },
    crop_recommendations: { label: 'Crop Recommendations', icon: 'bi-flower1',        color: 'danger' },
};

async function showDashboard(req, res, next) {
    try {
        const [tables, stats] = await Promise.all([
            svc.getDatabaseTables(),
            svc.getSummaryStats(),
        ]);

        const counts = {};
        await Promise.all(tables.map(async t => {
            const safe = svc.sanitizeIdentifier(t);
            if (!safe) return;
            try {
                const { rows } = await db.query(`SELECT COUNT(*) AS c FROM "${safe}"`);
                counts[t] = parseInt(rows[0].c, 10);
            } catch { counts[t] = 0; }
        }));

        res.render('dashboard', {
            title: 'Dashboard – Crop Recommendation System',
            tables, stats, statCards: STAT_CARDS, tableIcons: TABLE_ICONS, counts,
            currentPath: '/', currentTable: null,
        });
    } catch (err) { next(err); }
}

module.exports = { showDashboard };
