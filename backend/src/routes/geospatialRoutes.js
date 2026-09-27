const express = require("express");
const { getGeospatialContext } = require("../controllers/geospatialController");

const router = express.Router();

router.get("/geospatial/context", getGeospatialContext);

module.exports = router;
