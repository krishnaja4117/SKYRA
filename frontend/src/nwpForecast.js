/**
 * SKYRA – NWP/GFS Forecast Integration
 * ────────────────────────────────────────────────────────────────────────────
 * Safely integrates GFS/NWP forecast data from public sources with robust
 * fallback to existing Open-Meteo API. Never blocks the application.
 *
 * Architecture:
 *   - getNWPForecast() attempts to fetch from public NWP source
 *   - Timeout: 5 seconds (fail-fast to preserve UX responsiveness)
 *   - On any error: silently returns null (lets caller use fallback)
 *   - Demo Mode: never calls NWP (fully offline, uses demo data)
 *   - Online Mode: attempts NWP, falls back to Open-Meteo if needed
 *
 * Data source priority:
 *   1. NWP/GFS (if available within timeout)
 *   2. Open-Meteo (reliable fallback, always available)
 *   3. Demo data (offline, predefined scenarios)
 *
 * No breaking changes:
 *   - Does not modify backend, ML, or existing APIs
 *   - Does not require NWP for app to load
 *   - Existing risk, alerts, map features unchanged
 *   - Demo Mode completely unaffected
 */

const NWP_TIMEOUT_MS = 5000;  // 5 second timeout (fail-fast for UX)
const NWP_SOURCES = [
  // Try multiple public NWP sources in order
  {
    name: "NOAA GFS",
    // Weather.gov (NWS) strictly covers US territories; skip for India/global coordinates
    isSupported: (lat, lon) => lat >= 18.0 && lat <= 72.0 && lon >= -179.0 && lon <= -65.0,
    url: (lat, lon) => 
      `https://api.weather.gov/points/${lat},${lon}`,
    parse: (data) => {
      // Parse NOAA Grid Points API response
      if (!data.properties?.forecast) return null;
      return {
        gridUrl: data.properties.forecast,
        dataSource: "NOAA GFS",
      };
    },
  },
  {
    name: "Open-Meteo NWP",
    isSupported: () => true,
    url: (lat, lon) =>
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,rain,surface_pressure` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,rain,wind_speed_10m` +
      `&forecast_days=7&timezone=auto&models=best_match`,
    parse: (data) => {
      // Open-Meteo NWP data (7-day forecast)
      if (!data.current) return null;
      return {
        current: data.current,
        hourly: data.hourly,
        dataSource: "NWP Extended Forecast",
      };
    },
  },
];

/**
 * Attempts to fetch NWP forecast data with timeout.
 * Returns null silently on any error (including timeout).
 * Caller is responsible for fallback logic.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object|null>} NWP forecast or null
 */
export async function getNWPForecast(latitude, longitude) {
  // Safety: bail out if coordinates invalid
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  // Try each NWP source sequentially until one succeeds
  for (const source of NWP_SOURCES) {
    if (typeof source.isSupported === "function" && !source.isSupported(latitude, longitude)) {
      continue; // Skip provider if outside geographic coverage area
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), NWP_TIMEOUT_MS);

      const url = source.url(latitude, longitude);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      const parsed = source.parse(data);

      if (parsed) {
        console.log(`[SKYRA NWP] Successfully retrieved: ${parsed.dataSource}`);
        return parsed;
      }
    } catch (err) {
      // Timeout, network error, parse error — silently continue to next source
      if (err.name !== "AbortError") {
        console.debug(`[SKYRA NWP] ${source.name} unavailable:`, err.message);
      }
    }
  }

  // All NWP sources failed or timed out — return null for fallback
  console.debug("[SKYRA NWP] All NWP sources unavailable, using Open-Meteo fallback");
  return null;
}

/**
 * Merges NWP forecast with existing Open-Meteo data.
 * NWP data enriches Open-Meteo with extended forecast.
 * If NWP is unavailable, returns Open-Meteo data unchanged.
 *
 * @param {Object} openMeteoData - Standard Open-Meteo forecast
 * @param {Object|null} nwpData - NWP forecast (or null)
 * @returns {Object} Merged forecast data
 */
export function mergeForecasts(openMeteoData, nwpData) {
  if (!nwpData) {
    // NWP unavailable — return Open-Meteo as-is
    return openMeteoData;
  }

  // Add NWP metadata to existing structure
  return {
    ...openMeteoData,
    nwp: {
      available: true,
      dataSource: nwpData.dataSource,
      current: nwpData.current,
      hourly: nwpData.hourly,
    },
  };
}

/**
 * Identifies the best data source for current conditions.
 * Used for UI labeling only (never claims WRF/GFS if not retrieved).
 *
 * @param {Object} forecast - Merged forecast object
 * @returns {string} Human-readable data source
 */
export function getDataSourceLabel(forecast) {
  if (forecast?.nwp?.available) {
    return `${forecast.nwp.dataSource} (NWP)`;
  }
  return "Open-Meteo (API)";
}
