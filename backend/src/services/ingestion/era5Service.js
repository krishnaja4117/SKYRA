/**
 * SKYRA – Server-Side ERA5 Historical Ingestion Service (Phase 3 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Retrieves, validates, normalizes, chunks, and caches authoritative historical
 * climate data from the Open-Meteo ERA5 Reanalysis Archive.
 *
 * Guarantees:
 *   • Queries verified Open-Meteo ERA5 Archive: https://archive-api.open-meteo.com/v1/archive
 *   • Strict coordinate and ISO date-range validation (zero silent location fallback)
 *   • Automatic date-range chunking (MAX_HISTORICAL_CHUNK_YEARS = 2) for long-term queries
 *   • Small-range optimization: single upstream request when within chunk size
 *   • Gapless, non-overlapping date boundaries with exact startDate/endDate preservation
 *   • Chronological merging with duplicate date deduplication & conflict detection
 *   • Partial failure handling: fails fast with complete diagnostics, never partial data
 *   • Reuses existing pipelineRunner for bounded retry, caching, and persistence
 *   • Preserves truthful provenance with chunking metadata and grid coordinates
 */

const { validateCoordinates } = require("../weatherService");
const {
  runIngestionPipeline,
  buildHistoricalSnapshot,
  persistSnapshotIfConnected,
  clearPipelineCache,
} = require("./pipelineRunner");

const ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24-hour cache for immutable historical records
const MAX_HISTORICAL_CHUNK_YEARS = 2; // Configurable 2-year chunk window

/**
 * Adds or subtracts days to an ISO YYYY-MM-DD string in UTC.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} days - Number of days to add (or subtract if negative)
 * @returns {string} New YYYY-MM-DD string
 */
function addDaysUtc(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Adds years to an ISO YYYY-MM-DD string in UTC.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} years - Number of years to add
 * @returns {string} New YYYY-MM-DD string
 */
function addYearsUtc(dateStr, years) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Validates and normalizes ISO date format (YYYY-MM-DD).
 *
 * @param {string|Date} dateVal
 * @param {string} paramName
 * @returns {string} Formatted YYYY-MM-DD string
 * @throws {Error} If missing, malformed, or invalid calendar date
 */
function validateIsoDate(dateVal, paramName) {
  if (dateVal === undefined || dateVal === null || dateVal === "") {
    const err = new Error(`Missing required date parameter: '${paramName}'`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_date_format";
    err.code = "ERR_MISSING_DATE";
    throw err;
  }

  if (typeof dateVal !== "string" && !(dateVal instanceof Date)) {
    const err = new Error(`Date parameter '${paramName}' must be a string or Date object.`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_date_format";
    err.code = "ERR_INVALID_DATE_TYPE";
    throw err;
  }

  const str = dateVal instanceof Date ? dateVal.toISOString().slice(0, 10) : String(dateVal).trim();

  // Strict YYYY-MM-DD format validation
  const isoRegex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
  if (!isoRegex.test(str)) {
    const err = new Error(`Date parameter '${paramName}' must be a valid ISO format (YYYY-MM-DD). Received: '${dateVal}'`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_date_format";
    err.code = "ERR_INVALID_DATE_FORMAT";
    throw err;
  }

  const parsed = new Date(`${str}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== str) {
    const err = new Error(`Date parameter '${paramName}' is an invalid calendar date: '${dateVal}'`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_calendar_date";
    err.code = "ERR_INVALID_CALENDAR_DATE";
    throw err;
  }

  return str;
}

/**
 * Validates start and end dates ensuring startDate <= endDate and within reasonable bounds.
 *
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @returns {{ startDate: string, endDate: string }}
 * @throws {Error} If dates are invalid, out of range, or startDate is after endDate
 */
function validateDateRange(startDate, endDate) {
  const start = validateIsoDate(startDate, "startDate");
  const end = validateIsoDate(endDate, "endDate");

  if (start > end) {
    const err = new Error(`startDate ('${start}') cannot be after endDate ('${end}').`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_date_range";
    err.code = "ERR_INVALID_DATE_RANGE";
    throw err;
  }

  if (start < "1940-01-01") {
    const err = new Error(`startDate ('${start}') cannot precede ERA5 historical archive availability (1940-01-01).`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_date_range";
    err.code = "ERR_DATE_OUT_OF_BOUNDS";
    throw err;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (end > today) {
    const err = new Error(`Historical endDate ('${end}') cannot be in the future.`);
    err.statusCode = 400;
    err.sourceStatus = "invalid_date_range";
    err.code = "ERR_FUTURE_DATE";
    throw err;
  }

  return { startDate: start, endDate: end };
}

/**
 * Splits an arbitrary valid date range into consecutive, gapless, non-overlapping chunks.
 *
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {number} [maxYears=MAX_HISTORICAL_CHUNK_YEARS] - Maximum years per chunk
 * @returns {Array<{ startDate: string, endDate: string }>}
 */
function splitDateRangeIntoChunks(startDate, endDate, maxYears = MAX_HISTORICAL_CHUNK_YEARS) {
  const chunks = [];
  let currentStart = startDate;

  while (true) {
    const candidateEnd = addDaysUtc(addYearsUtc(currentStart, maxYears), -1);
    if (candidateEnd >= endDate) {
      chunks.push({ startDate: currentStart, endDate });
      break;
    } else {
      chunks.push({ startDate: currentStart, endDate: candidateEnd });
      currentStart = addDaysUtc(candidateEnd, 1);
    }
  }

  return chunks;
}

/**
 * Generates a unique, collision-resistant cache key for historical queries.
 */
function getCacheKey(lat, lon, startDate, endDate) {
  return `historical:${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}:${startDate}:${endDate}`;
}

/**
 * Validates raw ERA5 Archive API response structure and numerical integrity.
 *
 * @param {Object} data - Raw API payload
 * @throws {Error} If response is empty, malformed, or missing required arrays
 */
function validateEra5Response(data) {
  if (!data || typeof data !== "object") {
    const error = new Error("ERA5 Archive API returned an empty or malformed data payload.");
    error.statusCode = 502;
    error.sourceStatus = "malformed_response";
    throw error;
  }

  if (data.error === true || data.reason) {
    const error = new Error(`ERA5 Archive API error: ${data.reason || "Unknown upstream error"}`);
    error.statusCode = 502;
    error.sourceStatus = "upstream_error";
    throw error;
  }

  const daily = data.daily;
  if (!daily || typeof daily !== "object" || !Array.isArray(daily.time) || daily.time.length === 0) {
    const error = new Error("ERA5 Archive API response is missing daily timeseries array.");
    error.statusCode = 502;
    error.sourceStatus = "malformed_response";
    throw error;
  }

  // Validate dates in time array
  for (const timeStr of daily.time) {
    if (typeof timeStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(timeStr)) {
      const error = new Error(`ERA5 Archive API returned invalid timestamp format: '${timeStr}'`);
      error.statusCode = 502;
      error.sourceStatus = "malformed_response";
      throw error;
    }
  }

  // Validate numeric ranges for available variables
  if (Array.isArray(daily.temperature_2m_max)) {
    for (const val of daily.temperature_2m_max) {
      if (val != null && (!Number.isFinite(Number(val)) || Number(val) < -100 || Number(val) > 100)) {
        const error = new Error(`ERA5 temperature value ${val} is non-numeric or out of physical range [-100, 100].`);
        error.statusCode = 502;
        error.sourceStatus = "malformed_response";
        throw error;
      }
    }
  }

  if (Array.isArray(daily.precipitation_sum)) {
    for (const val of daily.precipitation_sum) {
      if (val != null && (!Number.isFinite(Number(val)) || Number(val) < 0 || Number(val) > 2000)) {
        const error = new Error(`ERA5 precipitation value ${val} is non-numeric or out of physical range [0, 2000].`);
        error.statusCode = 502;
        error.sourceStatus = "malformed_response";
        throw error;
      }
    }
  }

  if (Array.isArray(daily.wind_speed_10m_max)) {
    for (const val of daily.wind_speed_10m_max) {
      if (val != null && (!Number.isFinite(Number(val)) || Number(val) < 0 || Number(val) > 500)) {
        const error = new Error(`ERA5 wind speed value ${val} is non-numeric or out of physical range [0, 500].`);
        error.statusCode = 502;
        error.sourceStatus = "malformed_response";
        throw error;
      }
    }
  }
}

/**
 * Normalizes raw ERA5 archive response into canonical SKYRA historical structure.
 *
 * @param {Object} raw - Raw API response
 * @param {Object} meta - Query metadata
 * @returns {Object} Canonical historical weather result
 */
function normalizeEra5Data(raw, { latitude, longitude, startDate, endDate, isCached = false, cacheKey = null }) {
  const nowIso = new Date().toISOString();
  const daily = raw?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];

  const dailyRecords = [];
  for (let i = 0; i < times.length; i++) {
    const date = times[i];
    const precipitation = daily.precipitation_sum?.[i] != null ? Number(daily.precipitation_sum[i]) : 0;
    const tempMax = daily.temperature_2m_max?.[i] != null ? Number(daily.temperature_2m_max[i]) : null;
    const tempMin = daily.temperature_2m_min?.[i] != null ? Number(daily.temperature_2m_min[i]) : null;
    const tempAvg = daily.temperature_2m_mean?.[i] != null
      ? Number(daily.temperature_2m_mean[i])
      : ((tempMax != null && tempMin != null) ? Math.round(((tempMax + tempMin) / 2) * 10) / 10 : null);

    const apparentTempMax = daily.apparent_temperature_max?.[i] != null ? Number(daily.apparent_temperature_max[i]) : null;
    const apparentTempMin = daily.apparent_temperature_min?.[i] != null ? Number(daily.apparent_temperature_min[i]) : null;
    const apparentTempMean = daily.apparent_temperature_mean?.[i] != null ? Number(daily.apparent_temperature_mean[i]) : null;

    const windSpeedMax = daily.wind_speed_10m_max?.[i] != null ? Number(daily.wind_speed_10m_max[i]) : 0;
    const windDirectionDominant = daily.wind_direction_10m_dominant?.[i] != null ? Number(daily.wind_direction_10m_dominant[i]) : null;
    const relativeHumidityMean = daily.relative_humidity_2m_mean?.[i] != null ? Number(daily.relative_humidity_2m_mean[i]) : null;
    const surfacePressureMean = daily.surface_pressure_mean?.[i] != null ? Number(daily.surface_pressure_mean[i]) : null;

    dailyRecords.push({
      date,
      precipitation,
      tempMax,
      tempMin,
      tempAvg,
      apparentTempMax,
      apparentTempMin,
      apparentTempMean,
      windSpeedMax,
      windDirectionDominant,
      relativeHumidityMean,
      surfacePressureMean,
    });
  }

  const requestedCoordinates = {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
  const actualSourceCoordinates = {
    latitude: raw.latitude != null ? Number(raw.latitude) : Number(latitude),
    longitude: raw.longitude != null ? Number(raw.longitude) : Number(longitude),
  };

  const canonicalUnits = {
    temperature: "°C",
    precipitation: "mm",
    windSpeed: "km/h",
    pressure: "hPa",
    humidity: "%",
  };

  const provenance = {
    provider: "Open-Meteo",
    sourceModel: "ERA5 Reanalysis Archive",
    endpoint: ARCHIVE_ENDPOINT,
    observationTimestamp: endDate,
    ingestionTimestamp: nowIso,
    dataFreshness: isCached ? "cached" : "historical",
    requestedCoordinates,
    actualSourceCoordinates,
    cacheStatus: {
      isCached: Boolean(isCached),
      cacheKey: cacheKey || getCacheKey(latitude, longitude, startDate, endDate),
    },
    persistenceStatus: false,
    chunking: {
      chunked: false,
      chunkCount: 1,
      successfulChunks: 1,
      failedChunks: 0,
    },
  };

  return {
    source: "Open-Meteo ERA5 Reanalysis Archive",
    requestedCoordinates,
    actualSourceCoordinates,
    coordinates: requestedCoordinates, // Backward-compatibility
    requestedRange: {
      startDate,
      endDate,
    },
    recordCount: dailyRecords.length,
    dailyRecords,
    units: canonicalUnits,
    provenance,
    retrievalTimestamp: nowIso,
    sourceMetadata: {
      provider: "Open-Meteo",
      dataset: "ERA5 Reanalysis Archive",
      endpoint: ARCHIVE_ENDPOINT,
      sourceStatus: "ok",
      dataFreshness: isCached ? "cached" : "historical",
      timestamp: nowIso,
    },
    providerSpecific: {
      timezone: raw.timezone || "auto",
      elevation: raw.elevation,
      generationTimeMs: raw.generationtime_ms,
      dailyUnits: raw.daily_units || {},
    },
  };
}

/**
 * Fetches a single chunk of historical data through the existing pipeline runner.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} startDate
 * @param {string} endDate
 * @param {Object} [options]
 * @returns {Promise<Object>} Normalized historical chunk
 */
async function fetchSingleHistoricalChunk(latitude, longitude, startDate, endDate, options = {}) {
  const cacheKey = getCacheKey(latitude, longitude, startDate, endDate);
  const fetcherOverride = options.fetcherOverride;

  const fetcher = fetcherOverride
    ? async () => fetcherOverride(latitude, longitude, startDate, endDate)
    : async () => {
        const url =
          `${ARCHIVE_ENDPOINT}` +
          `?latitude=${latitude}` +
          `&longitude=${longitude}` +
          `&start_date=${startDate}` +
          `&end_date=${endDate}` +
          `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,apparent_temperature_min,apparent_temperature_mean,wind_speed_10m_max,wind_direction_10m_dominant,relative_humidity_2m_mean,surface_pressure_mean` +
          `&timezone=auto`;

        let response;
        try {
          response = await fetch(url, {
            signal: AbortSignal.timeout(10000), // 10-second fail-fast timeout
          });
        } catch (err) {
          const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
          const errorMsg = isTimeout
            ? "ERA5 Archive upstream API request timed out after 10 seconds."
            : `ERA5 Archive upstream network failure: ${err.message}`;
          const error = new Error(errorMsg);
          error.statusCode = isTimeout ? 504 : 502;
          error.sourceStatus = isTimeout ? "timeout" : "network_failure";
          throw error;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          const error = new Error(`ERA5 Archive API returned HTTP ${response.status}: ${errorText || response.statusText}`);
          error.statusCode = response.status === 429 ? 429 : (response.status >= 400 && response.status < 500 ? response.status : 502);
          error.sourceStatus = response.status >= 400 && response.status < 500 ? "client_error" : "upstream_error";
          throw error;
        }

        let data;
        try {
          data = await response.json();
        } catch (err) {
          const error = new Error(`Failed to parse ERA5 Archive response as JSON: ${err.message}`);
          error.statusCode = 502;
          error.sourceStatus = "malformed_response";
          throw error;
        }

        return data;
      };

  const validator = (data) => {
    validateEra5Response(data);
  };

  const normalizer = (data, normMeta) => {
    return normalizeEra5Data(data, {
      latitude,
      longitude,
      startDate,
      endDate,
      isCached: normMeta?.isCached ?? false,
      cacheKey,
    });
  };

  return await runIngestionPipeline({
    fetcher,
    cacheKey,
    cacheTtlMs: CACHE_TTL_MS,
    validator,
    normalizer,
    snapshotBuilder: buildHistoricalSnapshot,
    persistToDb: false, // We persist the combined/unified dataset once all chunks succeed
  });
}

/**
 * Checks whether two records for the same date contain conflicting meteorological values.
 *
 * @param {Object} rec1
 * @param {Object} rec2
 * @returns {boolean} True if a conflict is detected
 */
function checkRecordConflict(rec1, rec2) {
  const fields = [
    "precipitation",
    "tempMax",
    "tempMin",
    "tempAvg",
    "windSpeedMax",
    "relativeHumidityMean",
    "surfacePressureMean",
  ];

  for (const f of fields) {
    if (rec1[f] != null && rec2[f] != null && Math.abs(rec1[f] - rec2[f]) > 0.05) {
      return true;
    }
  }

  return false;
}

/**
 * Merges, sorts, deduplicates, and validates daily records across multiple chunk results.
 *
 * @param {Array<Object>} chunkResults - Array of normalized chunk results
 * @param {{ startDate: string, endDate: string }} requestedRange
 * @returns {Array<Object>} Merged, contiguous, chronologically sorted daily records
 * @throws {Error} If data conflicts, gaps, or sequence mismatches are detected
 */
function mergeHistoricalChunks(chunkResults, requestedRange) {
  const dateMap = new Map();

  for (const chunk of chunkResults) {
    const records = Array.isArray(chunk.dailyRecords) ? chunk.dailyRecords : [];
    for (const rec of records) {
      if (!rec || !rec.date) continue;

      if (dateMap.has(rec.date)) {
        const existing = dateMap.get(rec.date);
        if (checkRecordConflict(existing, rec)) {
          const err = new Error(`Historical data conflict detected on date '${rec.date}': conflicting values between chunks.`);
          err.statusCode = 502;
          err.sourceStatus = "data_conflict";
          throw err;
        }
      } else {
        dateMap.set(rec.date, rec);
      }
    }
  }

  const merged = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length === 0) {
    const err = new Error(`Historical merging produced empty record set for range ${requestedRange.startDate} to ${requestedRange.endDate}`);
    err.statusCode = 502;
    err.sourceStatus = "malformed_response";
    throw err;
  }

  // Verify first and last date boundary exact match
  if (merged[0].date !== requestedRange.startDate) {
    const err = new Error(`Merged records start date '${merged[0].date}' does not match requested startDate '${requestedRange.startDate}'.`);
    err.statusCode = 502;
    err.sourceStatus = "sequence_gap";
    throw err;
  }

  if (merged[merged.length - 1].date !== requestedRange.endDate) {
    const err = new Error(`Merged records end date '${merged[merged.length - 1].date}' does not match requested endDate '${requestedRange.endDate}'.`);
    err.statusCode = 502;
    err.sourceStatus = "sequence_gap";
    throw err;
  }

  // Verify contiguous date sequence (no missing dates)
  for (let i = 1; i < merged.length; i++) {
    const expectedDate = addDaysUtc(merged[i - 1].date, 1);
    if (merged[i].date !== expectedDate) {
      const err = new Error(`Missing date in historical record sequence: expected '${expectedDate}', found '${merged[i].date}'.`);
      err.statusCode = 502;
      err.sourceStatus = "sequence_gap";
      throw err;
    }
  }

  return merged;
}

/**
 * Fetches, validates, chunks, normalizes, and merges historical climate data from Open-Meteo ERA5.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {string|Date} startDate - Format YYYY-MM-DD
 * @param {string|Date} endDate - Format YYYY-MM-DD
 * @param {Object} [options]
 * @param {number} [options.maxChunkYears=MAX_HISTORICAL_CHUNK_YEARS]
 * @param {Function} [options.fetcherOverride] - Test hook to simulate upstream API
 * @param {boolean} [options.persistToDb=true]
 * @returns {Promise<Object>} Unified canonical historical dataset
 */
async function fetchHistoricalWeather(latitude, longitude, startDate, endDate, options = {}) {
  const startTime = Date.now();
  const maxYears = options.maxChunkYears ?? MAX_HISTORICAL_CHUNK_YEARS;
  const persistToDb = options.persistToDb ?? true;

  // 1. Strict validation (coordinates and dates) — throws 400 if invalid
  const coords = validateCoordinates(latitude, longitude);
  const dates = validateDateRange(startDate, endDate);

  const fullCacheKey = getCacheKey(coords.latitude, coords.longitude, dates.startDate, dates.endDate);

  // 2. Split date range into consecutive, gapless chunks
  const chunks = splitDateRangeIntoChunks(dates.startDate, dates.endDate, maxYears);

  // Optimization: If small request (single chunk), fetch directly through pipeline
  if (chunks.length === 1) {
    const singleResult = await fetchSingleHistoricalChunk(
      coords.latitude,
      coords.longitude,
      dates.startDate,
      dates.endDate,
      options
    );

    // Persist single unified snapshot
    let persisted = false;
    if (persistToDb) {
      persisted = await persistSnapshotIfConnected(buildHistoricalSnapshot, singleResult);
    }
    singleResult.provenance.persistenceStatus = persisted;
    singleResult.pipelineMetadata.persistedToDb = persisted;
    singleResult.provenance.chunking = {
      chunked: false,
      chunkCount: 1,
      successfulChunks: 1,
      failedChunks: 0,
      chunkSizeYears: maxYears,
      chunkRanges: chunks,
    };

    return singleResult;
  }

  // Multi-chunk request: Process chunks sequentially with bounded execution
  const completedChunks = [];
  const chunkResults = [];
  let totalAttempts = 0;
  let allFromCache = true;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const chunkResult = await fetchSingleHistoricalChunk(
        coords.latitude,
        coords.longitude,
        chunk.startDate,
        chunk.endDate,
        options
      );

      totalAttempts += chunkResult.pipelineMetadata?.attempts || 1;
      if (!chunkResult.pipelineMetadata?.fromCache) {
        allFromCache = false;
      }

      completedChunks.push({
        startDate: chunk.startDate,
        endDate: chunk.endDate,
        recordCount: chunkResult.recordCount,
      });

      chunkResults.push(chunkResult);
    } catch (chunkErr) {
      // Partial failure handling: fail fast without silently returning incomplete data
      const err = new Error(
        `Historical data ingestion failed for range ${dates.startDate} to ${dates.endDate}: chunk ${chunk.startDate} to ${chunk.endDate} failed (${chunkErr.message})`
      );
      err.statusCode = chunkErr.statusCode || 502;
      err.sourceStatus = chunkErr.sourceStatus || "upstream_error";
      err.details = {
        requestedRange: dates,
        completedChunks,
        failedChunk: {
          startDate: chunk.startDate,
          endDate: chunk.endDate,
          error: chunkErr.message,
          statusCode: chunkErr.statusCode || 502,
          sourceStatus: chunkErr.sourceStatus || "upstream_error",
        },
        chunkIndex: i,
        chunkCount: chunks.length,
        successfulChunks: completedChunks.length,
      };
      throw err;
    }
  }

  // 3. Merge, sort, deduplicate, and validate contiguous sequence
  const mergedRecords = mergeHistoricalChunks(chunkResults, dates);

  const firstChunk = chunkResults[0];
  const nowIso = new Date().toISOString();

  // 4. Assemble unified canonical result
  const unifiedResult = {
    source: "Open-Meteo ERA5 Reanalysis Archive",
    requestedCoordinates: {
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
    actualSourceCoordinates: firstChunk.actualSourceCoordinates,
    coordinates: {
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
    requestedRange: {
      startDate: dates.startDate,
      endDate: dates.endDate,
    },
    recordCount: mergedRecords.length,
    dailyRecords: mergedRecords,
    units: firstChunk.units,
    provenance: {
      provider: "Open-Meteo",
      sourceModel: "ERA5 Reanalysis Archive",
      endpoint: ARCHIVE_ENDPOINT,
      observationTimestamp: dates.endDate,
      ingestionTimestamp: nowIso,
      dataFreshness: allFromCache ? "cached" : "historical",
      requestedCoordinates: {
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      actualSourceCoordinates: firstChunk.actualSourceCoordinates,
      cacheStatus: {
        isCached: allFromCache,
        cacheKey: fullCacheKey,
      },
      persistenceStatus: false,
      chunking: {
        chunked: true,
        chunkCount: chunks.length,
        successfulChunks: chunks.length,
        failedChunks: 0,
        chunkSizeYears: maxYears,
        chunkRanges: chunks,
      },
    },
    retrievalTimestamp: nowIso,
    sourceMetadata: {
      provider: "Open-Meteo",
      dataset: "ERA5 Reanalysis Archive",
      endpoint: ARCHIVE_ENDPOINT,
      sourceStatus: "ok",
      dataFreshness: allFromCache ? "cached" : "historical",
      timestamp: nowIso,
    },
    providerSpecific: firstChunk.providerSpecific || {},
    pipelineMetadata: {
      executedAt: nowIso,
      durationMs: Date.now() - startTime,
      fromCache: allFromCache,
      attempts: totalAttempts,
      persistedToDb: false,
    },
  };

  // 5. Non-fatally attempt MongoDB persistence for unified multi-year snapshot
  let persisted = false;
  if (persistToDb) {
    persisted = await persistSnapshotIfConnected(buildHistoricalSnapshot, unifiedResult);
  }
  unifiedResult.provenance.persistenceStatus = persisted;
  unifiedResult.pipelineMetadata.persistedToDb = persisted;

  return unifiedResult;
}

/**
 * Clears in-memory pipeline cache (useful for testing).
 */
function clearEra5Cache() {
  clearPipelineCache();
}

module.exports = {
  fetchHistoricalWeather,
  fetchSingleHistoricalChunk,
  splitDateRangeIntoChunks,
  mergeHistoricalChunks,
  validateCoordinates,
  validateIsoDate,
  validateDateRange,
  validateEra5Response,
  normalizeEra5Data,
  getCacheKey,
  clearEra5Cache,
  MAX_HISTORICAL_CHUNK_YEARS,
  ARCHIVE_ENDPOINT,
};
