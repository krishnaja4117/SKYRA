/**
 * SKYRA – Geospatial Controller (Phase 11)
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves real geospatial context (topographic elevation, slope, nearest
 * IMD Doppler Weather Radar station, and surveillance coverage status)
 * for validated coordinates.
 *
 * Guarantees:
 *   • Strict coordinate validation (rejects invalid/out-of-bound coords with HTTP 400)
 *   • Zero invented hazard zones, danger radiuses, or synthetic boundaries
 *   • Graceful degradation if upstream terrain services are unavailable
 *   • Completely stateless and lightweight
 */

const { validateCoordinates } = require("../services/weatherService");
const { fetchTerrainData } = require("../services/ingestion/terrainService");
const {
  findNearestRadarStation,
  RADAR_STATIONS,
} = require("../services/ingestion/radarService");

/**
 * GET /api/geospatial/context?lat=...&lon=...
 */
async function getGeospatialContext(req, res, next) {
  try {
    const { lat, lon, latitude, longitude } = req.query || {};
    const targetLat = lat ?? latitude;
    const targetLon = lon ?? longitude;

    if (
      targetLat === undefined ||
      targetLon === undefined ||
      targetLat === null ||
      targetLon === null ||
      String(targetLat).trim() === "" ||
      String(targetLon).trim() === ""
    ) {
      return res.status(400).json({
        error: "Missing required query parameters: 'lat' and 'lon'.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    const numLat = Number(targetLat);
    const numLon = Number(targetLon);

    if (Number.isNaN(numLat) || Number.isNaN(numLon)) {
      return res.status(400).json({
        error: "Coordinates must be valid floating-point numbers.",
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    // Validate geographic limits [-90, 90] and [-180, 180]
    let coords;
    try {
      coords = validateCoordinates(numLat, numLon);
    } catch (valErr) {
      return res.status(400).json({
        error: valErr.message,
        status: 400,
        sourceStatus: "invalid_coordinates",
      });
    }

    // 1. Terrain data ingestion (elevation & derived slope)
    let terrainData = null;
    try {
      terrainData = await fetchTerrainData(coords.latitude, coords.longitude);
    } catch (terrainErr) {
      console.warn(`[geospatialController] Terrain data unavailable for (${coords.latitude}, ${coords.longitude}):`, terrainErr.message);
    }

    const elevation = terrainData?.elevation != null ? Number(terrainData.elevation) : null;
    const slope = terrainData?.slope != null ? Number(terrainData.slope) : null;

    // 2. Nearest IMD Doppler Weather Radar station & 250 km surveillance boundary
    const nearest = findNearestRadarStation(coords.latitude, coords.longitude);
    const distanceKm = nearest ? nearest.distanceKm : null;
    const coverageRadiusKm = 250;
    const withinCoverage = distanceKm !== null ? distanceKm <= coverageRadiusKm : false;

    // Sanitized radar station list for reference
    const stations = RADAR_STATIONS.map((st) => ({
      id: st.id,
      name: st.name,
      latitude: st.latitude,
      longitude: st.longitude,
      band: st.band,
      rangeKm: st.rangeKm,
    }));

    return res.status(200).json({
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      terrain: {
        elevation,
        slope,
        source: terrainData?.source || "Copernicus / SRTM 90m DEM",
        available: elevation !== null && slope !== null,
      },
      radar: {
        nearestStation: nearest
          ? {
              id: nearest.id,
              name: nearest.name,
              latitude: nearest.latitude,
              longitude: nearest.longitude,
              band: nearest.band,
            }
          : null,
        distanceKm,
        coverageRadiusKm,
        withinCoverage,
        stations,
        available: nearest !== null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGeospatialContext,
};
