/**
 * SKYRA – Historical Data Service
 * ────────────────────────────────────────────────────────────────────────────
 * Fetches real historical weather data from Open-Meteo ERA5 archive API
 * based on actual location coordinates.
 *
 * Replaces hardcoded Bhubaneswar dataset with dynamic multi-location support.
 * Caches results to minimize API calls.
 *
 * Used by: historicalIntelligence.js (Online Mode)
 * Not used: Demo Mode (uses pre-computed scenarios offline)
 */

// ─── Cache Management ──────────────────────────────────────────────────────
// Key: "lat,lon", Value: { records: [...], timestamp: ms }
const _cache = {};

// Cache for 24 hours before re-fetching
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Historical date range: past 12 years
const HISTORICAL_START = "2012-01-01";
const HISTORICAL_END = "2023-12-31";

// Open-Meteo Archive API endpoint
const ARCHIVE_API = "https://api.open-meteo.com/v1/archive";

/**
 * getCacheKey
 * Generates a cache key from latitude/longitude.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {string} "lat,lon" (e.g. "20.2961,85.8245")
 */
function getCacheKey(lat, lon) {
  return `${lat},${lon}`;
}

/**
 * isCacheFresh
 * Checks if cached data for a location is still valid.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isCacheFresh(key) {
  const cached = _cache[key];
  if (!cached) return false;
  const age = Date.now() - cached.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * inferHazardType
 * Infers hazard type from raw weather values.
 *
 * @param {number} rainfall – mm (daily total)
 * @param {number} wind – km/h (max daily)
 * @param {number} temperature – °C (average)
 * @returns {string} e.g. "Urban Flooding", "Cyclone", "None"
 */
function inferHazardType(rainfall, wind, temperature) {
  if (wind >= 95) return "Cyclone";
  if (rainfall >= 50) return "Urban Flooding";
  if (rainfall >= 10) return "Waterlogging";
  if (temperature >= 42) return "Heat Stress";
  return "Monitoring";
}

/**
 * inferSeverity
 * Infers severity level from raw weather values.
 *
 * @param {number} rainfall – mm
 * @param {number} wind – km/h
 * @param {number} temperature – °C
 * @returns {string} "Low" | "Moderate" | "High" | "Severe"
 */
function inferSeverity(rainfall, wind, temperature) {
  let score = 0;
  if (rainfall >= 50) score += 3;  // Heavy rain
  if (rainfall >= 10) score += 1;  // Moderate rain
  if (wind >= 95) score += 3;      // Cyclonic wind
  if (wind >= 50) score += 1;      // Strong wind
  if (temperature >= 42) score += 1; // Extreme heat

  if (score >= 5) return "Severe";
  if (score >= 3) return "High";
  if (score >= 1) return "Moderate";
  return "Low";
}

/**
 * transformApiResponse
 * Converts Open-Meteo archive API response to SKYRA historical record schema.
 *
 * @param {Object} apiData – Response from Open-Meteo /v1/archive
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} locationName – Display name (optional, for labeling)
 * @returns {Array} Array of record objects matching BHUBANESWAR_HISTORICAL_RECORDS schema
 */
function transformApiResponse(apiData, latitude, longitude, locationName = null) {
  const records = [];

  if (!apiData.daily || !apiData.daily.time) {
    console.warn("[SKYRA] Archive API response missing daily data");
    return records;
  }

  const times = apiData.daily.time;
  const precipitation = apiData.daily.precipitation_sum || [];
  const tempMax = apiData.daily.temperature_2m_max || [];
  const tempMin = apiData.daily.temperature_2m_min || [];
  const windMax = apiData.daily.wind_speed_10m_max || [];
  const humidity = apiData.daily.relative_humidity_2m || [];

  for (let i = 0; i < times.length; i++) {
    const dateStr = times[i];
    const date = new Date(dateStr);
    const month = date.getMonth() + 1; // 1–12

    // Extract values, use fallbacks if missing
    const rainfall = precipitation[i] ?? 0;
    const temperatureAvg = ((tempMax[i] ?? 30) + (tempMin[i] ?? 20)) / 2;
    const wind = windMax[i] ?? 0;
    const humidityVal = humidity[i] ?? 68;

    // Infer hazard and severity from weather
    const hazardType = inferHazardType(rainfall, wind, temperatureAvg);
    const severity = inferSeverity(rainfall, wind, temperatureAvg);

    const record = {
      id: `HIST-${dateStr}`,
      date: dateStr,
      month,
      location: locationName || `Historical Data (${latitude}°, ${longitude}°)`,
      rainfall: Math.round(rainfall * 10) / 10, // Round to 1 decimal
      humidity: Math.round(humidityVal),
      temperature: Math.round(temperatureAvg * 10) / 10,
      wind: Math.round(wind * 10) / 10,
      hazardType,
      impactType: hazardType !== "Monitoring" ? hazardType : "Normal Conditions",
      severity,
      notes: `Open-Meteo ERA5 historical data (${dateStr})`,
    };

    records.push(record);
  }

  return records;
}

/**
 * fetchHistoricalData
 * Fetches historical weather data from Open-Meteo archive API for a location.
 * Returns cached data if available and fresh.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} locationName – Optional display name
 * @returns {Promise<Array>} Array of historical records
 *
 * Throws: Error if API request fails after retries
 */
export async function fetchHistoricalData(latitude, longitude, locationName = null) {
  const key = getCacheKey(latitude, longitude);

  // Return cached if fresh
  if (isCacheFresh(key)) {
    console.log(`[SKYRA] Returning cached historical data for ${key}`);
    return _cache[key].records;
  }

  console.log(`[SKYRA] Fetching historical data from Open-Meteo for ${key}...`);

  try {
    const url =
      `${ARCHIVE_API}` +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&start_date=${HISTORICAL_START}` +
      `&end_date=${HISTORICAL_END}` +
      `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,relative_humidity_2m` +
      `&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Archive API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Transform to SKYRA schema
    const records = transformApiResponse(data, latitude, longitude, locationName);

    if (records.length === 0) {
      throw new Error("Archive API returned no data");
    }

    // Cache the results
    _cache[key] = {
      records,
      timestamp: Date.now(),
    };

    console.log(`[SKYRA] Cached ${records.length} historical records for ${key}`);

    return records;
  } catch (err) {
    console.error(`[SKYRA] Failed to fetch historical data for ${key}:`, err.message);
    throw err;
  }
}

/**
 * clearCache
 * Clears all cached historical data (useful for testing or manual refresh).
 */
export function clearCache() {
  Object.keys(_cache).forEach(key => delete _cache[key]);
  console.log("[SKYRA] Historical data cache cleared");
}

/**
 * getCacheStats
 * Returns information about cached data (for debugging).
 *
 * @returns {Object} { locations: number, oldestCache: ms, newestCache: ms }
 */
export function getCacheStats() {
  const keys = Object.keys(_cache);
  if (keys.length === 0) {
    return { locations: 0, oldestCache: null, newestCache: null };
  }

  const timestamps = keys.map(k => _cache[k].timestamp);
  return {
    locations: keys.length,
    oldestCache: Math.min(...timestamps),
    newestCache: Math.max(...timestamps),
    keys: keys.join(", "),
  };
}
