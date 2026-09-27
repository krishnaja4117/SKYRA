const express = require("express");
const {
  getWeather,
  getHistoricalWeather,
  getTerrain,
  getIMDAdvisoriesHandler,
} = require("../controllers/weatherController");

const router = express.Router();

router.get("/weather/historical", getHistoricalWeather);
router.get("/weather/imd", getIMDAdvisoriesHandler);
router.get("/weather", getWeather);
router.get("/terrain", getTerrain);

module.exports = router;
