/**
 * SKYRA – Backend City & Location Resolution Service (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves named Indian cities and geographic entities from conversational
 * queries into precise WGS-84 coordinates without external geocoding dependencies.
 */

const MAJOR_INDIAN_CITIES = Object.freeze([
  { name: "Chennai", aliases: ["chennai", "madras"], latitude: 13.0827, longitude: 80.2707, state: "Tamil Nadu" },
  { name: "Mumbai", aliases: ["mumbai", "bombay"], latitude: 18.9388, longitude: 72.8354, state: "Maharashtra" },
  { name: "Delhi", aliases: ["delhi", "new delhi", "ncr"], latitude: 28.6139, longitude: 77.2090, state: "Delhi" },
  { name: "Kolkata", aliases: ["kolkata", "calcutta"], latitude: 22.5726, longitude: 88.3639, state: "West Bengal" },
  { name: "Bengaluru", aliases: ["bengaluru", "bangalore"], latitude: 12.9716, longitude: 77.5946, state: "Karnataka" },
  { name: "Hyderabad", aliases: ["hyderabad", "secunderabad"], latitude: 17.3850, longitude: 78.4867, state: "Telangana" },
  { name: "Puri", aliases: ["puri"], latitude: 19.8135, longitude: 85.8312, state: "Odisha" },
  { name: "Cuttack", aliases: ["cuttack"], latitude: 20.4625, longitude: 85.8828, state: "Odisha" },
  { name: "Bhubaneswar", aliases: ["bhubaneswar", "bbsr"], latitude: 20.2961, longitude: 85.8245, state: "Odisha" },
  { name: "Ahmedabad", aliases: ["ahmedabad", "amdavad"], latitude: 23.0225, longitude: 72.5714, state: "Gujarat" },
  { name: "Kochi", aliases: ["kochi", "cochin"], latitude: 9.9312, longitude: 76.2673, state: "Kerala" },
  { name: "Guwahati", aliases: ["guwahati", "gauhati"], latitude: 26.1445, longitude: 91.7362, state: "Assam" },
  { name: "Visakhapatnam", aliases: ["visakhapatnam", "vizag"], latitude: 17.6868, longitude: 83.2185, state: "Andhra Pradesh" },
  { name: "Patna", aliases: ["patna"], latitude: 25.5941, longitude: 85.1376, state: "Bihar" },
  { name: "Jaipur", aliases: ["jaipur"], latitude: 26.9124, longitude: 75.7873, state: "Rajasthan" },
  { name: "Pune", aliases: ["pune", "poona"], latitude: 18.5204, longitude: 73.8567, state: "Maharashtra" },
]);

/**
 * Resolves a city name mentioned in a conversational query to coordinates.
 *
 * @param {string} text - Query text
 * @returns {{ name: string, latitude: number, longitude: number, state: string }|null}
 */
function resolveCoordinatesForCity(text) {
  if (!text || typeof text !== "string") return null;

  const normalized = text.toLowerCase();

  for (const city of MAJOR_INDIAN_CITIES) {
    for (const alias of city.aliases) {
      // Word boundary match
      const regex = new RegExp(`\\b${alias}\\b`, "i");
      if (regex.test(normalized)) {
        return {
          name: city.name,
          latitude: city.latitude,
          longitude: city.longitude,
          state: city.state,
        };
      }
    }
  }

  return null;
}

module.exports = {
  resolveCoordinatesForCity,
  MAJOR_INDIAN_CITIES,
};
