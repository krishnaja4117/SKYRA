/**
 * SKYRA – Common Provenance & Multi-Source Tracking Contract (Phases 2 & 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a standardized, audit-compliant provenance builder used across all
 * external meteorological and environmental data providers:
 *   • Open-Meteo NWP & ERA5 Reanalysis
 *   • India Meteorological Department (IMD)
 *   • Satellite Remote Sensing (INSAT-3D/3DR / MOSDAC / CAMS)
 *   • Doppler Weather Radar (IMD-DWR Network)
 *   • Open-Meteo DEM Topographic Elevation
 *
 * Guarantees:
 *   • Invariable provenance schema across all ingestion streams
 *   • ISO-8601 UTC timestamps for retrieval, observation, and publication
 *   • Explicit status flags ("ok", "cached", "partial", "mock", "blocked", "error")
 *   • Strict geographic scope recording (lat/lon, stationId, bounding box, radiusKm)
 *   • Zero silent fallback or fabricated telemetry
 */

const VALID_STATUSES = Object.freeze(["ok", "cached", "partial", "mock", "blocked", "error"]);
const VALID_FRESHNESS = Object.freeze(["live", "recent", "cached", "historical", "stale", "synthetic_test"]);

/**
 * Creates a normalized, canonical provenance descriptor.
 *
 * @param {Object} params
 * @param {string} params.provider - External data authority (e.g. "IMD", "Open-Meteo", "ISRO-MOSDAC")
 * @param {string} params.dataset - Data product name (e.g. "City Advisory", "ERA5 Reanalysis", "INSAT-3D TIR1")
 * @param {string|null} [params.sourceUrl] - Authoritative upstream endpoint URL
 * @param {string|Date} [params.observationTime] - Actual physical measurement/sensing timestamp
 * @param {string|Date|null} [params.publicationTime] - Time bulletin or data was published upstream
 * @param {string|Date} [params.retrievalTime] - Time data was retrieved by SKYRA
 * @param {Object} [params.geographicScope] - Geographic coverage metadata
 * @param {number} [params.geographicScope.latitude]
 * @param {number} [params.geographicScope.longitude]
 * @param {string} [params.geographicScope.stationId]
 * @param {string} [params.geographicScope.stationName]
 * @param {number} [params.geographicScope.coverageRadiusKm]
 * @param {number[]} [params.geographicScope.bbox] - [minLon, minLat, maxLon, maxLat]
 * @param {string} [params.freshness="live"] - Data currency classification
 * @param {string} [params.status="ok"] - Provider status
 * @param {string|null} [params.diagnosticMessage] - Detailed note if partial/blocked/error
 * @returns {Object} Canonical Provenance Object
 */
function createProvenance({
  provider,
  dataset,
  sourceUrl = null,
  observationTime = new Date().toISOString(),
  publicationTime = null,
  retrievalTime = new Date().toISOString(),
  geographicScope = {},
  freshness = "live",
  status = "ok",
  diagnosticMessage = null,
}) {
  if (!provider || typeof provider !== "string") {
    throw new TypeError("Provenance requires a non-empty string 'provider'");
  }
  if (!dataset || typeof dataset !== "string") {
    throw new TypeError("Provenance requires a non-empty string 'dataset'");
  }

  const normObsTime = observationTime instanceof Date ? observationTime.toISOString() : String(observationTime);
  const normRetTime = retrievalTime instanceof Date ? retrievalTime.toISOString() : String(retrievalTime);
  const normPubTime = publicationTime ? (publicationTime instanceof Date ? publicationTime.toISOString() : String(publicationTime)) : null;

  const validStatus = VALID_STATUSES.includes(status) ? status : "error";
  const validFreshness = VALID_FRESHNESS.includes(freshness) ? freshness : "live";

  return {
    provider: provider.trim(),
    dataset: dataset.trim(),
    sourceUrl: sourceUrl ? String(sourceUrl).trim() : null,
    retrievalTime: normRetTime,
    observationTime: normObsTime,
    publicationTime: normPubTime,
    geographicScope: {
      type: geographicScope.bbox ? "BBox" : geographicScope.stationId ? "Station" : "Point",
      latitude: geographicScope.latitude !== undefined ? Number(geographicScope.latitude) : null,
      longitude: geographicScope.longitude !== undefined ? Number(geographicScope.longitude) : null,
      stationId: geographicScope.stationId || null,
      stationName: geographicScope.stationName || null,
      coverageRadiusKm: geographicScope.coverageRadiusKm !== undefined ? Number(geographicScope.coverageRadiusKm) : null,
      bbox: Array.isArray(geographicScope.bbox) ? geographicScope.bbox : null,
    },
    freshness: validFreshness,
    status: validStatus,
    diagnosticMessage: diagnosticMessage ? String(diagnosticMessage) : null,
  };
}

module.exports = {
  createProvenance,
  VALID_STATUSES,
  VALID_FRESHNESS,
};
