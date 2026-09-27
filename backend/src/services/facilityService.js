/**
 * SKYRA – Server-Side Emergency Facilities Ingestion Service (Phase 8 & 11)
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxies and caches queries to OpenStreetMap Overpass API for nearby hospitals,
 * trauma centers, and emergency clinics.
 *
 * Guarantees:
 *   • Server-side execution: Eliminates client browser CORS issues and leaks.
 *   • In-memory TTL Cache (6 hours): Prevents excessive upstream Overpass load.
 *   • Strict 8-second AbortController timeout: Never hangs backend event loop.
 *   • Graceful degradation: Returns empty array and diagnostic status if Overpass 429s.
 *   • Bounded spatial radius: Defaults to 0.15 degrees (~10-15 km).
 */

const { validateCoordinates } = require("./weatherService");

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_RADIUS_DEGREES = 0.15;
const REQUEST_TIMEOUT_MS = 8000;

// Key: "lat,lon,radius", Value: { facilities: [...], timestamp: number }
const _facilityCache = new Map();

function getCacheKey(lat, lon, radius) {
  const roundLat = Math.round(Number(lat) * 100) / 100;
  const roundLon = Math.round(Number(lon) * 100) / 100;
  const roundRad = Math.round(Number(radius) * 100) / 100;
  return `${roundLat},${roundLon},${roundRad}`;
}

function parseOverpassElements(elements = []) {
  const facilities = [];
  for (const el of elements) {
    if (!el || !el.tags || !el.tags.name) continue;

    let lat = null;
    let lon = null;

    if (el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number") {
      lat = el.lat;
      lon = el.lon;
    } else if (el.type === "way" && el.center && typeof el.center.lat === "number" && typeof el.center.lon === "number") {
      lat = el.center.lat;
      lon = el.center.lon;
    }

    if (lat === null || lon === null) continue;

    facilities.push({
      name: String(el.tags.name).trim(),
      latitude: lat,
      longitude: lon,
      type: el.tags.amenity || "hospital",
      phone: el.tags.phone || el.tags["contact:phone"] || null,
      openingHours: el.tags.opening_hours || null,
    });
  }
  return facilities;
}

/**
 * Fetches nearby emergency medical facilities from Overpass or cache.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} [radiusDegrees=0.15]
 * @returns {Promise<{facilities: Array, cached: boolean, status: string}>}
 */
async function fetchNearbyFacilities(latitude, longitude, radiusDegrees = DEFAULT_RADIUS_DEGREES) {
  const coords = validateCoordinates(latitude, longitude);
  const rad = Math.min(Math.max(Number(radiusDegrees) || DEFAULT_RADIUS_DEGREES, 0.02), 0.5);

  const cacheKey = getCacheKey(coords.latitude, coords.longitude, rad);
  const cached = _facilityCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return {
      facilities: cached.facilities,
      cached: true,
      status: "ok",
      count: cached.facilities.length,
    };
  }

  const south = coords.latitude - rad;
  const west = coords.longitude - rad;
  const north = coords.latitude + rad;
  const east = coords.longitude + rad;
  const bbox = `${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)}`;

  const query = `
    [out:json][timeout:8];
    (
      node["amenity"="hospital"](${bbox});
      way["amenity"="hospital"](${bbox});
      node["amenity"="clinic"](${bbox});
      way["amenity"="clinic"](${bbox});
    );
    out center;
  `;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(OVERPASS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SKYRA-DisasterIntelligence/2.0 (SIH-26068)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[facilityService] Overpass API responded with HTTP ${response.status}`);
      return {
        facilities: cached?.facilities || [],
        cached: false,
        status: response.status === 429 ? "rate_limited" : "upstream_error",
        count: (cached?.facilities || []).length,
      };
    }

    const data = await response.json();
    const facilities = parseOverpassElements(data.elements || []);

    _facilityCache.set(cacheKey, {
      facilities,
      timestamp: Date.now(),
    });

    return {
      facilities,
      cached: false,
      status: "ok",
      count: facilities.length,
    };
  } catch (err) {
    console.warn(`[facilityService] Failed to query Overpass API: ${err.message}`);
    return {
      facilities: cached?.facilities || [],
      cached: false,
      status: err.name === "AbortError" ? "timeout" : "network_error",
      count: (cached?.facilities || []).length,
      diagnosticMessage: err.message,
    };
  }
}

module.exports = {
  fetchNearbyFacilities,
  _facilityCache,
};
