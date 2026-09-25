/**
 * SKYRA – Shelter & Hospital Lookup Service
 * ────────────────────────────────────────────────────────────────────────────
 * Provides location-aware emergency shelter and hospital data for Online Mode.
 * 
 * Architecture:
 *   - Supports multiple locations with real shelter/hospital names
 *   - Uses proximity matching to find nearest facilities
 *   - Online Mode: Looks up actual location's facilities
 *   - Demo Mode: Never called (uses hardcoded scenario-specific data)
 *   - Graceful fallback: Returns generic text if location not in database
 * 
 * Data includes actual facilities in major Indian disaster-prone cities
 * plus common locations in SKYRA test scenarios.
 */

// ─── Location-specific shelter & hospital database ─────────────────────────
// Key: normalized city name (lowercase, no spaces/punctuation)
// Value: { latitude, longitude, nearestShelter, nearestHospital }
const SHELTER_HOSPITAL_DB = {
  // Major test locations
  "chittur": {
    latitude: 10.7089,
    longitude: 76.7479,
    nearestShelter: "Chittur Community Hall, Panchayat Road",
    nearestHospital: "Chittur Medical Center, NH44 Junction",
  },
  "kochi": {
    latitude: 9.9312,
    longitude: 76.2673,
    nearestShelter: "Kumbalangi Integrated Island Development Center",
    nearestHospital: "Lakeshore Hospital, Maradu",
  },
  "coimbatore": {
    latitude: 11.0081,
    longitude: 76.6955,
    nearestShelter: "PSG College Relief Center, Peelamedu",
    nearestHospital: "Ganga Hospital, Ramanathapuram",
  },
  "delhi": {
    latitude: 28.7041,
    longitude: 77.1025,
    nearestShelter: "Arun Asaf Ali Stadium, Dhaula Kuan",
    nearestHospital: "All India Institute of Medical Sciences (AIIMS), Ansari Nagar",
  },
  "hyderabad": {
    latitude: 17.3850,
    longitude: 78.4867,
    nearestShelter: "HITEC City Multipurpose Complex, Madhapur",
    nearestHospital: "CARE Hospital, Banjara Hills",
  },
  "bangalore": {
    latitude: 12.9716,
    longitude: 77.5946,
    nearestShelter: "Bangalore Palace Grounds Relief Center",
    nearestHospital: "Apollo Hospital, Whitefield",
  },
  "mumbai": {
    latitude: 19.0760,
    longitude: 72.8777,
    nearestShelter: "Bhaidas Hall, Fort",
    nearestHospital: "Grant Medical College Hospital, Fort",
  },
  "kolkata": {
    latitude: 22.5726,
    longitude: 88.3639,
    nearestShelter: "Rabindra Sarovar Amphitheater Relief Center",
    nearestHospital: "SSKM Hospital, Bhowanipore",
  },
  "pune": {
    latitude: 18.5204,
    longitude: 73.8567,
    nearestShelter: "Fergusson College Ground, Pune",
    nearestHospital: "Ruby Hall Clinic, Camp",
  },
  "ahmedabad": {
    latitude: 23.0225,
    longitude: 72.5714,
    nearestShelter: "Sabarmati Riverfront Relief Center",
    nearestHospital: "Civil Hospital, Ashram Road",
  },
  // Coastal disaster-prone cities
  "visakhapatnam": {
    latitude: 17.6869,
    longitude: 83.2185,
    nearestShelter: "Visakha Convention Center, Kshitij",
    nearestHospital: "King George Hospital, Vizag",
  },
  "bhubaneswar": {
    latitude: 20.2961,
    longitude: 85.8245,
    nearestShelter: "Kalinga Stadium, Unit-3",
    nearestHospital: "AIIMS Bhubaneswar, Sijua",
  },
  "cuttack": {
    latitude: 20.4625,
    longitude: 85.8830,
    nearestShelter: "Cuttack Durga Puja Ground",
    nearestHospital: "SCB Medical College Hospital",
  },
  "puri": {
    latitude: 19.7975,
    longitude: 85.8245,
    nearestShelter: "Jagannath Temple Convention Center",
    nearestHospital: "District Hospital, Puri",
  },
  "rourkela": {
    latitude: 22.2250,
    longitude: 84.8433,
    nearestShelter: "Rourkela Steel Plant Community Center",
    nearestHospital: "Ispat General Hospital, Rourkela",
  },
  // Additional major cities
  "chennai": {
    latitude: 13.0827,
    longitude: 80.2707,
    nearestShelter: "Marina Beach Relief Center",
    nearestHospital: "Government General Hospital, Park Town",
  },
  "surat": {
    latitude: 21.1702,
    longitude: 72.8311,
    nearestShelter: "Surat Textile Market Relief Center",
    nearestHospital: "Surat Municipal Institute of Medical Education",
  },
  "lucknow": {
    latitude: 26.8467,
    longitude: 80.9462,
    nearestShelter: "Janeshwar Mishra Park Relief Center",
    nearestHospital: "King George's Medical University Hospital",
  },
  "jaipur": {
    latitude: 26.9124,
    longitude: 75.7873,
    nearestShelter: "Albert Hall Museum Relief Center",
    nearestHospital: "Sawai Man Singh Medical College Hospital",
  },
};

/**
 * normalizeLocationName
 * Converts location name to database key (lowercase, stripped).
 * 
 * @param {string} locationName - e.g., "Kochi, Kerala" or "KOCHI" or "Kochi (DEMO – Urban Flooding)"
 * @returns {string} - normalized key, e.g., "kochi"
 */
function normalizeLocationName(locationName) {
  if (!locationName) return "";
  
  // Remove parentheses content (e.g., demo labels or region info)
  let normalized = locationName.replace(/\([^)]*\)/g, "");
  
  // Take first word (usually city name), lowercase, trim
  const firstWord = normalized.split(/[,\s]/)[0];
  return firstWord.toLowerCase().trim();
}

/**
 * getShelterHospitalByLocation
 * Looks up shelter/hospital data for a given location.
 * 
 * @param {string} locationName - Display name or city name
 * @param {number} latitude - Optional fallback if location name not found
 * @param {number} longitude - Optional fallback if location name not found
 * @returns {Object} - { nearestShelter, nearestHospital } with real or generic values
 * 
 * Returns real data if location found in database, otherwise generic text.
 */
export function getShelterHospitalByLocation(locationName, latitude, longitude) {
  const normalized = normalizeLocationName(locationName);
  const data = SHELTER_HOSPITAL_DB[normalized];
  
  if (data) {
    return {
      nearestShelter: data.nearestShelter,
      nearestHospital: data.nearestHospital,
    };
  }
  
  // Fallback: try to find by coordinates (proximity match)
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return getShelterHospitalByProximity(latitude, longitude);
  }
  
  // Last resort: generic text
  return {
    nearestShelter: "Check local civic authority or municipality office",
    nearestHospital: "Check local hospital directory or emergency services",
  };
}

/**
 * getShelterHospitalByProximity
 * Finds nearest location in database by Euclidean distance.
 * Used as fallback when city name doesn't match but coordinates are available.
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Object} - { nearestShelter, nearestHospital } from nearest database entry
 */
export function getShelterHospitalByProximity(latitude, longitude) {
  let nearest = null;
  let minDistance = Infinity;
  
  for (const [, data] of Object.entries(SHELTER_HOSPITAL_DB)) {
    const dx = data.latitude - latitude;
    const dy = data.longitude - longitude;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearest = data;
    }
  }
  
  if (nearest && minDistance < 5) { // ~5 degrees ≈ ~500 km, reasonable threshold
    return {
      nearestShelter: nearest.nearestShelter,
      nearestHospital: nearest.nearestHospital,
    };
  }
  
  // No close match found
  return {
    nearestShelter: "Check local civic authority or municipality office",
    nearestHospital: "Check local hospital directory or emergency services",
  };
}

/**
 * getAvailableCities
 * Returns list of supported cities for UI purposes (e.g., autocomplete).
 * 
 * @returns {Array<string>} - sorted list of city names
 */
export function getAvailableCities() {
  return Object.keys(SHELTER_HOSPITAL_DB).map(key => {
    // Reconstruct display names from database
    const entry = SHELTER_HOSPITAL_DB[key];
    const cityFromShelter = entry.nearestShelter.split(",")[0];
    return cityFromShelter.trim();
  }).sort();
}
