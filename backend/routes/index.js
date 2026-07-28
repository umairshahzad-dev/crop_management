const express = require('express');
const router  = express.Router();
const { showDashboard } = require('../controllers/dashboard.controller');

router.get('/', showDashboard);

module.exports = router;
