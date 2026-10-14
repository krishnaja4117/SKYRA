/**
 * SKYRA – Weather & Forecast API Client
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary frontend weather client communicating with backend /api/weather
 * with fallback to authoritative Open-Meteo NWP forecasts.
 */

import { saveWeatherSnapshot, getCachedWeather } from "./services/idbStorage";

const RAW_API_BASE = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE_URL = RAW_API_BASE.replace(/\/+$/, "");

function getApiUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL) {
    return new URL(`${API_BASE_URL}${cleanPath}`);
  }
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:5000";
  return new URL(cleanPath, base);
}

/**
 * Translates WMO weather codes (0-99) into appropriate descriptive icons.
 */
export function getWeatherIcon(code) {
  const c = Number(code);
  if (c === 0) return "☀️";
  if (c === 1) return "🌤️";
  if (c === 2) return "⛅";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 51 && c <= 55) return "🌦️";
  if (c >= 56 && c <= 57) return "🌧️";
  if (c >= 61 && c <= 65) return "🌧️";
  if (c >= 66 && c <= 67) return "🌨️";
  if (c >= 71 && c <= 77) return "❄️";
  if (c >= 80 && c <= 82) return "🌧️";
  if (c >= 85 && c <= 86) return "🌨️";
  if (c === 95) return "⛈️";
  if (c >= 96 && c <= 99) return "⛈️";
  return "⛅";
}

/**
 * Translates WMO weather codes (0-99) into human-readable descriptions.
 */
export function getWeatherConditionName(code, rain = 0, wind = 0) {
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
  if (rain >= 25 && wind >= 30) return "Heavy rainfall with strong wind";
  if (rain >= 15) return "Heavy rainfall";
  if (wind >= 50) return "Strong wind";
  if (rain > 0) return "Light rain";
  return "Partly cloudy";
}

/**
 * Normalizes direct Open-Meteo response into the canonical SKYRA Weather Model.
 */
export function normalizeDirectOpenMeteo(raw, { latitude, longitude, locationName = "Active Location" } = {}) {
  const cur = raw.current || {};
  const hourly = raw.hourly || {};
  const daily = raw.daily || {};
  const nowIso = new Date().toISOString();

  const temperature = Number(cur.temperature_2m ?? 0);
  const feelsLike = cur.apparent_temperature != null ? Number(cur.apparent_temperature) : null;
  const humidity = Number(cur.relative_humidity_2m ?? 0);
  const windSpeed = Number(cur.wind_speed_10m ?? 0);
  const windDirection = cur.wind_direction_10m != null ? Number(cur.wind_direction_10m) : null;
  const rainfall = Number(cur.rain ?? cur.precipitation ?? 0);
  const pressure = Number(cur.surface_pressure ?? 1013);
  const weatherCode = cur.weather_code != null ? Number(cur.weather_code) : 0;
  const condition = getWeatherConditionName(weatherCode, rainfall, windSpeed);

  // Hourly (up to 7 days = 168 hours)
  const normalizedHourly = [];
  if (Array.isArray(hourly.time)) {
    const limit = Math.min(hourly.time.length, 168);
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
        windDirection: hourly.wind_direction_10m?.[i] != null ? Number(hourly.wind_direction_10m[i]) : null,
        surfacePressure: Number(hourly.surface_pressure?.[i] ?? 1013),
        weatherCode: hCode,
        condition: getWeatherConditionName(hCode, hRain, hWind),
      });
    }
  }

  // Daily (up to 7 days)
  const normalizedDaily = [];
  if (Array.isArray(daily.time)) {
    const limit = Math.min(daily.time.length, 7);
    for (let i = 0; i < limit; i++) {
      const dCode = Number(daily.weather_code?.[i] ?? 0);
      const dRain = Number(daily.precipitation_sum?.[i] ?? 0);
      const dWind = Number(daily.wind_speed_10m_max?.[i] ?? 0);
      const dateStr = daily.time[i];

      // Calculate average humidity for this day from hourly data if available
      const dayHours = normalizedHourly.filter((h) => h.time && h.time.startsWith(dateStr));
      const avgHumidity = dayHours.length > 0
        ? Math.round(dayHours.reduce((acc, h) => acc + h.humidity, 0) / dayHours.length)
        : null;

      normalizedDaily.push({
        date: dateStr,
        tempMax: Number(daily.temperature_2m_max?.[i] ?? 0),
        tempMin: Number(daily.temperature_2m_min?.[i] ?? 0),
        feelsLikeMax: daily.apparent_temperature_max?.[i] != null ? Number(daily.apparent_temperature_max[i]) : null,
        feelsLikeMin: daily.apparent_temperature_min?.[i] != null ? Number(daily.apparent_temperature_min[i]) : null,
        rainSum: dRain,
        maxRainProbability: Number(daily.precipitation_probability_max?.[i] ?? 0),
        maxWindSpeed: dWind,
        weatherCode: dCode,
        condition: getWeatherConditionName(dCode, dRain, dWind),
        humidity: avgHumidity,
      });
    }
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    locationName,
    units: {
      temperature: "°C",
      precipitation: "mm",
      windSpeed: "km/h",
      pressure: "hPa",
      humidity: "%",
    },
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
      observedAt: cur.time ? new Date(cur.time).toISOString() : nowIso,
    },
    forecast: {
      hourly: normalizedHourly,
      daily: normalizedDaily,
      precipitationExpected: normalizedHourly[0]?.precipitation ?? 0,
      precipitationExpected24h: normalizedDaily[0]?.rainSum ?? (
        normalizedHourly.slice(0, 24).reduce((sum, h) => sum + (h.precipitation || 0), 0)
      ),
      maxRainProbability: normalizedHourly.length > 0
        ? Math.max(...normalizedHourly.map((h) => h.rainProbability))
        : 0,
      forecastGeneratedAt: nowIso,
    },
    provenance: {
      provider: "Open-Meteo",
      sourceModel: "Best-Match NWP",
      observationTimestamp: cur.time ? new Date(cur.time).toISOString() : nowIso,
      ingestionTimestamp: nowIso,
      dataFreshness: "live",
      requestedCoordinates: { latitude: Number(latitude), longitude: Number(longitude) },
      actualSourceCoordinates: {
        latitude: Number(raw.latitude ?? latitude),
        longitude: Number(raw.longitude ?? longitude),
      },
    },
    rawCurrent: cur,
    rawHourly: hourly,
  };
}

/**
 * Fetches comprehensive 7-day live weather and hourly forecast.
 * Prefers backend /api/weather; seamlessly falls back to Open-Meteo if backend is offline.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} [locationName="Active Location"]
 * @param {AbortSignal} [signal]
 * @returns {Promise<Object>} Normalized weather & forecast model
 */
export async function fetchFullForecast(latitude, longitude, locationName = "Active Location", signal) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Valid geographic coordinates required. Received lat=${latitude}, lon=${longitude}`);
  }

  // 1. Attempt backend centralized weather endpoint
  try {
    const url = getApiUrl("/api/weather");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    if (locationName) {
      url.searchParams.set("location", String(locationName).trim());
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: signal || AbortSignal.timeout(9000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.current && data.forecast) {
        // Ensure daily humidity is populated if missing
        if (Array.isArray(data.forecast.daily) && Array.isArray(data.forecast.hourly)) {
          data.forecast.daily.forEach((d) => {
            if (d.humidity == null && d.date) {
              const dayHours = data.forecast.hourly.filter((h) => h.time && h.time.startsWith(d.date));
              if (dayHours.length > 0) {
                d.humidity = Math.round(dayHours.reduce((acc, h) => acc + (h.humidity || 0), 0) / dayHours.length);
              }
            }
          });
        }
        // Save to IndexedDB offline storage
        saveWeatherSnapshot("current_location", data, {
          latitude: lat,
          longitude: lon,
          locationName,
          source: data.dataSource || "SKYRA Backend Service",
        }).catch(() => {});
        return data;
      }
    }
  } catch (backendErr) {
    // Backend offline or unreachable — proceed to client fallback
    console.info("SKYRA backend weather service unreachable, fetching directly from Open-Meteo:", backendErr.message);
  }

  // 2. Client-side direct Open-Meteo fetch
  try {
    const directUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
      `&forecast_days=7` +
      `&timezone=auto` +
      `&models=best_match`;

    const directResponse = await fetch(directUrl, {
      signal: signal || AbortSignal.timeout(10000),
    });

    if (!directResponse.ok) {
      throw new Error(`Weather forecast request failed with status ${directResponse.status}`);
    }

    const raw = await directResponse.json();
    const normalized = normalizeDirectOpenMeteo(raw, { latitude: lat, longitude: lon, locationName });

    // Save to IndexedDB offline storage
    saveWeatherSnapshot("current_location", normalized, {
      latitude: lat,
      longitude: lon,
      locationName,
      source: "Open-Meteo (Direct Fallback)",
    }).catch(() => {});

    return normalized;
  } catch (directErr) {
    // 3. Complete Offline Resilience: Read from IndexedDB
    try {
      const cached = await getCachedWeather("current_location");
      if (cached && cached.data) {
        console.warn("[SKYRA Weather] Network offline — serving durable IndexedDB snapshot from", cached.timestamp);
        return {
          ...cached.data,
          dataSource: `Offline Cache (${cached.freshness}, ${cached.ageMinutes}m ago)`,
          isOfflineCached: true,
          cachedAt: cached.timestamp,
          freshness: cached.freshness,
        };
      }
    } catch {
      // IDB unavailable
    }
    throw directErr;
  }
}

/**
 * Legacy getLiveWeather for backward compatibility with existing components.
 */
export async function getLiveWeather(latitude, longitude) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
      `&forecast_days=7` +
      `&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Weather API request failed");
    }
    const json = await response.json();
    saveWeatherSnapshot("legacy_live_weather", json, { latitude, longitude }).catch(() => {});
    return json;
  } catch (err) {
    const cached = await getCachedWeather("legacy_live_weather").catch(() => null);
    if (cached && cached.data) {
      return cached.data;
    }
    throw err;
  }
}
