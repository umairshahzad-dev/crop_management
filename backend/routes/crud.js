const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/crud.controller');

// GET — list / view / edit
router.get('/', ctrl.showCrud);

// POST /crud/api — JSON API for modal AJAX submissions
router.post('/api', ctrl.createRecordApi);

// POST — create or update (standard form submit)
router.post('/', (req, res, next) => {
    const action = (req.body && req.body.action) || req.query.action || '';
    if (action === 'create') return ctrl.createRecord(req, res, next);
    if (action === 'update') return ctrl.updateRecord(req, res, next);
    const table = req.query.table || '';
    return res.redirect(`/crud${table ? '?table=' + encodeURIComponent(table) : ''}`);
});

// GET — delete
router.get('/delete', ctrl.deleteRecord);

module.exports = router;
