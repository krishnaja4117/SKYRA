/**
 * SKYRA – Frontend Geospatial Service (Phase 11)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides centralized geospatial context, terrain elevation/slope,
 * IMD radar surveillance information, and real emergency facilities for
 * the Intelligent Risk Map.
 *
 * Guarantees:
 *   • Strictly validates geographic coordinates.
 *   • Never fabricates hazard boundaries, flood polygons, or synthetic radiuses.
 *   • Gracefully degrades if backend geospatial endpoints or Overpass API fail.
 *   • Completely stateless and free of hardcoded city fallbacks.
 */

import { fetchNearbyFacilities } from "./dynamicFacilityFinder";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

function getApiUrl(path) {
  const base = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:5000");
  return new URL(path, base);
}

/**
 * Validates coordinate inputs within terrestrial boundaries.
 */
export function isValidCoordinate(lat, lon) {
  if (lat == null || lon == null) return false;
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return false;
  if (nLat < -90 || nLat > 90) return false;
  if (nLon < -180 || nLon > 180) return false;
  return true;
}

/**
 * Formats a metric distance nicely for display.
 */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  const num = Number(km);
  if (num < 1) {
    return `${Math.round(num * 1000)} m`;
  }
  return `${num.toFixed(1)} km`;
}

/**
 * Fetches server-side geospatial context (terrain & IMD radar coverage).
 *
 * @param {Object} params
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<Object>}
 */
export async function fetchGeospatialContext({ latitude, longitude, signal } = {}) {
  if (!isValidCoordinate(latitude, longitude)) {
    return {
      available: false,
      location: null,
      terrain: { available: false, elevation: null, slope: null },
      radar: { available: false, nearestStation: null, distanceKm: null, withinCoverage: false, stations: [] },
      error: "Coordinates required",
    };
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  try {
    const url = getApiUrl("/api/geospatial/context");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: signal || AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      available: true,
      location: data.location || { latitude: lat, longitude: lon },
      terrain: data.terrain || { available: false, elevation: null, slope: null },
      radar: data.radar || { available: false, nearestStation: null, distanceKm: null, withinCoverage: false, stations: [] },
      error: null,
    };
  } catch (err) {
    console.warn("[geospatialService] Failed to fetch geospatial context:", err.message);
    return {
      available: false,
      location: { latitude: lat, longitude: lon },
      terrain: { available: false, elevation: null, slope: null, error: "Terrain data temporarily unavailable" },
      radar: { available: false, nearestStation: null, distanceKm: null, withinCoverage: false, stations: [], error: "Radar data temporarily unavailable" },
      error: err.message,
    };
  }
}

/**
 * Fetches real nearby emergency facilities (hospitals and shelters)
 * using the verified OSM Overpass API integration.
 *
 * @param {Object} params
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @returns {Promise<{ facilities: Array, available: boolean, error: string|null }>}
 */
export async function fetchEmergencyFacilitiesSafe({ latitude, longitude } = {}) {
  if (!isValidCoordinate(latitude, longitude)) {
    return { facilities: [], available: false, error: "Invalid coordinates" };
  }

  try {
    const facilities = await fetchNearbyFacilities(Number(latitude), Number(longitude));
    return {
      facilities: Array.isArray(facilities) ? facilities : [],
      available: true,
      error: null,
    };
  } catch (err) {
    console.warn("[geospatialService] Emergency facilities lookup unavailable:", err.message);
    return {
      facilities: [],
      available: false,
      error: "Emergency facility data temporarily unavailable",
    };
  }
}
