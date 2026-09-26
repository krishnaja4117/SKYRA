/**
 * SKYRA – Weather Controller (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller handling HTTP requests for centralized live weather and forecast ingestion.
 */

const { fetchWeather, validateCoordinates } = require("../services/weatherService");
const { fetchHistoricalWeather } = require("../services/ingestion/era5Service");
const { fetchTerrainData } = require("../services/ingestion/terrainService");

/**
 * GET /api/weather?lat=...&lon=...&location=...
 */
async function getWeather(req, res, next) {
  try {
    const { lat, lon, location } = req.query;

    if (lat === undefined || lon === undefined || lat === "" || lon === "") {
      return res.status(400).json({
        error: "Missing required query parameters: 'lat' and 'lon'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    const coords = validateCoordinates(lat, lon);
    const locationName = (location && String(location).trim()) || "Active Location";

    const weatherData = await fetchWeather(coords.latitude, coords.longitude, locationName);

    return res.status(200).json(weatherData);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/weather/historical?lat=...&lon=...&startDate=...&endDate=...
 */
async function getHistoricalWeather(req, res, next) {
  try {
    const { lat, lon, startDate, endDate } = req.query;

    if (lat === undefined || lon === undefined || lat === "" || lon === "") {
      return res.status(400).json({
        error: "Missing required query parameters: 'lat' and 'lon'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    if (startDate === undefined || endDate === undefined || startDate === "" || endDate === "") {
      return res.status(400).json({
        error: "Missing required query parameters: 'startDate' and 'endDate' (YYYY-MM-DD).",
        status: 400,
        sourceStatus: "invalid_date_format",
      });
    }

    const data = await fetchHistoricalWeather(lat, lon, startDate, endDate);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/terrain?lat=...&lon=...
 */
async function getTerrain(req, res, next) {
  try {
    const { lat, lon, latitude, longitude } = req.query;
    const targetLat = lat ?? latitude;
    const targetLon = lon ?? longitude;

    if (targetLat === undefined || targetLon === undefined || targetLat === "" || targetLon === "") {
      return res.status(400).json({
        error: "Missing required query parameters: 'lat' and 'lon'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    const coords = validateCoordinates(targetLat, targetLon);
    const terrainData = await fetchTerrainData(coords.latitude, coords.longitude);
    return res.status(200).json(terrainData);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWeather,
  getHistoricalWeather,
  getTerrain,
};
