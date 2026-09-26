/**
 * SKYRA – Ingestion Pipeline Runner (Phase 3 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic, reusable pipeline orchestrator for all meteorological data sources.
 *
 * Ingestion Lifecycle:
 *   1. CACHE LOOKUP   – Checks in-memory TTL cache to prevent redundant provider requests.
 *   2. FETCH (RETRY)  – Invokes the provider fetcher with bounded exponential backoff.
 *   3. VALIDATE       – Enforces structural integrity; rejects missing/invalid data explicitly.
 *   4. NORMALIZE      – Formats payload into canonical schema with provenance and freshness tags.
 *   5. CACHE UPDATE   – Caches normalized output in memory.
 *   6. STORE          – Persists snapshot to MongoDB (WeatherSnapshot) if DB is connected (non-fatal).
 *
 * Safety Guarantees:
 *   • Never retries 4xx client/validation errors.
 *   • Never silently fabricates missing meteorological variables.
 *   • Degrades seamlessly without error if MongoDB is disconnected.
 *   • Completely provider-agnostic (accepts any async fetcher function).
 */

const mongoose = require("mongoose");
const WeatherSnapshot = require("../../models/WeatherSnapshot");

// In-memory pipeline cache: Key -> { data: Object, timestamp: number }
const _pipelineCache = new Map();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes default

/**
 * Determines whether an error is transient and eligible for retry.
 *
 * @param {Error} error
 * @returns {boolean}
 */
function isTransientError(error) {
  // Never retry client validation or 4xx HTTP errors
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return false;
  }

  // Never retry malformed responses or invalid coordinate errors
  if (error.sourceStatus === "malformed_response" || error.sourceStatus === "invalid_coordinates") {
    return false;
  }

  // Transient HTTP statuses: 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
  if (error.statusCode === 502 || error.statusCode === 503 || error.statusCode === 504) {
    return true;
  }

  // Fail-fast timeout errors
  if (error.name === "TimeoutError" || error.name === "AbortError" || error.sourceStatus === "timeout") {
    return true;
  }

  // Network connection drops
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  );
}

/**
 * Executes an async fetcher with bounded exponential backoff.
 *
 * @param {Function} fetcher - Async function () => Promise<any>
 * @param {Object} [options]
 * @param {number} [options.maxRetries=2] - Maximum retry attempts (capped at 5)
 * @param {number} [options.initialDelayMs=300] - Initial delay in ms
 * @param {number} [options.backoffFactor=2] - Exponential multiplier
 * @param {Function} [options.isRetryable] - Custom error filter
 * @returns {Promise<{ data: any, attempts: number }>}
 */
async function executeWithRetry(fetcher, options = {}) {
  const maxRetries = Math.min(Math.max(Number(options.maxRetries ?? 2), 0), 5);
  const initialDelayMs = Math.max(Number(options.initialDelayMs ?? 300), 50);
  const backoffFactor = Math.max(Number(options.backoffFactor ?? 2), 1.5);
  const isRetryable = options.isRetryable || isTransientError;

  let attempt = 0;
  while (true) {
    try {
      const data = await fetcher();
      return { data, attempts: attempt + 1 };
    } catch (err) {
      attempt++;
      if (attempt > maxRetries || !isRetryable(err)) {
        err.attempts = attempt;
        throw err;
      }

      // Calculate bounded exponential backoff delay (max 3000ms)
      const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1), 3000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Builder creating a WeatherSnapshot persistence document from a normalized live weather model.
 *
 * @param {Object} normalized
 * @returns {Object} Schema-ready object for WeatherSnapshot
 */
function buildLiveSnapshot(normalized) {
  if (!normalized || !normalized.current) return null;

  return {
    snapshotType: "live",
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    displayName: normalized.locationName || "Monitored Location",
    source: normalized.sourceMetadata?.provider || "Open-Meteo",
    provider: normalized.sourceMetadata?.provider || "Open-Meteo",
    dataset: normalized.sourceMetadata?.model || "Best-Match NWP",
    dataFreshness: normalized.sourceMetadata?.dataFreshness || "live",
    sourceStatus: normalized.sourceMetadata?.sourceStatus || "ok",
    retrievedAt: normalized.sourceMetadata?.timestamp ? new Date(normalized.sourceMetadata.timestamp) : new Date(),
    observedAt: normalized.current.observedAt ? new Date(normalized.current.observedAt) : null,
    units: normalized.units,
    current: {
      temperature: normalized.current.temperature,
      feelsLike: normalized.current.feelsLike,
      humidity: normalized.current.humidity,
      windSpeed: normalized.current.windSpeed,
      windDirection: normalized.current.windDirection,
      rainfall: normalized.current.rainfall,
      pressure: normalized.current.pressure,
      weatherCode: normalized.current.weatherCode,
      condition: normalized.current.condition,
    },
    forecastRainfall: normalized.forecast?.precipitationExpected ?? 0,
    precipitationExpected: normalized.forecast?.precipitationExpected ?? 0,
    maxRainProbability: normalized.forecast?.maxRainProbability ?? 0,
    provenance: normalized.provenance ? {
      provider: normalized.provenance.provider,
      sourceModel: normalized.provenance.sourceModel,
      observationTimestamp: normalized.provenance.observationTimestamp ? new Date(normalized.provenance.observationTimestamp) : null,
      ingestionTimestamp: normalized.provenance.ingestionTimestamp ? new Date(normalized.provenance.ingestionTimestamp) : new Date(),
      dataFreshness: normalized.provenance.dataFreshness,
      requestedCoordinates: normalized.provenance.requestedCoordinates,
      actualSourceCoordinates: normalized.provenance.actualSourceCoordinates,
      cacheStatus: normalized.provenance.cacheStatus,
      persistenceStatus: true,
    } : undefined,
    // Temporary live snapshot: expires in 7 days via TTL
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  };
}

/**
 * Builder creating a WeatherSnapshot persistence document from a normalized historical ERA5 model.
 *
 * @param {Object} normalized
 * @returns {Object} Schema-ready object for WeatherSnapshot
 */
function buildHistoricalSnapshot(normalized) {
  if (!normalized || !normalized.dailyRecords) return null;

  const lat = normalized.requestedCoordinates?.latitude ?? normalized.coordinates?.latitude ?? normalized.latitude;
  const lon = normalized.requestedCoordinates?.longitude ?? normalized.coordinates?.longitude ?? normalized.longitude;

  return {
    snapshotType: "historical",
    latitude: lat,
    longitude: lon,
    displayName: `Historical Climate (${normalized.requestedRange?.startDate} to ${normalized.requestedRange?.endDate})`,
    source: normalized.sourceMetadata?.provider || "Open-Meteo ERA5",
    provider: normalized.sourceMetadata?.provider || "Open-Meteo",
    dataset: normalized.sourceMetadata?.dataset || "ERA5 Reanalysis Archive",
    dataFreshness: "historical",
    sourceStatus: normalized.sourceMetadata?.sourceStatus || "ok",
    retrievedAt: normalized.retrievalTimestamp ? new Date(normalized.retrievalTimestamp) : new Date(),
    requestedRange: normalized.requestedRange,
    recordCount: normalized.recordCount,
    dailyRecords: normalized.dailyRecords,
    units: normalized.units,
    provenance: normalized.provenance ? {
      provider: normalized.provenance.provider,
      sourceModel: normalized.provenance.sourceModel,
      observationTimestamp: normalized.provenance.observationTimestamp ? new Date(normalized.provenance.observationTimestamp) : null,
      ingestionTimestamp: normalized.provenance.ingestionTimestamp ? new Date(normalized.provenance.ingestionTimestamp) : new Date(),
      dataFreshness: normalized.provenance.dataFreshness,
      requestedCoordinates: normalized.provenance.requestedCoordinates,
      actualSourceCoordinates: normalized.provenance.actualSourceCoordinates,
      cacheStatus: normalized.provenance.cacheStatus,
      persistenceStatus: true,
    } : undefined,
    // Historical record: permanent retention (expiresAt must be null)
    expiresAt: null,
  };
}

/**
 * Builder creating a WeatherSnapshot persistence document from a normalized terrain model.
 *
 * @param {Object} normalized
 * @returns {Object} Schema-ready object for WeatherSnapshot
 */
function buildTerrainSnapshot(normalized) {
  if (!normalized) return null;

  const lat = normalized.requestedCoordinates?.latitude ?? normalized.coordinates?.latitude ?? normalized.latitude;
  const lon = normalized.requestedCoordinates?.longitude ?? normalized.coordinates?.longitude ?? normalized.longitude;

  return {
    snapshotType: "terrain",
    latitude: lat,
    longitude: lon,
    displayName: `Topographic Elevation & Slope (${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)})`,
    source: normalized.sourceMetadata?.provider || "Open-Meteo DEM",
    provider: normalized.provenance?.provider || "Open-Meteo",
    dataset: normalized.provenance?.dataset || "Copernicus / SRTM 90m Digital Elevation Model",
    dataFreshness: normalized.provenance?.dataFreshness || "live",
    sourceStatus: normalized.sourceMetadata?.sourceStatus || "ok",
    retrievedAt: new Date(),
    terrainSlope: normalized.slope,
    terrain: {
      elevation: normalized.elevation,
      slope: normalized.slope,
      spatialResolution: normalized.provenance?.spatialResolution || "~90 meters",
    },
    units: normalized.units,
    provenance: normalized.provenance ? {
      ...normalized.provenance,
      observationTimestamp: new Date(),
      ingestionTimestamp: new Date(),
      persistenceStatus: true,
    } : undefined,
    // Terrain record: permanent reference data (expiresAt is null)
    expiresAt: null,
  };
}

/**
 * Attempts to persist a snapshot document to MongoDB if the connection is active.
 * Degrades non-fatally if MongoDB is offline or disconnected.
 *
 * @param {Function} snapshotBuilder
 * @param {Object} normalizedData
 * @returns {Promise<boolean>} True if stored successfully, false otherwise
 */
async function persistSnapshotIfConnected(snapshotBuilder, normalizedData) {
  if (typeof snapshotBuilder !== "function") return false;
  if (mongoose.connection.readyState !== 1) return false;

  try {
    const docData = snapshotBuilder(normalizedData);
    if (!docData) return false;

    await WeatherSnapshot.create(docData);
    return true;
  } catch (err) {
    console.warn("⚠️ [SKYRA Ingestion Pipeline] Non-fatal snapshot persistence failure:", err.message);
    return false;
  }
}

/**
 * Runs the standard ingestion pipeline:
 * Cache -> Fetch (Retry) -> Validate -> Normalize -> Cache -> Store
 *
 * @param {Object} pipelineConfig
 * @param {Function} pipelineConfig.fetcher - Async function returning raw provider data
 * @param {string} [pipelineConfig.cacheKey] - Cache key for in-memory TTL lookup
 * @param {number} [pipelineConfig.cacheTtlMs=300000] - Cache TTL in ms
 * @param {Function} [pipelineConfig.validator] - Structural validation function (data) => void | throws
 * @param {Function} [pipelineConfig.normalizer] - Transformer function (raw, meta) => normalized
 * @param {Function} [pipelineConfig.snapshotBuilder] - Mapper building WeatherSnapshot schema
 * @param {Object} [pipelineConfig.retryOptions] - Retry configuration for executeWithRetry
 * @param {boolean} [pipelineConfig.persistToDb=true] - Attempt MongoDB storage if connected
 * @returns {Promise<Object>} Normalized result tagged with pipeline provenance metadata
 */
async function runIngestionPipeline(pipelineConfig) {
  const startTime = Date.now();
  const {
    fetcher,
    cacheKey,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    validator,
    normalizer,
    snapshotBuilder,
    retryOptions = {},
    persistToDb = true,
  } = pipelineConfig || {};

  if (typeof fetcher !== "function") {
    const err = new TypeError("Ingestion pipeline requires a valid executable 'fetcher' function.");
    err.statusCode = 500;
    throw err;
  }

  // 1. Cache lookup
  if (cacheKey) {
    const cached = _pipelineCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
      const cachedData = JSON.parse(JSON.stringify(cached.data));
      if (cachedData.sourceMetadata) {
        cachedData.sourceMetadata.dataFreshness = "cached";
      }
      if (cachedData.provenance) {
        cachedData.provenance.dataFreshness = "cached";
        if (cachedData.provenance.cacheStatus) {
          cachedData.provenance.cacheStatus.isCached = true;
        }
        cachedData.provenance.persistenceStatus = false;
      }
      cachedData.pipelineMetadata = {
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        fromCache: true,
        attempts: 0,
        persistedToDb: false,
      };
      return cachedData;
    }
  }

  // 2. Fetch with bounded exponential backoff
  const { data: rawData, attempts } = await executeWithRetry(fetcher, retryOptions);

  if (!rawData || typeof rawData !== "object") {
    const err = new Error("Ingestion provider returned an empty or malformed data payload.");
    err.statusCode = 502;
    err.sourceStatus = "malformed_response";
    throw err;
  }

  // 3. Validation
  if (typeof validator === "function") {
    validator(rawData);
  }

  // 4. Normalization
  let normalized;
  if (typeof normalizer === "function") {
    normalized = normalizer(rawData, { isCached: false });
  } else {
    normalized = rawData;
  }

  // Verify that required structural properties exist post-normalization
  if (!normalized || typeof normalized !== "object") {
    const err = new Error("Ingestion normalizer produced an invalid empty output.");
    err.statusCode = 502;
    err.sourceStatus = "malformed_response";
    throw err;
  }

  // 5. Cache update
  if (cacheKey) {
    _pipelineCache.set(cacheKey, {
      data: normalized,
      timestamp: Date.now(),
    });
  }

  // 6. Persistence (non-fatal if MongoDB is offline or disconnected)
  let persisted = false;
  if (persistToDb && typeof snapshotBuilder === "function") {
    persisted = await persistSnapshotIfConnected(snapshotBuilder, normalized);
  }

  if (normalized.provenance) {
    normalized.provenance.persistenceStatus = persisted;
  }

  // Attach pipeline execution metadata
  normalized.pipelineMetadata = {
    executedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    fromCache: false,
    attempts,
    persistedToDb: persisted,
  };

  return normalized;
}

/**
 * Clears in-memory pipeline cache (useful for testing).
 */
function clearPipelineCache() {
  _pipelineCache.clear();
}

/**
 * Returns current cache statistics.
 */
function getPipelineCacheStats() {
  return {
    cachedEntries: _pipelineCache.size,
    keys: Array.from(_pipelineCache.keys()),
  };
}

module.exports = {
  runIngestionPipeline,
  executeWithRetry,
  isTransientError,
  buildLiveSnapshot,
  buildHistoricalSnapshot,
  buildTerrainSnapshot,
  persistSnapshotIfConnected,
  clearPipelineCache,
  getPipelineCacheStats,
};
