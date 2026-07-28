const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/crud.controller');

// GET — list / view / edit
router.get('/', ctrl.showCrud);

// POST — create or update (action in body or query string)
router.post('/', (req, res, next) => {
    const action = (req.body && req.body.action) || req.query.action || '';
    if (action === 'create') return ctrl.createRecord(req, res, next);
    if (action === 'update') return ctrl.updateRecord(req, res, next);
    // Unknown action — redirect back
    const table = req.query.table || '';
    return res.redirect(`/crud${table ? '?table=' + encodeURIComponent(table) : ''}`);
});

// GET — delete (uses query params to avoid CSRF issues with forms)
router.get('/delete', ctrl.deleteRecord);

module.exports = router;
