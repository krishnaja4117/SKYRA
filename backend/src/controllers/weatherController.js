/**
 * SKYRA – Weather Controller (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller handling HTTP requests for centralized live weather and forecast ingestion.
 */

const { fetchWeather, validateCoordinates } = require("../services/weatherService");

/**
 * GET /api/weather?lat=...&lon=...&location=...
 */
async function getWeather(req, res, next) {
  try {
    const { lat, lon, location } = req.query;

    if (lat === undefined || lon === undefined) {
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

module.exports = {
  getWeather,
};
