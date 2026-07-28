const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/crud.controller');

router.get('/', ctrl.showCrud);

router.post('/', (req, res, next) => {
    const action = req.body.action || req.query.action;
    if (action === 'create') return ctrl.createRecord(req, res, next);
    if (action === 'update') return ctrl.updateRecord(req, res, next);
    next();
});

router.get('/delete', ctrl.deleteRecord);

module.exports = router;
