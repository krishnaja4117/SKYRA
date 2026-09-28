/**
 * SKYRA – Dynamic Location Service (Stage 1)
 * ────────────────────────────────────────────────────────────────────────────
 * Provides a single, reusable way to get the user's current location and
 * resolve it to a human-readable city/region name.
 *
 * Designed to be consumed later by:
 *   Dashboard, WeatherGPT, Historical Intelligence, Predictive Impact,
 *   Actionable Advice, Alerts, and SOS.
 *
 * Design principles:
 *   • Requests permission explicitly via navigator.geolocation (one-shot).
 *   • No background tracking or continuous monitoring in Stage 1.
 *   • Reverse-geocoding via Nominatim (OpenStreetMap) — free, no API key,
 *     consistent with the Leaflet/OSM stack already used in RiskMap.
 *   • If geocoding fails, falls back to a safe "Current location" label.
 *   • Bhubaneswar DEMO fallback is clearly labelled and only used when
 *     geolocation is explicitly unavailable AND no live coords exist.
 *   • No fake GPS data — coordinates always come from the browser.
 *   • Does NOT modify any other service, component, or API.
 *
 * ─── Returned shape (SkyraLocation) ─────────────────────────────────────────
 *   {
 *     latitude    {number}         WGS-84 decimal degrees
 *     longitude   {number}         WGS-84 decimal degrees
 *     accuracy    {number|null}    metres (from browser, null if unavailable)
 *     city        {string|null}    e.g. "Bhubaneswar"  (from Nominatim)
 *     region      {string|null}    e.g. "Odisha"
 *     country     {string|null}    e.g. "India"
 *     displayName {string}         safe label always present
 *     source      {string}         "gps" | "demo_fallback"
 *   }
 *
 * ─── Error object (LocationError) ───────────────────────────────────────────
 *   {
 *     code    {string}   "PERMISSION_DENIED" | "UNAVAILABLE" |
 *                        "TIMEOUT" | "NOT_SUPPORTED" | "GEOCODING_FAILED"
 *     message {string}   human-readable description
 *   }
 */

// ─── DEMO / FALLBACK constant ─────────────────────────────────────────────────
// Used ONLY in explicit offline demo mode or test harnesses.
// Clearly labelled as DEMO so consumers can distinguish it from real GPS data.
export const DEMO_FALLBACK_LOCATION = {
  latitude:    20.2961,
  longitude:   85.8245,
  accuracy:    null,
  city:        "Bhubaneswar",
  region:      "Odisha",
  country:     "India",
  displayName: "Bhubaneswar, Odisha (DEMO fallback)",
  source:      "demo_fallback",
};

// ─── Explicit Location Unavailable constant ──────────────────────────────────
// Returned when browser geolocation permission is denied, times out, or is unavailable,
// and no manual city search has been performed.
export const LOCATION_UNAVAILABLE = {
  latitude:    null,
  longitude:   null,
  accuracy:    null,
  city:        null,
  region:      null,
  country:     null,
  displayName: "Location Unavailable",
  source:      "unavailable",
};

// ─── Nominatim reverse-geocoding ─────────────────────────────────────────────
// Uses OpenStreetMap Nominatim — same data source as the Leaflet tiles already
// displayed in RiskMap. No API key required.
// Nominatim usage policy: one request per user action, with a descriptive UA.
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_UA        = "SKYRA-SIH2026/1.0 (disaster-awareness-app)";

/**
 * formatLocationHierarchy
 * Formats reverse-geocoded address into "CITY/LOCALITY, DISTRICT, STATE".
 * Follows exact priority rules:
 * - Locality: city -> town -> village -> municipality -> suburb/locality
 * - District: state_district -> district -> county
 * - State: state -> region
 * - Intelligently dedupes repeated values (e.g. Chennai, Chennai -> Chennai)
 * - Never includes country or raw coordinates
 *
 * @param {Object} addr - Nominatim address object
 * @returns {string} Formatted display string e.g. "Chittur, Palakkad, Kerala"
 */
export function formatLocationHierarchy(addr) {
  if (!addr || typeof addr !== "object") return "";

  // 1. Locality priority: city -> town -> village -> municipality -> suburb/locality
  // If suburb is 'Chittur' and town is compound 'Chittur-Thathamangalam', prefer 'Chittur'
  let locality =
    (addr.suburb && addr.town && addr.town.toLowerCase().includes(addr.suburb.toLowerCase()) ? addr.suburb : null) ??
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    addr.suburb ??
    addr.neighbourhood ??
    addr.county ??
    null;

  // 2. District priority: state_district -> district -> county
  const districtCandidates = [
    addr.state_district,
    addr.district,
    addr.county,
  ].filter(Boolean);

  const normLoc = (locality || "").trim().toLowerCase();
  const district = districtCandidates.find((d) => {
    const normD = d.trim().toLowerCase();
    return normD !== normLoc && !normLoc.includes(normD) && !normD.includes(normLoc);
  }) || null;

  // 3. State: state -> region
  const state = addr.state ?? addr.region ?? null;

  // 4. Combine into CITY/LOCALITY, DISTRICT, STATE (never country or coordinates)
  const parts = [locality, district, state].filter(Boolean);
  return parts.join(", ");
}

/**
 * formatDashboardTopRightLocation
 * Formats the Dashboard top-right location text according to the exact required format:
 * CITY/LOCALITY, DISTRICT, STATE
 *
 * Rules:
 * - First: most specific city/locality
 * - Second: district
 * - Third: state
 * - Never show country (e.g. India)
 * - Never show coordinates (e.g. Lat 10.70°, Lon 76.75°)
 * - Never show only the district when a city/locality is available
 * - Keep it fully dynamic using the existing reverse-geocoding data
 * - Do not hardcode any location
 *
 * @param {Object|string} currentLocation - Location object or string
 * @returns {string} Formatted display string e.g. "Chittur, Palakkad, Kerala"
 */
export function formatDashboardTopRightLocation(currentLocation) {
  if (!currentLocation) return "Location unavailable";

  // If structured address components are available, build hierarchy directly: CITY/LOCALITY, DISTRICT, STATE
  if (typeof currentLocation === "object") {
    const city = currentLocation.city;
    const district = currentLocation.district;
    const state = currentLocation.state || currentLocation.region;

    if (city) {
      const normCity = city.trim().toLowerCase();
      const parts = [city.trim()];

      if (district) {
        const normDist = district.trim().toLowerCase();
        if (normDist !== normCity && !normCity.includes(normDist) && !normDist.includes(normCity)) {
          parts.push(district.trim());
        }
      }

      if (state) {
        const cleanState = state.replace(/,\s*(?:India|Bharat)$/i, "").trim();
        const normState = cleanState.toLowerCase();
        if (!parts.some((p) => p.toLowerCase() === normState || normState.includes(p.toLowerCase()))) {
          parts.push(cleanState);
        }
      }

      return parts.join(", ");
    }
  }

  const raw = typeof currentLocation === "string" ? currentLocation : currentLocation.name;
  if (!raw || typeof raw !== "string") return "Location unavailable";

  const trimmed = raw.trim();

  // Status messages pass through as-is
  if (
    trimmed === "Detecting current location…" ||
    trimmed === "Detecting current location..." ||
    trimmed === "Location unavailable" ||
    trimmed === "Location Unavailable"
  ) {
    return trimmed;
  }

  // If raw is coordinates or contains coordinates pattern, never show coordinates
  if (/^lat\b|°|\bdeg\b|lon\b/i.test(trimmed) || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(trimmed)) {
    return "Current location";
  }

  // Otherwise clean and parse the raw string
  let cleaned = trimmed
    .replace(/^[📍\s]+/, "") // remove any pin icon
    .replace(/,\s*(?:India|Bharat)$/i, "") // never show country
    .replace(/\s*\(DEMO fallback\)/i, "")
    .trim();

  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  const filtered = parts.filter((p) => !/^(India|Bharat)$/i.test(p));

  const deduped = [];
  for (const part of filtered) {
    const norm = part.toLowerCase();
    if (!deduped.some((d) => d.toLowerCase() === norm || (d.length > 3 && norm.includes(d.toLowerCase())))) {
      deduped.push(part);
    }
  }

  return deduped.join(", ") || "Current location";
}

/**
 * reverseGeocode
 * Attempts to resolve lat/lon to city, region, country via Nominatim.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{city:string|null, region:string|null, country:string|null, displayName:string}>}
 *   Never rejects — always resolves with the best available data or coordinates label.
 */
export async function reverseGeocode(lat, lon) {
  const fallback = {
    city: null,
    region: null,
    country: null,
    displayName: `Lat ${lat.toFixed(2)}°, Lon ${lon.toFixed(2)}°`,
  };

  console.log(`[SKYRA Location] Reverse-geocoding started for lat=${lat.toFixed(2)}, lon=${lon.toFixed(2)}`);

  try {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("lat",            String(lat));
    url.searchParams.set("lon",            String(lon));
    url.searchParams.set("format",         "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom",           "14");   // town/suburb level

    const fetchOptions = {
      signal: AbortSignal.timeout(4_000),           // 4s timeout: never block GPS resolution
    };
    if (typeof window === "undefined") {
      fetchOptions.headers = { "User-Agent": NOMINATIM_UA };
    }

    const res = await fetch(url.toString(), fetchOptions);

    if (!res.ok) {
      console.warn(`[SKYRA Location] Reverse-geocoding HTTP failure: status ${res.status}`);
      return fallback;
    }

    const data = await res.json();
    const addr = data?.address ?? {};

    // Use canonical CITY/LOCALITY, DISTRICT, STATE formatter
    const displayName = formatLocationHierarchy(addr) || fallback.displayName;

    let locality =
      (addr.suburb && addr.town && addr.town.toLowerCase().includes(addr.suburb.toLowerCase()) ? addr.suburb : null) ??
      addr.city ??
      addr.town ??
      addr.village ??
      addr.municipality ??
      addr.suburb ??
      addr.county ??
      null;

    const districtCandidates = [
      addr.state_district,
      addr.district,
      addr.county,
    ].filter(Boolean);

    const normLoc = (locality || "").trim().toLowerCase();
    const district = districtCandidates.find((d) => {
      const normD = d.trim().toLowerCase();
      return normD !== normLoc && !normLoc.includes(normD) && !normD.includes(normLoc);
    }) || null;

    const region = addr.state ?? addr.region ?? null;
    const country = addr.country ?? null;

    console.log(`[SKYRA Location] Reverse-geocoding success: "${displayName}"`);
    return {
      city: locality,
      district,
      region,
      country,
      displayName,
    };
  } catch (err) {
    console.warn(`[SKYRA Location] Reverse-geocoding failed or timed out (${err?.message || "network error"}), using coordinates label`);
    return fallback;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * getCurrentLocation
 *
 * Requests the user's GPS position (one-shot), then attempts reverse-geocoding
 * via Nominatim. Returns a fully-resolved SkyraLocation object.
 *
 * Resolves with a SkyraLocation on success.
 * Rejects with a LocationError on permission denied / unavailable / not supported.
 *
 * @returns {Promise<SkyraLocation>}
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    // ── Browser support check ─────────────────────────────────────────────
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.warn("[SKYRA Location] Geolocation is not supported by browser environment");
      reject({
        code:    "NOT_SUPPORTED",
        message: "Location services are not supported by this browser. Please search your city.",
      });
      return;
    }

    // Inspect permission state when Permissions API is available
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then((status) => {
        console.log(`[SKYRA Location] Permission state: ${status.state}`);
      }).catch(() => {});
    }

    const errorMap = {
      1: {
        code:    "PERMISSION_DENIED",
        message: "Location permission was denied. Allow location access in your browser or search your city.",
      },
      2: {
        code:    "UNAVAILABLE",
        message: "Your location is currently unavailable. Check that location services are enabled on your device or search your city.",
      },
      3: {
        code:    "TIMEOUT",
        message: "Location request timed out. Please try again or search your city.",
      },
    };

    let settled = false;
    const safeResolve = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      resolve(val);
    };
    const safeReject = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      reject(err);
    };

    // Hard safety timeout: Ensure Promise never hangs indefinitely in edge cases
    const safetyTimer = setTimeout(() => {
      console.warn("[SKYRA Location] Hard safety timeout (25s) reached without GPS callback response");
      safeReject(errorMap[3]);
    }, 25_000);

    // Helper that executes geolocation with fallback from high to standard accuracy
    const queryGeolocation = (options, isRetry = false) => {
      console.log(`[SKYRA Location] Geolocation request started (enableHighAccuracy=${options.enableHighAccuracy}, timeout=${options.timeout}ms, isRetry=${isRetry})`);

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`[SKYRA Location] GPS success: lat=${latitude.toFixed(3)}, lon=${longitude.toFixed(3)}, accuracy=±${Math.round(accuracy || 0)}m`);

          // Kick off reverse-geocoding (non-blocking — never throws)
          const geo = await reverseGeocode(latitude, longitude);

          safeResolve({
            latitude,
            longitude,
            accuracy:    accuracy ?? null,
            city:        geo.city,
            district:    geo.district,
            region:      geo.region,
            country:     geo.country,
            displayName: geo.displayName || (geo.city ? `${geo.city}, ${geo.region || ""}`.trim() : `Lat ${latitude.toFixed(2)}°, Lon ${longitude.toFixed(2)}°`),
            source:      "gps",
          });
        },
        (error) => {
          const mapped = errorMap[error.code] ?? {
            code:    "UNAVAILABLE",
            message: "Unable to get your location. Please search your city.",
          };

          if (error.code === 3) {
            console.warn(`[SKYRA Location] GPS timeout: Request timed out after ${options.timeout}ms (isRetry=${isRetry})`);
          } else {
            console.warn(`[SKYRA Location] GPS error: code=${error.code} (${mapped.code}) - ${error.message || mapped.message}`);
          }

          // If high-accuracy timed out or unavailable, retry with standard accuracy & relaxed cache
          if (!isRetry && (error.code === 3 || error.code === 2)) {
            console.log("[SKYRA Location] Retrying with standard accuracy and relaxed cache...");
            queryGeolocation(
              { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
              true
            );
            return;
          }

          safeReject(mapped);
        },
        options
      );
    };

    // First attempt: high accuracy with 10s timeout, 60s cache
    queryGeolocation({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }, false);
  });
}

// ─── Convenience helpers ──────────────────────────────────────────────────────
/**
 * getCurrentLocationOrUnavailable
 *
 * Requests browser location. If permission is denied or unavailable, returns
 * LOCATION_UNAVAILABLE so that the application shows an explicit "Location Unavailable"
 * state without silently masquerading as Bhubaneswar or another city.
 *
 * @returns {Promise<SkyraLocation>}  always resolves
 */
export async function getCurrentLocationOrUnavailable() {
  try {
    const loc = await getCurrentLocation();
    console.log("[SKYRA Location] Final location state:", {
      source: loc.source,
      displayName: loc.displayName,
      hasCoords: loc.latitude != null && loc.longitude != null,
      accuracy: loc.accuracy != null ? `±${Math.round(loc.accuracy)}m` : null,
    });
    return loc;
  } catch (error) {
    const unavailableLoc = {
      ...LOCATION_UNAVAILABLE,
      error: error?.message || "Location permission denied or unavailable",
      errorCode: error?.code || "UNAVAILABLE",
    };
    console.log("[SKYRA Location] Final location state (unavailable):", {
      source: unavailableLoc.source,
      code: unavailableLoc.errorCode,
      message: unavailableLoc.error,
    });
    return unavailableLoc;
  }
}

/**
 * getCurrentLocationOrFallback
 *
 * Kept for backward compatibility. Returns the real GPS location, or an explicit
 * "unavailable" object if GPS permission is denied/unavailable.
 * It NEVER silently returns Bhubaneswar as the user's current location.
 *
 * @returns {Promise<SkyraLocation>}  always resolves
 */
export async function getCurrentLocationOrFallback() {
  return getCurrentLocationOrUnavailable();
}
