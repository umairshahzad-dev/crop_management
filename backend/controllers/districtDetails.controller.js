const svc = require('../services/db.service');

async function showDistrictDetails(req, res, next) {
    try {
        const districtName = (req.query.district || '').trim();
        const [tables, districtOptions] = await Promise.all([
            svc.getDatabaseTables(),
            svc.getAllDistrictNames(),
        ]);

        let selectedDistrict = null, districtId = null, provinceName = '';
        let recommendations  = [], dataset = null, imagePath = null;

        if (districtName) {
            const data = await svc.getDistrictByName(districtName);
            if (data) {
                selectedDistrict = data.district_name;
                districtId       = data.district_id;
                provinceName     = data.province_name || '';
                [recommendations, dataset, imagePath] = await Promise.all([
                    svc.getCropRecommendations(districtName),
                    svc.getDistrictDataset(districtName),
                    svc.getDistrictImagePath(districtId),
                ]);
            }
        }

        res.render('district-details', {
            title: selectedDistrict ? `${selectedDistrict} – District Explorer` : 'District Explorer',
            tables, districtName, selectedDistrict, districtId, provinceName,
            recommendations, dataset, imagePath, districtOptions,
            currentPath: '/district-details', currentTable: null,
            formatValue: svc.formatValue,
        });
    } catch (err) { next(err); }
}

module.exports = { showDistrictDetails };
