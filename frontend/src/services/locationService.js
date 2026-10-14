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
  district:    "Khordha",
  region:      "Odisha",
  country:     "India",
  displayName: "Bhubaneswar, Khordha, Odisha, India (DEMO fallback)",
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
  district:    null,
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

// In-memory cache to prevent Nominatim rate-limiting and duplicate calls
const _reverseGeocodeCache = new Map();

/**
 * clearReverseGeocodeCache
 * Clears the in-memory reverse-geocoding cache (useful for testing).
 */
export function clearReverseGeocodeCache() {
  _reverseGeocodeCache.clear();
}

/**
 * formatLocationHierarchy
 * Formats reverse-geocoded address into "City/Town, District, State, Country".
 * Follows exact priority rules:
 * - Locality: city -> town -> village -> municipality -> hamlet -> suburb -> neighbourhood -> locality
 * - District: state_district -> district -> county -> subdistrict
 * - State: state -> region
 * - Country: country -> country_name -> country_code -> default "India"
 * - Intelligently dedupes repeated values (e.g. Chennai, Chennai -> Chennai)
 *
 * @param {Object} addr - Nominatim address object
 * @returns {string} Formatted display string e.g. "Chittur, Palakkad, Kerala, India"
 */
export function formatLocationHierarchy(addr) {
  if (!addr || typeof addr !== "object") return "";

  // 1. Locality priority: city -> town -> village -> municipality -> hamlet -> suburb/locality
  // If suburb is 'Chittur' and town is compound 'Chittur-Thathamangalam', prefer 'Chittur'
  let locality =
    (addr.suburb && addr.town && addr.town.toLowerCase().includes(addr.suburb.toLowerCase()) ? addr.suburb : null) ??
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    addr.hamlet ??
    addr.suburb ??
    addr.neighbourhood ??
    addr.locality ??
    null;

  // 2. District priority: state_district -> district -> county -> subdistrict
  const districtCandidates = [
    addr.state_district,
    addr.district,
    addr.county,
    addr.subdistrict,
  ].filter(Boolean);

  const normLoc = (locality || "").trim().toLowerCase();
  let rawDistrict = districtCandidates.find((d) => {
    const normD = d.trim().toLowerCase().replace(/\s+district$/i, "");
    if (!normLoc) return true;
    return normD !== normLoc && !normLoc.includes(normD) && !normD.includes(normLoc);
  }) || null;

  const district = rawDistrict ? rawDistrict.replace(/\s+district$/i, "").trim() : null;

  // 3. State: state -> region
  let state = addr.state ?? addr.region ?? null;
  if (state) {
    state = state.replace(/,\s*(?:India|Bharat)$/i, "").trim();
  }

  // 4. Country: country -> country_name -> country_code -> default "India"
  let country = addr.country ?? addr.country_name ?? null;
  if (!country && addr.country_code) {
    country = addr.country_code.toLowerCase() === "in" ? "India" : addr.country_code.toUpperCase();
  }
  if (!country && (state || district || locality)) {
    country = "India";
  }

  // 5. Combine into: City/Town, District, State, Country
  const rawParts = [locality, district, state, country].filter(Boolean);

  // Deduplicate case-insensitively
  const deduped = [];
  for (const part of rawParts) {
    const trimmed = String(part).trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const alreadyExists = deduped.some((existing) => {
      const exLower = existing.toLowerCase();
      return (
        exLower === lower ||
        (exLower.length > 4 && lower.includes(exLower)) ||
        (lower.length > 4 && exLower.includes(lower))
      );
    });
    if (!alreadyExists) {
      deduped.push(trimmed);
    }
  }

  return deduped.join(", ");
}

/**
 * formatLocationString
 * Normalizes an arbitrary location string to include Country and remove duplicate artifacts.
 *
 * @param {string} raw - Raw string e.g. "Chittur, Palakkad, Kerala"
 * @returns {string} Normalized string e.g. "Chittur, Palakkad, Kerala, India"
 */
export function formatLocationString(raw) {
  if (!raw || typeof raw !== "string") return "Location unavailable";
  const trimmed = raw.trim();

  // Status messages pass through as-is
  if (
    trimmed === "Detecting current location…" ||
    trimmed === "Detecting current location..." ||
    trimmed === "Location unavailable" ||
    trimmed === "Location Unavailable" ||
    trimmed === "Location permission required" ||
    trimmed === "Resolving…" ||
    trimmed === "Detecting…" ||
    trimmed === "Resolving GPS coordinates…"
  ) {
    return trimmed;
  }

  // If raw is coordinates or contains coordinates pattern, preserve coordinate text cleanly
  if (/^lat\b|°|\bdeg\b|lon\b/i.test(trimmed) || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Clean raw string
  let cleaned = trimmed
    .replace(/^[📍\s]+/, "") // remove any pin icon
    .replace(/\s*\(DEMO fallback\)/i, "")
    .replace(/\s*\(Simulated\)/i, "")
    .trim();

  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "Location unavailable";

  // Check if country is already included
  const hasCountry = parts.some((p) => /^(India|Bharat)$/i.test(p));
  if (!hasCountry && parts.length > 0) {
    parts.push("India");
  }

  // Deduplicate
  const deduped = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const exists = deduped.some((d) => {
      const dLower = d.toLowerCase();
      return dLower === lower || (dLower.length > 4 && lower.includes(dLower));
    });
    if (!exists) {
      deduped.push(part);
    }
  }

  return deduped.join(", ");
}

/**
 * formatDashboardTopRightLocation
 * Formats the location text according to the required format:
 * City/Town, District, State, Country
 *
 * @param {Object|string} currentLocation - Location object or string
 * @returns {string} Formatted display string e.g. "Chittur, Palakkad, Kerala, India"
 */
export function formatDashboardTopRightLocation(currentLocation) {
  if (!currentLocation) return "Location unavailable";

  const raw = typeof currentLocation === "string" ? currentLocation : currentLocation.name;
  if (
    raw === "Detecting current location…" ||
    raw === "Detecting current location..." ||
    raw === "Location unavailable" ||
    raw === "Location Unavailable" ||
    raw === "Location permission required" ||
    raw === "Resolving…" ||
    raw === "Detecting…" ||
    raw === "Resolving GPS coordinates…"
  ) {
    return raw;
  }

  // If structured address components are available, build hierarchy directly: City/Town, District, State, Country
  if (typeof currentLocation === "object" && currentLocation !== null) {
    const city = currentLocation.city;
    const district = currentLocation.district;
    const state = currentLocation.state || currentLocation.region;
    const country = currentLocation.country;

    if (city || district || state) {
      const formatted = formatLocationHierarchy({
        city,
        state_district: district,
        state,
        country: country || "India",
      });
      if (formatted) return formatted;
    }

    if (currentLocation.displayName) {
      return formatLocationString(currentLocation.displayName);
    }
  }

  if (raw && typeof raw === "string") {
    return formatLocationString(raw);
  }

  return "Location unavailable";
}

/**
 * reverseGeocode
 * Attempts to resolve lat/lon to City/Town, District, State, Country via Nominatim.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{city:string|null, district:string|null, region:string|null, country:string|null, displayName:string}>}
 *   Never rejects — always resolves with the best available data or coordinates label.
 */
export async function reverseGeocode(lat, lon) {
  const numLat = Number(lat);
  const numLon = Number(lon);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return {
      city: null,
      district: null,
      region: null,
      country: null,
      displayName: "Location unavailable",
    };
  }

  const cacheKey = `${numLat.toFixed(3)},${numLon.toFixed(3)}`;
  if (_reverseGeocodeCache.has(cacheKey)) {
    return _reverseGeocodeCache.get(cacheKey);
  }

  const fallback = {
    city: null,
    district: null,
    region: null,
    country: null,
    displayName: `Lat ${numLat.toFixed(4)}°, Lon ${numLon.toFixed(4)}°`,
  };

  console.log(`[SKYRA Location] Reverse-geocoding started for lat=${numLat.toFixed(4)}, lon=${numLon.toFixed(4)}`);

  try {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("lat",            String(numLat));
    url.searchParams.set("lon",            String(numLon));
    url.searchParams.set("format",         "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom",           "18");   // High precision address detail

    const fetchOptions = {
      signal: AbortSignal.timeout(8_000),           // 8s timeout: reliable on mobile networks
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

    // Use canonical City/Town, District, State, Country formatter
    const displayName = formatLocationHierarchy(addr) || fallback.displayName;

    let locality =
      (addr.suburb && addr.town && addr.town.toLowerCase().includes(addr.suburb.toLowerCase()) ? addr.suburb : null) ??
      addr.city ??
      addr.town ??
      addr.village ??
      addr.municipality ??
      addr.hamlet ??
      addr.suburb ??
      addr.neighbourhood ??
      addr.locality ??
      null;

    const districtCandidates = [
      addr.state_district,
      addr.district,
      addr.county,
      addr.subdistrict,
    ].filter(Boolean);

    const normLoc = (locality || "").trim().toLowerCase();
    const rawDistrict = districtCandidates.find((d) => {
      const normD = d.trim().toLowerCase().replace(/\s+district$/i, "");
      if (!normLoc) return true;
      return normD !== normLoc && !normLoc.includes(normD) && !normD.includes(normLoc);
    }) || null;
    const district = rawDistrict ? rawDistrict.replace(/\s+district$/i, "").trim() : null;

    const region = addr.state ?? addr.region ?? null;
    let country = addr.country ?? addr.country_name ?? null;
    if (!country && addr.country_code) {
      country = addr.country_code.toLowerCase() === "in" ? "India" : addr.country_code.toUpperCase();
    }
    if (!country && (region || district || locality)) {
      country = "India";
    }

    const result = {
      city: locality,
      district,
      region,
      country,
      displayName,
    };

    _reverseGeocodeCache.set(cacheKey, result);
    console.log(`[SKYRA Location] Reverse-geocoding success: "${displayName}"`);
    return result;
  } catch (err) {
    console.warn(`[SKYRA Location] Reverse-geocoding failed or timed out (${err?.message || "network error"}), using fallback`);
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
            displayName: geo.displayName || (geo.city ? `${geo.city}${geo.district ? `, ${geo.district}` : ""}${geo.region ? `, ${geo.region}` : ""}, ${geo.country || "India"}` : `Lat ${latitude.toFixed(4)}°, Lon ${longitude.toFixed(4)}°`),
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
