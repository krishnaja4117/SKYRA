const { getIntelligenceForLocation } = require("../services/intelligenceService");

async function postIntelligence(req, res, next) {
  try {
    const {
      latitude = 20.2961,
      longitude = 85.8245,
      locationName = "Current Location",
      region = "",
      source = "request",
      weatherInputs = null,
    } = req.body || {};

    const result = await getIntelligenceForLocation({
      latitude: Number(latitude),
      longitude: Number(longitude),
      locationName,
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
    const latitude = Number(req.query.lat ?? 20.2961);
    const longitude = Number(req.query.lon ?? 85.8245);
    const locationName = req.query.location || "Monitored Area";

    const result = await getIntelligenceForLocation({
      latitude,
      longitude,
      locationName,
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
