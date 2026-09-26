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

/**
 * Attempts to fetch IMD weather advisory data for a location.
 * Uses nearest IMD city station based on coordinates.
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

    // IMD API: Fetch city forecast which includes weather conditions/warnings
    // Station code 42182 is specifically the IMD station for Bhubaneswar, Odisha.
    // If the requested coordinates are not within this station's coverage, return null
    // (explicitly unavailable) rather than silently using Bhubaneswar station data.
    const stationCode = selectIMDStation(latitude, longitude);
    if (!stationCode) {
      return null;
    }

    const url = `https://api.imd.gov.in/api/v1/cityforecast?id=${stationCode}`;
    const response = await fetch(url, {
      signal: controller.signal,
      timeout: IMD_TIMEOUT_MS,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.debug(`[SKYRA IMD] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const parsed = parseIMDForecast(data, locationName);

    if (parsed) {
      console.log(`[SKYRA IMD] Successfully retrieved advisories for ${locationName}`);
      return parsed;
    }

    return null;
  } catch (err) {
    // Timeout, network error, parse error — silently continue
    if (err.name !== "AbortError") {
      console.debug(`[SKYRA IMD] Fetch failed:`, err.message);
    }
    return null;
  }
}

/**
 * Selects the IMD station code if the user is in an explicitly supported IMD station zone.
 * Station 42182 corresponds specifically to Bhubaneswar, Odisha.
 * Dynamic nationwide IMD station resolution is not yet implemented, so non-Bhubaneswar
 * coordinates explicitly return null rather than silently reusing station 42182.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string|null} IMD station code or null if unmapped
 */
function selectIMDStation(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  // Bhubaneswar IMD station 42182 coordinate reference: 20.2961, 85.8245
  const BHUBANESWAR_REF = { lat: 20.2961, lon: 85.8245, code: "42182" };
  const distance = Math.sqrt(
    Math.pow(latitude - BHUBANESWAR_REF.lat, 2) + Math.pow(longitude - BHUBANESWAR_REF.lon, 2)
  );

  // Allow up to ~0.5 degrees (~50km) for the Bhubaneswar meteorological station zone
  if (distance <= 0.5) {
    return BHUBANESWAR_REF.code;
  }

  // For other regions, dynamic IMD station selection is not yet configured.
  // Return null to ensure no silent cross-city fallback occurs.
  return null;
}

/**
 * Parses IMD forecast API response and extracts advisory information.
 * Converts forecast conditions into advisory alerts.
 *
 * @param {Object} data - IMD API response
 * @param {string} locationName - Display name
 * @returns {Object|null} Parsed advisory data or null
 */
function parseIMDForecast(data, locationName) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  // IMD returns array of forecast records
  const forecast = data[0];

  if (!forecast) {
    return null;
  }

  // Extract today's and next 3 days' forecasts to identify warnings
  const advisories = [];
  const warningKeywords = [
    "heavy rain",
    "thunderstorm",
    "lightning",
    "strong wind",
    "squall",
    "hail",
    "cyclone",
    "storm",
    "severe weather",
    "gusty",
    "rainfall",
    "showers",
  ];

  // Check today's forecast
  const todaysCondition = forecast.Todays_Forecast?.toLowerCase() || "";
  if (todaysCondition && containsWarningKeyword(todaysCondition, warningKeywords)) {
    advisories.push({
      day: "Today",
      condition: forecast.Todays_Forecast,
      maxTemp: forecast.Todays_Forecast_Max_Temp,
      minTemp: forecast.Todays_Forecast_Min_temp,
      isWarning: true,
    });
  }

  // Check next 3 days
  for (let i = 2; i <= 4; i++) {
    const dayForecast = forecast[`Day_${i}_Forecast`]?.toLowerCase() || "";
    const dayLabel = `Day ${i - 1}`;
    if (dayForecast && containsWarningKeyword(dayForecast, warningKeywords)) {
      advisories.push({
        day: dayLabel,
        condition: forecast[`Day_${i}_Forecast`],
        maxTemp: forecast[`Day_${i}_Max_Temp`],
        minTemp: forecast[`Day_${i}_Min_temp`],
        isWarning: true,
      });
    }
  }

  // If advisories found, return structured data
  if (advisories.length > 0) {
    return {
      location: locationName,
      dataSource: "IMD",
      advisories,
      stationName: forecast.Station_Name || "IMD Station",
      lastUpdated: new Date().toISOString(),
      hasWarnings: true,
    };
  }

  // No warnings in forecast — return advisory data anyway (null warnings)
  return {
    location: locationName,
    dataSource: "IMD",
    advisories: [],
    stationName: forecast.Station_Name || "IMD Station",
    lastUpdated: new Date().toISOString(),
    hasWarnings: false,
  };
}

/**
 * Checks if forecast text contains warning keywords.
 *
 * @param {string} text - Forecast text
 * @param {string[]} keywords - Warning keywords
 * @returns {boolean} True if warning keyword found
 */
function containsWarningKeyword(text, keywords) {
  const lowerText = (text || "").toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Generates advisory message from IMD data.
 * Formats advisory for display in UI.
 *
 * @param {Object} imdData - IMD advisory data
 * @returns {string} Formatted advisory message
 */
export function formatIMDAdvisory(imdData) {
  if (!imdData || !imdData.advisories || imdData.advisories.length === 0) {
    return "No weather warnings from IMD";
  }

  const warnings = imdData.advisories
    .filter((a) => a.isWarning)
    .map((a) => `${a.day}: ${a.condition}`)
    .join(" | ");

  return warnings || "No weather warnings from IMD";
}

/**
 * Extracts advisory risk level based on keywords in IMD data.
 * Maps IMD conditions to SKYRA risk levels.
 *
 * @param {Object} imdData - IMD advisory data
 * @returns {string} Risk level ("Low", "Moderate", "High", "Severe")
 */
export function getIMDRiskLevel(imdData) {
  if (!imdData || !imdData.advisories || imdData.advisories.length === 0) {
    return "Low";
  }

  const conditions = imdData.advisories.map((a) => (a.condition || "").toLowerCase()).join(" ");

  // Map IMD conditions to SKYRA risk levels
  if (
    conditions.includes("cyclone") ||
    conditions.includes("severe thunderstorm") ||
    conditions.includes("extreme")
  ) {
    return "Severe";
  }

  if (
    conditions.includes("heavy rain") ||
    conditions.includes("strong wind") ||
    conditions.includes("thunderstorm") ||
    conditions.includes("lightning")
  ) {
    return "High";
  }

  if (
    conditions.includes("rain") ||
    conditions.includes("showers") ||
    conditions.includes("gusty") ||
    conditions.includes("wind")
  ) {
    return "Moderate";
  }

  return "Low";
}
