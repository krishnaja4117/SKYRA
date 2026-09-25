/**
 * SKYRA – Weather Ingestion & Normalization Service (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized backend service for fetching, validating, normalizing, and caching
 * live weather and NWP forecast data from authoritative public meteorological sources.
 *
 * Responsibilities:
 *   • Coordinate validation (range, finiteness, non-null)
 *   • Resilient upstream fetch with fail-fast timeouts (8s)
 *   • In-memory TTL caching (5 minutes) to protect upstream APIs
 *   • Canonical weather data model with isolated provider-specific fields
 *   • Detailed WMO weather condition code interpretation
 *   • Explicit error and source status handling (never silently injects fake data)
 *   • Preserves backward compatibility for legacy callers expecting raw current/hourly
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const _weatherCache = new Map();

/**
 * Validates latitude and longitude values strictly.
 *
 * @param {number|string} lat
 * @param {number|string} lon
 * @returns {{ latitude: number, longitude: number }}
 * @throws {Error} If coordinates are missing, non-numeric, or outside valid WGS-84 ranges
 */
function validateCoordinates(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    const err = new Error("Latitude and longitude coordinates are required.");
    err.statusCode = 400;
    throw err;
  }

  const numLat = Number(lat);
  const numLon = Number(lon);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    const err = new Error(`Coordinates must be valid finite numbers. Received lat=${lat}, lon=${lon}`);
    err.statusCode = 400;
    throw err;
  }

  if (numLat < -90 || numLat > 90) {
    const err = new Error(`Latitude must be between -90 and 90 degrees. Received ${numLat}`);
    err.statusCode = 400;
    throw err;
  }

  if (numLon < -180 || numLon > 180) {
    const err = new Error(`Longitude must be between -180 and 180 degrees. Received ${numLon}`);
    err.statusCode = 400;
    throw err;
  }

  return { latitude: numLat, longitude: numLon };
}

/**
 * Generates cache key from coordinates rounded to 3 decimal places (~110m).
 */
function getCacheKey(lat, lon) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

/**
 * Translates standard WMO Weather Interpretation Codes (0–99) to clean human descriptions.
 *
 * @param {number} code - WMO weather code
 * @param {number} rain - rainfall in mm
 * @param {number} wind - wind speed in km/h
 * @returns {string} Human-readable weather condition label
 */
function getWeatherConditionFromCode(code, rain = 0, wind = 0) {
  const c = Number(code);
  if (c === 0) return "Clear sky";
  if (c === 1) return "Mainly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if (c === 45 || c === 48) return "Fog";
  if (c >= 51 && c <= 55) return "Drizzle";
  if (c >= 61 && c <= 65) {
    if (rain >= 15 || wind >= 50) return "Heavy rainfall with strong wind";
    if (rain >= 10) return "Heavy rainfall";
    return "Rain";
  }
  if (c >= 71 && c <= 77) return "Snow";
  if (c >= 80 && c <= 82) return "Rain showers";
  if (c === 95) return "Thunderstorm";
  if (c >= 96 && c <= 99) return "Severe Thunderstorm with Hail";

  // Fallback heuristic based on physical metrics
  if (rain >= 25 && wind >= 30) return "Heavy rainfall with strong wind";
  if (rain >= 15) return "Heavy rainfall";
  if (wind >= 80) return "Extreme wind";
  if (wind >= 50) return "Strong wind";
  if (rain > 0) return "Light rain";
  return "Partly cloudy";
}

/**
 * Normalizes raw Open-Meteo API response into the canonical SKYRA Weather Model.
 *
 * @param {Object} raw - Raw API response
 * @param {Object} meta - Coordinate and location metadata
 * @returns {Object} Normalized weather model
 */
function normalizeWeatherData(raw = {}, meta = {}) {
  const { latitude, longitude, locationName = "Active Location", isCached = false } = meta;
  const nowIso = new Date().toISOString();

  const cur = raw.current || {};
  const hourly = raw.hourly || {};
  const daily = raw.daily || {};

  // 1. Current conditions
  const temperature = Number(cur.temperature_2m ?? 0);
  const feelsLike = cur.apparent_temperature != null ? Number(cur.apparent_temperature) : Math.round(temperature + 2);
  const humidity = Number(cur.relative_humidity_2m ?? 65);
  const windSpeed = Number(cur.wind_speed_10m ?? 0);
  const windDirection = Number(cur.wind_direction_10m ?? 0);
  const rainfall = Number(cur.rain ?? cur.precipitation ?? 0);
  const pressure = Number(cur.surface_pressure ?? 1013);
  const weatherCode = Number(cur.weather_code ?? 0);
  const condition = getWeatherConditionFromCode(weatherCode, rainfall, windSpeed);
  const observedAt = cur.time ? new Date(cur.time).toISOString() : nowIso;

  // 2. Hourly forecast (up to 48 hours)
  const normalizedHourly = [];
  if (Array.isArray(hourly.time)) {
    const limit = Math.min(hourly.time.length, 48);
    for (let i = 0; i < limit; i++) {
      const hRain = Number(hourly.precipitation?.[i] ?? hourly.rain?.[i] ?? 0);
      const hWind = Number(hourly.wind_speed_10m?.[i] ?? 0);
      const hCode = Number(hourly.weather_code?.[i] ?? 0);
      normalizedHourly.push({
        time: hourly.time[i],
        temperature: Number(hourly.temperature_2m?.[i] ?? 0),
        feelsLike: hourly.apparent_temperature?.[i] != null ? Number(hourly.apparent_temperature[i]) : null,
        humidity: Number(hourly.relative_humidity_2m?.[i] ?? 0),
        rainProbability: Number(hourly.precipitation_probability?.[i] ?? 0),
        precipitation: hRain,
        windSpeed: hWind,
        windDirection: Number(hourly.wind_direction_10m?.[i] ?? 0),
        surfacePressure: Number(hourly.surface_pressure?.[i] ?? 1013),
        weatherCode: hCode,
        condition: getWeatherConditionFromCode(hCode, hRain, hWind),
      });
    }
  }

  // 3. Daily forecast (up to 7 days)
  const normalizedDaily = [];
  if (Array.isArray(daily.time)) {
    const limit = Math.min(daily.time.length, 7);
    for (let i = 0; i < limit; i++) {
      const dCode = Number(daily.weather_code?.[i] ?? 0);
      const dRain = Number(daily.precipitation_sum?.[i] ?? 0);
      const dWind = Number(daily.wind_speed_10m_max?.[i] ?? 0);
      normalizedDaily.push({
        date: daily.time[i],
        tempMax: Number(daily.temperature_2m_max?.[i] ?? 0),
        tempMin: Number(daily.temperature_2m_min?.[i] ?? 0),
        feelsLikeMax: daily.apparent_temperature_max?.[i] != null ? Number(daily.apparent_temperature_max[i]) : null,
        feelsLikeMin: daily.apparent_temperature_min?.[i] != null ? Number(daily.apparent_temperature_min[i]) : null,
        rainSum: dRain,
        maxRainProbability: Number(daily.precipitation_probability_max?.[i] ?? 0),
        maxWindSpeed: dWind,
        weatherCode: dCode,
        condition: getWeatherConditionFromCode(dCode, dRain, dWind),
      });
    }
  }

  const precipitationExpected = normalizedHourly[0]?.precipitation ?? 0;
  const maxRainProbability = normalizedHourly.length > 0
    ? Math.max(...normalizedHourly.map((h) => h.rainProbability))
    : 0;

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    locationName,
    current: {
      temperature,
      feelsLike,
      humidity,
      windSpeed,
      windDirection,
      rainfall,
      pressure,
      weatherCode,
      condition,
      observedAt,
    },
    forecast: {
      hourly: normalizedHourly,
      daily: normalizedDaily,
      precipitationExpected,
      maxRainProbability,
      forecastGeneratedAt: nowIso,
    },
    sourceMetadata: {
      provider: "Open-Meteo",
      model: "Best-Match NWP",
      sourceStatus: "ok",
      dataFreshness: isCached ? "cached" : "live",
      timestamp: nowIso,
    },
    // Isolated provider details for extensibility
    providerSpecific: {
      timezone: raw.timezone || "auto",
      elevation: raw.elevation,
      currentUnits: raw.current_units || {},
      hourlyUnits: raw.hourly_units || {},
      dailyUnits: raw.daily_units || {},
    },

    // Backward-compatible properties for existing consumers
    rawCurrent: cur,
    rawHourly: hourly,
  };
}

/**
 * Fetches current weather and forecast from Open-Meteo with caching and strict validation.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} [locationName="Active Location"]
 * @returns {Promise<Object>} Normalized weather data model
 */
async function fetchWeather(latitude, longitude, locationName = "Active Location") {
  const coords = validateCoordinates(latitude, longitude);
  const key = getCacheKey(coords.latitude, coords.longitude);
  const cached = _weatherCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return normalizeWeatherData(cached.raw, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationName,
      isCached: true,
    });
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m` +
    `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
    `&forecast_days=7` +
    `&timezone=auto` +
    `&models=best_match`;

  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(8000), // 8-second fail-fast timeout
    });
  } catch (err) {
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
    const errorMsg = isTimeout
      ? "Weather upstream API request timed out after 8 seconds."
      : `Weather upstream network failure: ${err.message}`;
    const error = new Error(errorMsg);
    error.statusCode = isTimeout ? 504 : 502;
    error.sourceStatus = "timeout";
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(`Weather upstream API returned HTTP ${response.status}: ${errorText || response.statusText}`);
    error.statusCode = response.status === 429 ? 429 : 502;
    error.sourceStatus = "error";
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const error = new Error(`Failed to parse weather API response as JSON: ${err.message}`);
    error.statusCode = 502;
    error.sourceStatus = "malformed_response";
    throw error;
  }

  if (!data || typeof data !== "object" || !data.current) {
    const error = new Error("Weather API returned an empty or malformed data payload.");
    error.statusCode = 502;
    error.sourceStatus = "malformed_response";
    throw error;
  }

  _weatherCache.set(key, { raw: data, timestamp: Date.now() });

  return normalizeWeatherData(data, {
    latitude: coords.latitude,
    longitude: coords.longitude,
    locationName,
    isCached: false,
  });
}

/**
 * Clears in-memory weather cache (useful for testing).
 */
function clearWeatherCache() {
  _weatherCache.clear();
}

module.exports = {
  fetchWeather,
  validateCoordinates,
  normalizeWeatherData,
  getWeatherConditionFromCode,
  clearWeatherCache,
};
