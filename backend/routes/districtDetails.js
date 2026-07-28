const express = require('express');
const router  = express.Router();
const { showDistrictDetails } = require('../controllers/districtDetails.controller');

router.get('/', showDistrictDetails);

module.exports = router;
