/**
 * SKYRA – Offline Evacuation Intelligence Service (Phase 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates direct evacuation vectors, identifies designated regional
 * evacuation corridors, and generates safety assessments for shelters & hospitals.
 *
 * SAFETY MANDATES:
 *   • NEVER label any route as "SAFE" or "GUARANTEED". Real-time road hazards,
 *     debris, fallen wires, and dynamic water depth cannot be validated offline.
 *   • Labels are strictly: "CAUTION ADVISED", "ELEVATED HAZARD EXPOSURE", or
 *     "UNVERIFIED CORRIDOR (Straight-line vector only)".
 *   • Clearly exposes data source, licensing, and observation timestamps.
 */

import { EVACUATION_CORRIDORS } from "../data/evacuationCorridors.js";

const CARDINAL_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/**
 * Calculates compass bearing from point A to point B in degrees (0-360).
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);

  const bearing = ((theta * 180) / Math.PI + 360) % 360;
  const index = Math.round(bearing / 22.5) % 16;

  return {
    bearingDegrees: Math.round(bearing),
    cardinal: CARDINAL_POINTS[index],
  };
}

/**
 * Calculates Great Circle distance between two points in kilometers.
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Formats distance in km or meters.
 */
export function formatEvacuationDistance(distanceKm) {
  if (distanceKm == null || isNaN(distanceKm)) return "—";
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Finds a designated regional evacuation corridor for a facility or region.
 */
export function findDesignatedCorridor(facilityId, originCoords = null) {
  if (!facilityId && !originCoords) return null;

  if (facilityId) {
    const directMatch = EVACUATION_CORRIDORS.find((c) => c.primaryShelterId === facilityId);
    if (directMatch) return directMatch;
  }

  if (originCoords && Array.isArray(originCoords)) {
    const [lat, lon] = originCoords;
    let closestCorridor = null;
    let minDistance = Infinity;

    for (const c of EVACUATION_CORRIDORS) {
      if (c.waypoints && c.waypoints.length > 0) {
        const startWp = c.waypoints[0];
        const dist = calculateHaversineDistanceKm(lat, lon, startWp.lat, startWp.lon);
        if (dist < minDistance && dist < 35) { // within 35 km radius
          minDistance = dist;
          closestCorridor = c;
        }
      }
    }
    return closestCorridor;
  }

  return null;
}

/**
 * Generates an explainable, safety-certified Evacuation Assessment.
 *
 * @param {Object} options
 * @param {Array<number>} options.origin - [latitude, longitude] of user/monitored point
 * @param {Object} options.facility - Target shelter or hospital
 * @param {Object} [options.weather] - Current or cached weather conditions
 * @param {Object} [options.terrain] - Terrain elevation and slope
 * @param {boolean} [options.isOffline] - Whether device is in offline mode
 */
export function assessEvacuationRoute({
  origin,
  facility,
  weather = null,
  terrain = null,
  isOffline = false,
}) {
  if (!origin || !facility || facility.latitude == null || facility.longitude == null) {
    return {
      status: "INVALID_PARAMETERS",
      safetyNotice: "Origin and destination coordinates are required for evacuation assessment.",
    };
  }

  const [originLat, originLon] = origin;
  const destLat = Number(facility.latitude);
  const destLon = Number(facility.longitude);

  const directDistanceKm = calculateHaversineDistanceKm(originLat, originLon, destLat, destLon);
  const { bearingDegrees, cardinal } = calculateBearing(originLat, originLon, destLat, destLon);

  // Transit time estimates under disaster transit conditions
  // Walking: ~3.5 km/h with basic pack; Vehicle: ~20 km/h in restricted disaster traffic
  const estimatedWalkMin = Math.round((directDistanceKm / 3.5) * 60);
  const estimatedDriveMin = Math.round((directDistanceKm / 20.0) * 60);

  const matchingCorridor = findDesignatedCorridor(facility.id, origin);

  // Environmental hazard checks
  const rainfall = Number(weather?.rainfall ?? weather?.rain ?? 0);
  const windSpeed = Number(weather?.wind ?? weather?.windSpeed ?? 0);
  const slope = Number(terrain?.slope ?? 0);

  const hazardFactors = [];
  if (rainfall >= 30) {
    hazardFactors.push(`Intense precipitation (${rainfall} mm/h): Flash flood risk, surface waterlogging and culvert inundation likely.`);
  } else if (rainfall >= 15) {
    hazardFactors.push(`Moderate rainfall (${rainfall} mm/h): Road surfaces wet, visibility reduced.`);
  }

  if (windSpeed >= 50) {
    hazardFactors.push(`High wind gusts (${windSpeed} km/h): Risk of flying debris, uprooted trees, and damaged overhead cables.`);
  }

  if (slope >= 18) {
    hazardFactors.push(`Steep terrain slope (${slope}°): Escarpment exposure, potential slope instability in saturated soil.`);
  }

  let routeCategory = "UNVERIFIED_CORRIDOR";
  let routeLabel = "UNVERIFIED EVACUATION PATH";
  let roadDataStatus = "STRAIGHT_LINE_ONLY";
  let mapPolyline = [
    [originLat, originLon],
    [destLat, destLon],
  ];

  if (matchingCorridor) {
    routeCategory = hazardFactors.length > 0 ? "ELEVATED_HAZARD_CORRIDOR" : "DESIGNATED_CORRIDOR_CAUTION";
    routeLabel = hazardFactors.length > 0 ? "DESIGNATED CORRIDOR — ELEVATED HAZARD" : "DESIGNATED CORRIDOR (CAUTION ADVISED)";
    roadDataStatus = "CACHED_DESIGNATED_CORRIDOR";
    mapPolyline = matchingCorridor.waypoints.map((wp) => [wp.lat, wp.lon]);
  } else {
    routeCategory = "UNVERIFIED_STRAIGHT_LINE";
    routeLabel = "UNVERIFIED DIRECT BEARING (CAUTION)";
    roadDataStatus = "OFFLINE_ROAD_GRAPH_UNAVAILABLE";
  }

  // Mandatory Safety Notice strictly forbidding "SAFE" label
  const safetyDisclaimer =
    "STRICT SAFETY NOTICE: Offline maps cannot verify live bridge integrity, road washouts, downed electrical cables, or flash flood depth. NEVER label any path safe without on-site emergency confirmation. If you encounter moving water, TURN AROUND, DON'T DROWN.";

  const criticalChecklist = [
    "Switch off main household electrical breaker and LPG gas cylinder valve before evacuating.",
    "Carry your 72-hour waterproof survival kit (drinking water, medicines, torch, dry food, whistle).",
    "Wear sturdy, closed-toe footwear. Never walk barefoot or in open sandals through flood debris.",
    "Do NOT drive through flooded roads: 30 cm of moving water can float a passenger vehicle.",
    "Stay clear of all fallen or dangling wires; assume all downed powerlines are live and lethal.",
    `Confirm shelter occupancy with local emergency authority via helpline ${facility.phone || "112 / 1077"}.`,
  ];

  return {
    facility: {
      id: facility.id,
      name: facility.name,
      type: facility.type,
      address: facility.address || "Designated Emergency Facility",
      phone: facility.phone || "112",
      capacity: facility.capacity || null,
      authority: facility.authority || "State Disaster Management Authority",
      amenities: facility.amenities || ["Emergency Shelter", "First Aid Support"],
    },
    routeMetrics: {
      directDistanceKm,
      formattedDistance: formatEvacuationDistance(directDistanceKm),
      bearingDegrees,
      cardinalDirection: cardinal,
      estimatedWalkMin,
      estimatedDriveMin,
    },
    corridor: matchingCorridor
      ? {
          id: matchingCorridor.id,
          name: matchingCorridor.name,
          roadType: matchingCorridor.roadType,
          elevationProfile: matchingCorridor.elevationProfile,
          floodVulnerability: matchingCorridor.floodVulnerability,
          sourceAuthority: matchingCorridor.sourceAuthority,
          sourceLicense: matchingCorridor.sourceLicense,
          verifiedDate: matchingCorridor.verifiedDate,
          totalDistanceKm: matchingCorridor.totalDistanceKm,
        }
      : null,
    status: {
      routeCategory,
      routeLabel,
      roadDataStatus,
      isOffline,
      dataSource: matchingCorridor
        ? `${matchingCorridor.sourceAuthority} (${matchingCorridor.sourceLicense})`
        : "Direct Geospatial Calculation (Straight-line vector)",
      timestamp: new Date().toISOString(),
    },
    mapPolyline,
    hazardFactors,
    safetyDisclaimer,
    criticalChecklist,
  };
}
