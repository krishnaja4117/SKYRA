/**
 * SKYRA – Weather Ingestion Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend service for fetching, normalizing, and caching live weather data.
 * Protects downstream services and clients with in-memory TTL caching.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const _weatherCache = new Map();

function getCacheKey(lat, lon) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

/**
 * Fetches current weather and short-term forecast from Open-Meteo for any coordinates.
 */
async function fetchWeather(latitude = 20.2961, longitude = 85.8245) {
  const key = getCacheKey(latitude, longitude);
  const cached = _weatherCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,rain,surface_pressure` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,rain,wind_speed_10m` +
    `&forecast_days=2` +
    `&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API request failed with status: ${response.status}`);
  }

  const data = await response.json();
  _weatherCache.set(key, { data, timestamp: Date.now() });

  return data;
}

module.exports = {
  fetchWeather,
};
