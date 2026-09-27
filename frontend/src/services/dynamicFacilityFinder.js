/**
 * SKYRA – Dynamic Facility Finder Service
 * ────────────────────────────────────────────────────────────────────────────
 * Retrieves real nearby hospitals and emergency facilities using OpenStreetMap
 * Overpass API based on actual GPS coordinates.
 * 
 * Online Mode: Fetches real facilities nearest to GPS/searched location
 * Demo Mode: NOT called (uses hardcoded Chittur resources only)
 * 
 * Architecture:
 *   - Overpass API queries for hospitals within configurable radius
 *   - Caching by coordinate to minimize API calls
 *   - Fallback to shelterHospitalService if no results
 *   - Detects facility type changes and updates immediately
 *   - Respects OSM rate limits and timeout
 */

// ─── Cache Management ──────────────────────────────────────────────────────
// Key: "lat,lon,radius", Value: { hospitals: [...], timestamp }
const _facilityCache = {};

// Cache TTL: 6 hours (facilities don't change rapidly)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Radius for facility search: ~10 km in degrees (~0.1 degrees at equator)
const DEFAULT_SEARCH_RADIUS_DEGREES = 0.15;

// Overpass API endpoint
const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/**
 * getCacheKey
 * Generates cache key from coordinates and radius.
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} radius - search radius in degrees
 * @returns {string} - "lat,lon,radius"
 */
function getCacheKey(latitude, longitude, radius) {
  // Round to 2 decimal places to improve cache hit rate
  const lat = Math.round(latitude * 100) / 100;
  const lon = Math.round(longitude * 100) / 100;
  const rad = Math.round(radius * 100) / 100;
  return `${lat},${lon},${rad}`;
}

/**
 * isCacheFresh
 * Checks if cached facilities are still valid.
 * 
 * @param {string} key
 * @returns {boolean}
 */
function isCacheFresh(key) {
  const cached = _facilityCache[key];
  if (!cached) return false;
  const age = Date.now() - cached.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * parseOverpassResponse
 * Extracts hospital names and coordinates from Overpass API JSON response.
 * 
 * @param {Object} data - Overpass API response
 * @returns {Array<{name, latitude, longitude, type}>}
 */
function parseOverpassResponse(data) {
  const hospitals = [];
  
  if (!data.elements) return hospitals;
  
  for (const element of data.elements) {
    if (!element.tags || !element.tags.name) continue;
    
    let lat, lon;
    
    // Elements can be nodes (direct coords) or ways (center point)
    if (element.type === "node") {
      lat = element.lat;
      lon = element.lon;
    } else if (element.type === "way" && element.center) {
      lat = element.center.lat;
      lon = element.center.lon;
    } else {
      continue;
    }
    
    const hospital = {
      name: element.tags.name,
      latitude: lat,
      longitude: lon,
      type: element.tags.amenity || "hospital", // "hospital", "clinic", "doctors", etc.
      phone: element.tags.phone || null,
      openingHours: element.tags.opening_hours || null,
    };
    
    hospitals.push(hospital);
  }
  
  return hospitals;
}

/**
 * calculateDistance
 * Simple Euclidean distance in degrees (good enough for sorting).
 * 
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in degrees
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

/**
 * buildFacilityName
 * Constructs a human-readable facility name with location context.
 * 
 * @param {Object} facility - { name, latitude, longitude, type, ... }
 * @returns {string} - e.g., "Max Hospital, Sector 18"
 */
function buildFacilityName(facility) {
  // If facility name already contains common descriptors, use as-is
  if (facility.name && facility.name.length < 80) {
    return facility.name;
  }
  
  // If name is too long, truncate
  if (facility.name && facility.name.length > 80) {
    return facility.name.substring(0, 75) + "...";
  }
  
  // Fallback
  return `${facility.type === "hospital" ? "Hospital" : "Medical Facility"} (${facility.latitude.toFixed(2)}, ${facility.longitude.toFixed(2)})`;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

/**
 * fetchNearbyFacilities
 * Queries SKYRA backend proxy for hospitals within radius of coordinates.
 * Returns cached results if fresh.
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} radiusDegrees - search radius (default 0.15 ≈ 10 km)
 * @returns {Promise<Array>} - array of { name, latitude, longitude, type, ... }
 */
export async function fetchNearbyFacilities(latitude, longitude, radiusDegrees = DEFAULT_SEARCH_RADIUS_DEGREES) {
  const key = getCacheKey(latitude, longitude, radiusDegrees);
  
  // Return cached if fresh
  if (isCacheFresh(key)) {
    console.log(`[SKYRA] Returning cached facilities for ${key}`);
    return _facilityCache[key].hospitals;
  }
  
  console.log(`[SKYRA] Fetching nearby facilities via backend proxy for (${latitude}, ${longitude})...`);
  
  try {
    const url = `${API_BASE_URL}/api/facilities/nearby?lat=${latitude}&lon=${longitude}&radius=${radiusDegrees}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) {
      throw new Error(`Facility proxy returned HTTP ${res.status}`);
    }
    
    const data = await res.json();
    let hospitals = Array.isArray(data.facilities) ? data.facilities : [];
    
    if (hospitals.length === 0) {
      console.warn(`[SKYRA] No facilities found via proxy for (${latitude}, ${longitude})`);
      return [];
    }
    
    // Sort by distance from query point
    hospitals.sort((a, b) => {
      const distA = calculateDistance(latitude, longitude, a.latitude, a.longitude);
      const distB = calculateDistance(latitude, longitude, b.latitude, b.longitude);
      return distA - distB;
    });
    
    // Take top 5 results
    hospitals = hospitals.slice(0, 5);
    
    // Cache results
    _facilityCache[key] = {
      hospitals,
      timestamp: Date.now(),
    };
    
    console.log(`[SKYRA] Cached ${hospitals.length} facilities for ${key}`);
    
    return hospitals;
  } catch (err) {
    console.error(`[SKYRA] Failed to fetch facilities from Overpass API: ${err.message}`);
    throw err;
  }
}

/**
 * getNearestHospitalName
 * Gets the name of the nearest hospital for emergency display.
 * Falls back to shelterHospitalService if Overpass fails.
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} locationName - for context
 * @param {Function} fallbackLookup - fallback function (getShelterHospitalByLocation)
 * @returns {Promise<string>}
 */
export async function getNearestHospitalName(latitude, longitude, locationName, fallbackLookup) {
  try {
    const facilities = await fetchNearbyFacilities(latitude, longitude);
    
    if (facilities.length > 0) {
      const nearest = facilities[0];
      const hospitalName = buildFacilityName(nearest);
      console.log(`[SKYRA] Found nearest hospital: ${hospitalName}`);
      return hospitalName;
    }
  } catch (err) {
    console.warn(`[SKYRA] Overpass API failed, falling back to shelterHospitalService: ${err.message}`);
  }
  
  // Fallback to database lookup
  if (fallbackLookup) {
    const result = fallbackLookup(locationName, latitude, longitude);
    return result.nearestHospital;
  }
  
  // Last resort
  return "Check local hospital directory or emergency services";
}

/**
 * getNearestShelterName
 * Gets the name of the nearest shelter (safe building, community center).
 * Falls back to shelterHospitalService if Overpass fails.
 * 
 * Note: Shelters are harder to identify in OSM. We look for specific tags
 * like community centers, schools, government buildings, etc.
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} locationName - for context
 * @param {Function} fallbackLookup - fallback function
 * @returns {Promise<string>}
 */
export async function getNearestShelterName(latitude, longitude, locationName, fallbackLookup) {
  try {
    // Query for potential shelter locations
    const radiusDegrees = DEFAULT_SEARCH_RADIUS_DEGREES;
    const bbox = [
      latitude - radiusDegrees,
      longitude - radiusDegrees,
      latitude + radiusDegrees,
      longitude + radiusDegrees,
    ].join(",");
    
    const query = `
      [bbox:${bbox}];
      (
        node["amenity"="shelter"];
        way["amenity"="shelter"];
        node["amenity"="community_centre"];
        way["amenity"="community_centre"];
        node["building"="civic"];
        way["building"="civic"];
        node["amenity"="school"];
        way["amenity"="school"];
      );
      out center;
    `;
    
    const res = await fetch(OVERPASS_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) {
      throw new Error(`Overpass API returned ${res.status}`);
    }
    
    const data = await res.json();
    let shelters = parseOverpassResponse(data);
    
    if (shelters.length > 0) {
      // Sort by distance
      shelters.sort((a, b) => {
        const distA = calculateDistance(latitude, longitude, a.latitude, a.longitude);
        const distB = calculateDistance(latitude, longitude, b.latitude, b.longitude);
        return distA - distB;
      });
      
      const nearest = shelters[0];
      const shelterName = buildFacilityName(nearest);
      console.log(`[SKYRA] Found nearest shelter: ${shelterName}`);
      return shelterName;
    }
  } catch (err) {
    console.warn(`[SKYRA] Shelter search failed: ${err.message}`);
  }
  
  // Fallback to database lookup
  if (fallbackLookup) {
    const result = fallbackLookup(locationName, latitude, longitude);
    return result.nearestShelter;
  }
  
  // Last resort
  return "Check local civic authority or municipality office";
}

/**
 * clearFacilityCache
 * Clears all cached facilities (useful for testing or manual refresh).
 */
export function clearFacilityCache() {
  Object.keys(_facilityCache).forEach(key => delete _facilityCache[key]);
  console.log("[SKYRA] Facility cache cleared");
}

/**
 * getFacilityCacheStats
 * Returns information about cached facilities.
 * 
 * @returns {Object} - { locations: number, oldestCache: ms, newestCache: ms }
 */
export function getFacilityCacheStats() {
  const keys = Object.keys(_facilityCache);
  if (keys.length === 0) {
    return { locations: 0, oldestCache: null, newestCache: null };
  }
  
  const timestamps = keys.map(k => _facilityCache[k].timestamp);
  return {
    locations: keys.length,
    oldestCache: Math.min(...timestamps),
    newestCache: Math.max(...timestamps),
    keys: keys.slice(0, 5).join("; "),
  };
}
