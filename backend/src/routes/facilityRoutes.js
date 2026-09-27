const express = require("express");
const { getNearbyFacilities } = require("../controllers/facilityController");

const router = express.Router();

router.get("/facilities/nearby", getNearbyFacilities);

module.exports = router;
