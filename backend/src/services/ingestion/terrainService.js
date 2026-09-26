/**
 * SKYRA – Server-Side Terrain & Geospatial Ingestion Service (Phase 3 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Retrieves, validates, normalizes, and caches authoritative topographic terrain
 * data (elevation and slope) from Open-Meteo's Copernicus / SRTM 90m Digital
 * Elevation Model (DEM).
 *
 * Guarantees:
 *   • Queries authoritative Open-Meteo Elevation API: https://api.open-meteo.com/v1/elevation
 *   • Derives real topographic slope using finite-difference spatial elevation gradient
 *   • Zero hardcoded terrain fallback (no 'terrainSlope = 15')
 *   • Reuses existing backend coordinate validation (weatherService.js)
 *   • In-memory 7-day TTL caching via pipelineRunner (terrain is static)
 *   • Fail-fast 8-second request timeout with classified error handling
 *   • Truthful provenance including spatial resolution and canonical units
 */

const { validateCoordinates } = require("../weatherService");
const {
  runIngestionPipeline,
  buildTerrainSnapshot,
  clearPipelineCache,
} = require("./pipelineRunner");

const ELEVATION_ENDPOINT = "https://api.open-meteo.com/v1/elevation";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day cache for static topography
const GRID_DELTA_DEG = 0.005; // ~555 meters offset for 5-point elevation stencil

/**
 * Generates a consistent cache key for terrain queries.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
function getTerrainCacheKey(lat, lon) {
  return `terrain:${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

/**
 * Calculates real topographic slope (in degrees) from a 5-point elevation stencil:
 * [center, north, south, east, west].
 *
 * @param {Array<number>} elevations - [center, north, south, east, west] in meters
 * @param {number} lat - Latitude in degrees (for longitude distance correction)
 * @returns {{ elevation: number, slope: number }}
 */
function calculateTopographyFromGrid(elevations, lat) {
  const [center, north, south, east, west] = elevations.map(Number);

  // Meters per degree latitude is constant ~111,320m
  // Meters per degree longitude scales with cos(latitude)
  const distY = 2 * GRID_DELTA_DEG * 111320;
  const radLat = (lat * Math.PI) / 180;
  const distX = 2 * GRID_DELTA_DEG * 111320 * Math.max(Math.cos(radLat), 0.01);

  // Partial derivatives (finite difference gradient: rise over run)
  const dzDy = (north - south) / distY;
  const dzDx = (east - west) / distX;

  // Slope in radians = arctan(sqrt((dz/dx)^2 + (dz/dy)^2))
  const slopeRad = Math.atan(Math.sqrt(dzDx * dzDx + dzDy * dzDy));
  const rawSlopeDeg = slopeRad * (180 / Math.PI);

  // Bound to physical [0, 90] degrees and round to 2 decimal places
  const slope = Math.min(Math.max(Math.round(rawSlopeDeg * 100) / 100, 0), 90);
  const elevation = Math.round(center * 10) / 10;

  return { elevation, slope };
}

/**
 * Validates raw elevation response from Open-Meteo Elevation API.
 *
 * @param {Object} data
 * @throws {Error}
 */
function validateTerrainResponse(data) {
  if (!data || typeof data !== "object") {
    const err = new Error("Terrain API returned an empty or malformed payload.");
    err.statusCode = 502;
    err.sourceStatus = "malformed_response";
    throw err;
  }

  if (data.error === true || data.reason) {
    const err = new Error(`Terrain API error: ${data.reason || "Unknown API error"}`);
    err.statusCode = 502;
    err.sourceStatus = "upstream_error";
    throw err;
  }

  if (!Array.isArray(data.elevation) || data.elevation.length < 5) {
    const err = new Error("Terrain API response is missing expected 5-point elevation grid array.");
    err.statusCode = 502;
    err.sourceStatus = "malformed_response";
    throw err;
  }

  for (let i = 0; i < data.elevation.length; i++) {
    const val = data.elevation[i];
    if (val === null || val === undefined || !Number.isFinite(Number(val))) {
      const err = new Error(`Terrain API elevation at index ${i} is non-numeric or missing.`);
      err.statusCode = 502;
      err.sourceStatus = "malformed_response";
      throw err;
    }

    const num = Number(val);
    if (num < -500 || num > 9000) {
      const err = new Error(`Terrain API elevation value ${num} is out of physical Earth boundaries [-500m, 9000m].`);
      err.statusCode = 502;
      err.sourceStatus = "malformed_response";
      throw err;
    }
  }
}

/**
 * Normalizes elevation grid response into canonical SKYRA terrain model.
 *
 * @param {Object} raw
 * @param {Object} meta
 * @returns {Object} Canonical terrain model
 */
function normalizeTerrainData(raw, { latitude, longitude, isCached = false }) {
  const { elevation, slope } = calculateTopographyFromGrid(raw.elevation, latitude);
  const nowIso = new Date().toISOString();

  const requestedCoordinates = {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };

  const canonicalUnits = {
    elevation: "m",
    slope: "degrees",
  };

  const provenance = {
    provider: "Open-Meteo",
    dataset: "Copernicus / SRTM 90m Digital Elevation Model",
    endpoint: ELEVATION_ENDPOINT,
    spatialResolution: "~90 meters",
    ingestionTimestamp: nowIso,
    dataFreshness: isCached ? "cached" : "live",
    requestedCoordinates,
    cacheStatus: {
      isCached: Boolean(isCached),
      cacheKey: getTerrainCacheKey(latitude, longitude),
    },
    persistenceStatus: false,
  };

  return {
    source: "Open-Meteo DEM Terrain Ingestion",
    requestedCoordinates,
    coordinates: requestedCoordinates,
    elevation,
    slope,
    units: canonicalUnits,
    provenance,
    sourceMetadata: {
      provider: "Open-Meteo",
      dataset: "Copernicus / SRTM 90m Digital Elevation Model",
      endpoint: ELEVATION_ENDPOINT,
      sourceStatus: "ok",
      dataFreshness: isCached ? "cached" : "live",
      timestamp: nowIso,
    },
  };
}

/**
 * Fetches real elevation and derives real topographic slope from Open-Meteo Elevation API.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {Object} [options]
 * @param {Function} [options.fetcherOverride] - Test hook
 * @returns {Promise<Object>} Normalized terrain model with real elevation and slope
 */
async function fetchTerrainData(latitude, longitude, options = {}) {
  const coords = validateCoordinates(latitude, longitude);
  const cacheKey = getTerrainCacheKey(coords.latitude, coords.longitude);

  const fetcher = options.fetcherOverride
    ? async () => options.fetcherOverride(coords.latitude, coords.longitude)
    : async () => {
        // Construct 5-point stencil: [center, north, south, east, west]
        const dLat = GRID_DELTA_DEG;
        const dLon = GRID_DELTA_DEG;
        const lats = [
          coords.latitude,
          coords.latitude + dLat,
          coords.latitude - dLat,
          coords.latitude,
          coords.latitude,
        ]
          .map((n) => n.toFixed(4))
          .join(",");

        const lons = [
          coords.longitude,
          coords.longitude,
          coords.longitude,
          coords.longitude + dLon,
          coords.longitude - dLon,
        ]
          .map((n) => n.toFixed(4))
          .join(",");

        const url = `${ELEVATION_ENDPOINT}?latitude=${lats}&longitude=${lons}`;

        let response;
        try {
          response = await fetch(url, {
            signal: AbortSignal.timeout(8000), // 8-second fail-fast timeout
          });
        } catch (err) {
          const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
          const errorMsg = isTimeout
            ? "Terrain upstream API request timed out after 8 seconds."
            : `Terrain upstream network failure: ${err.message}`;
          const error = new Error(errorMsg);
          error.statusCode = isTimeout ? 504 : 502;
          error.sourceStatus = isTimeout ? "timeout" : "network_failure";
          throw error;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          const error = new Error(`Terrain API returned HTTP ${response.status}: ${errorText || response.statusText}`);
          error.statusCode = response.status === 429 ? 429 : (response.status >= 400 && response.status < 500 ? response.status : 502);
          error.sourceStatus = response.status >= 400 && response.status < 500 ? "client_error" : "upstream_error";
          throw error;
        }

        let data;
        try {
          data = await response.json();
        } catch (err) {
          const error = new Error(`Failed to parse Terrain API response as JSON: ${err.message}`);
          error.statusCode = 502;
          error.sourceStatus = "malformed_response";
          throw error;
        }

        return data;
      };

  const validator = (data) => {
    validateTerrainResponse(data);
  };

  const normalizer = (data, normMeta) => {
    return normalizeTerrainData(data, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      isCached: normMeta?.isCached ?? false,
    });
  };

  return await runIngestionPipeline({
    fetcher,
    cacheKey,
    cacheTtlMs: CACHE_TTL_MS,
    validator,
    normalizer,
    snapshotBuilder: buildTerrainSnapshot,
    persistToDb: options.persistToDb ?? true,
  });
}

/**
 * Clears in-memory pipeline cache (useful for testing).
 */
function clearTerrainCache() {
  clearPipelineCache();
}

module.exports = {
  fetchTerrainData,
  calculateTopographyFromGrid,
  validateTerrainResponse,
  normalizeTerrainData,
  getTerrainCacheKey,
  clearTerrainCache,
  ELEVATION_ENDPOINT,
};
