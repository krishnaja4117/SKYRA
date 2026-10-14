/**
 * SKYRA – IMD Weather Warnings/Advisories Integration
 * ────────────────────────────────────────────────────────────────────────────
 * Safely fetches weather warnings and advisories from India Meteorological
 * Department (IMD) API with robust fallback and never blocks the application.
 *
 * Architecture:
 *   - getIMDAdvisories() attempts to fetch from IMD public API
 *   - Timeout: 5 seconds (fail-fast to preserve UX responsiveness)
 *   - On any error: silently returns null (lets caller use fallback)
 *   - Demo Mode: never called (fully offline, uses demo data)
 *   - Online Mode: attempts IMD, continues with SKYRA if needed
 *
 * Data priority:
 *   1. IMD weather advisories (if available within timeout)
 *   2. SKYRA alerts (existing, always available)
 *   3. Demo data (offline, predefined scenarios)
 *
 * No breaking changes:
 *   - Does not modify backend, ML, or existing APIs
 *   - Does not require IMD for app to load
 *   - Existing risk, alerts, map features unchanged
 *   - Demo Mode completely unaffected
 */

const IMD_TIMEOUT_MS = 5000;  // 5 second timeout (fail-fast for UX)
const RAW_API_BASE = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE_URL = RAW_API_BASE.replace(/\/+$/, "");

function getApiUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

/**
 * Attempts to fetch IMD weather advisory data for a location via SKYRA backend proxy.
 * Avoids browser CORS failure and leverages server-side IMD observatory matching.
 *
 * Returns object with advisories or null silently on error.
 * Never throws, never blocks.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} locationName - Display name for reference
 * @returns {Promise<Object|null>} IMD advisory data or null
 */
export async function getIMDAdvisories(latitude, longitude, locationName) {
  // Safety: bail out if coordinates invalid
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMD_TIMEOUT_MS);

    const url = getApiUrl(`/api/weather/imd?lat=${latitude}&lon=${longitude}`);
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.debug(`[SKYRA IMD] Backend proxy returned HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data || data.available === false) {
      return null;
    }

    const hasWarnings = data.warningColor && data.warningColor !== "Green";
    const advisories = [];
    if (data.headline || data.bulletin) {
      advisories.push({
        day: "Current Advisory",
        condition: data.headline || data.bulletin,
        warningColor: data.warningColor,
        warningLevel: data.warningLevel,
        isWarning: hasWarnings,
      });
    }

    return {
      location: locationName || data.stationName || "Monitored Location",
      stationName: data.stationName || "IMD Observatory",
      stationId: data.stationId || null,
      warningColor: data.warningColor || "Green",
      warningLevel: data.warningLevel || "No Warning",
      headline: data.headline || "",
      bulletin: data.bulletin || "",
      hasWarnings,
      advisories,
      lastUpdated: data.provenance?.observationTime || new Date().toISOString(),
    };
  } catch (err) {
    if (err.name !== "AbortError") {
      console.debug(`[SKYRA IMD] Fetch failed:`, err.message);
    }
    return null;
  }
}

