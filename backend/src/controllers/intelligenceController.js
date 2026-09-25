const { getIntelligenceForLocation } = require("../services/intelligenceService");

async function postIntelligence(req, res, next) {
  try {
    const {
      latitude,
      longitude,
      lat,
      lon,
      locationName,
      location,
      region = "",
      source = "request",
      weatherInputs = null,
    } = req.body || {};

    const targetLat = latitude ?? lat;
    const targetLon = longitude ?? lon;

    if (targetLat === undefined || targetLon === undefined || targetLat === null || targetLon === null) {
      return res.status(400).json({
        error: "Missing required coordinates: 'latitude' and 'longitude'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    const resolvedLocationName = locationName || location || "Monitored Location";

    const result = await getIntelligenceForLocation({
      latitude: Number(targetLat),
      longitude: Number(targetLon),
      locationName: resolvedLocationName,
      region,
      source,
      customInputs: weatherInputs,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getIntelligence(req, res, next) {
  try {
    const { lat, lon, latitude, longitude, location, locationName, region = "" } = req.query;

    const targetLat = lat ?? latitude;
    const targetLon = lon ?? longitude;

    if (targetLat === undefined || targetLon === undefined || targetLat === null || targetLon === null) {
      return res.status(400).json({
        error: "Missing required query parameters: 'lat' and 'lon'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    const resolvedLocationName = location || locationName || "Monitored Area";

    const result = await getIntelligenceForLocation({
      latitude: Number(targetLat),
      longitude: Number(targetLon),
      locationName: resolvedLocationName,
      region,
      source: "query",
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postIntelligence,
  getIntelligence,
};
