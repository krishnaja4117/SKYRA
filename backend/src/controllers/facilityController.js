/**
 * SKYRA – Emergency Facilities Controller (Phase 8 & 11)
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller handling GET /api/facilities/nearby?lat=...&lon=...&radius=...
 */

const { fetchNearbyFacilities } = require("../services/facilityService");

async function getNearbyFacilities(req, res, next) {
  try {
    const { lat, lon, latitude, longitude, radius } = req.query;
    const targetLat = lat ?? latitude;
    const targetLon = lon ?? longitude;

    if (targetLat === undefined || targetLon === undefined || targetLat === "" || targetLon === "") {
      return res.status(400).json({
        error: "Missing required query parameters: 'lat' and 'lon'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    const result = await fetchNearbyFacilities(
      Number(targetLat),
      Number(targetLon),
      radius ? Number(radius) : undefined
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNearbyFacilities,
};
