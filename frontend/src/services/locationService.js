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
 * reverseGeocode
 * Attempts to resolve lat/lon to city, region, country via Nominatim.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{city:string|null, region:string|null, country:string|null, displayName:string}>}
 *   Never rejects — always resolves with the best available data or nulls.
 */
export async function reverseGeocode(lat, lon) {
  const fallback = { city: null, region: null, country: null, displayName: "Current location" };

  try {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("lat",            String(lat));
    url.searchParams.set("lon",            String(lon));
    url.searchParams.set("format",         "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom",           "10");   // city level

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": NOMINATIM_UA },
      signal:  AbortSignal.timeout(8_000),           // don't hang forever
    });

    if (!res.ok) return fallback;

    const data = await res.json();
    const addr = data?.address ?? {};

    // Nominatim uses different keys depending on place type.
    // Try the most common keys in priority order.
    const city =
      addr.city            ??
      addr.town            ??
      addr.village         ??
      addr.municipality    ??
      addr.state_district  ??
      addr.county          ??
      addr.suburb          ??
      addr.district        ??
      null;

    const region =
      addr.state        ??
      addr.region       ??
      null;

    const country = addr.country ?? null;

    // Build a compact display name from available parts
    const parts = [city, region, country].filter(Boolean);
    const displayName = parts.length > 0 ? parts.join(", ") : "Current location";

    return { city, region, country, displayName };
  } catch {
    // Network error, timeout, parse error — return safe fallback silently
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
      reject({
        code:    "NOT_SUPPORTED",
        message: "Location services are not supported by this browser. Please search your city.",
      });
      return;
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

    // Helper that executes geolocation with fallback from high to standard accuracy
    const queryGeolocation = (options, isRetry = false) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;

          // Kick off reverse-geocoding (non-blocking — never throws)
          const geo = await reverseGeocode(latitude, longitude);

          resolve({
            latitude,
            longitude,
            accuracy:    accuracy ?? null,
            city:        geo.city,
            region:      geo.region,
            country:     geo.country,
            displayName: geo.displayName || (geo.city ? `${geo.city}, ${geo.region || ""}`.trim() : "Current location"),
            source:      "gps",
          });
        },
        (error) => {
          // If high-accuracy timed out or unavailable, retry with low-accuracy/cached position
          if (!isRetry && (error.code === 3 || error.code === 2)) {
            queryGeolocation(
              { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
              true
            );
            return;
          }

          reject(errorMap[error.code] ?? {
            code:    "UNAVAILABLE",
            message: "Unable to get your location. Please search your city.",
          });
        },
        options
      );
    };

    // First attempt: high accuracy with 6s timeout, 60s cache
    queryGeolocation({ enableHighAccuracy: true, timeout: 6_000, maximumAge: 60_000 }, false);
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
    return await getCurrentLocation();
  } catch (error) {
    return {
      ...LOCATION_UNAVAILABLE,
      error: error?.message || "Location permission denied or unavailable",
      errorCode: error?.code || "UNAVAILABLE",
    };
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
