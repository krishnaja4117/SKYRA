import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBearing,
  calculateHaversineDistanceKm,
  formatEvacuationDistance,
  findDesignatedCorridor,
  assessEvacuationRoute,
} from "./evacuationService.js";

test("Evacuation Service - Bearing calculation returns degrees and correct cardinal points", () => {
  // Directly north
  const north = calculateBearing(10.0, 76.0, 11.0, 76.0);
  assert.equal(north.bearingDegrees, 0);
  assert.equal(north.cardinal, "N");

  // Directly east
  const east = calculateBearing(10.0, 76.0, 10.0, 77.0);
  assert.equal(east.bearingDegrees, 90);
  assert.equal(east.cardinal, "E");

  // Directly south
  const south = calculateBearing(10.0, 76.0, 9.0, 76.0);
  assert.equal(south.bearingDegrees, 180);
  assert.equal(south.cardinal, "S");

  // Directly west
  const west = calculateBearing(10.0, 76.0, 10.0, 75.0);
  assert.equal(west.bearingDegrees, 270);
  assert.equal(west.cardinal, "W");
});

test("Evacuation Service - Haversine distance calculation is accurate", () => {
  // Palakkad (10.7867, 76.6548) to Chittur (10.7042, 76.7441) is ~13.5 km
  const dist = calculateHaversineDistanceKm(10.7867, 76.6548, 10.7042, 76.7441);
  assert.ok(dist > 12 && dist < 15, `Expected distance ~13.5 km, got ${dist}`);

  // Zero distance
  assert.equal(calculateHaversineDistanceKm(10.0, 76.0, 10.0, 76.0), 0);
});

test("Evacuation Service - Distance formatting handles meters and kilometers", () => {
  assert.equal(formatEvacuationDistance(0.45), "450 m");
  assert.equal(formatEvacuationDistance(3.72), "3.7 km");
  assert.equal(formatEvacuationDistance(null), "—");
});

test("Evacuation Service - Finds designated regional corridor by shelter ID and proximity", () => {
  // Palakkad Victoria College shelter ID
  const corridor = findDesignatedCorridor("ksdma-palakkad-03");
  assert.ok(corridor != null, "Expected designated corridor for Victoria College");
  assert.equal(corridor.region, "palakkad_kerala");
  assert.ok(corridor.waypoints.length >= 3);

  // By proximity in Palakkad
  const proxCorridor = findDesignatedCorridor(null, [10.71, 76.74]);
  assert.ok(proxCorridor != null, "Expected proximity corridor match in Chittur");
});

test("Evacuation Service - STRICT SAFETY: Never labels any route as SAFE or GUARANTEED", () => {
  const assessment = assessEvacuationRoute({
    origin: [10.7867, 76.6548],
    facility: {
      id: "ksdma-palakkad-03",
      name: "Victoria College Relief Camp",
      type: "SHELTER",
      latitude: 10.7816,
      longitude: 76.6528,
    },
    weather: { rainfall: 0, wind: 5 },
    terrain: { slope: 2 },
    isOffline: true,
  });

  // Verify status label strictly contains caution/assessment, never "SAFE ROUTE"
  assert.ok(!assessment.status.routeLabel.includes("SAFE ROUTE"), "Route label must NOT claim to be safe");
  assert.ok(!assessment.status.routeCategory.includes("SAFE"), "Route category must NOT contain SAFE");
  assert.ok(assessment.safetyDisclaimer.includes("STRICT SAFETY NOTICE"));
  assert.ok(assessment.safetyDisclaimer.includes("TURN AROUND, DON'T DROWN"));
});

test("Evacuation Service - Hazard detection flags intense rainfall and steep slope", () => {
  const severeAssessment = assessEvacuationRoute({
    origin: [10.7867, 76.6548],
    facility: {
      id: "ksdma-palakkad-03",
      name: "Victoria College Relief Camp",
      latitude: 10.7816,
      longitude: 76.6528,
    },
    weather: { rainfall: 45, wind: 65 },
    terrain: { slope: 22 },
    isOffline: true,
  });

  assert.ok(severeAssessment.hazardFactors.length >= 3, "Expected rainfall, wind, and slope hazard factors");
  assert.ok(severeAssessment.status.routeCategory.includes("ELEVATED_HAZARD"));
  assert.ok(severeAssessment.hazardFactors.some((h) => h.toLowerCase().includes("flash flood")));
  assert.ok(severeAssessment.hazardFactors.some((h) => h.toLowerCase().includes("steep terrain slope")));
});

test("Evacuation Service - Falls back to straight line when road graph unavailable", () => {
  const unmappedAssessment = assessEvacuationRoute({
    origin: [26.0, 91.0], // Arbitrary coordinates without regional corridor
    facility: {
      id: "random-shelter-99",
      name: "Remote Forest Outpost",
      latitude: 26.05,
      longitude: 91.05,
    },
    weather: null,
    terrain: null,
    isOffline: true,
  });

  assert.equal(unmappedAssessment.status.roadDataStatus, "OFFLINE_ROAD_GRAPH_UNAVAILABLE");
  assert.ok(unmappedAssessment.status.routeCategory.includes("UNVERIFIED"));
  assert.equal(unmappedAssessment.mapPolyline.length, 2); // straight line from origin to dest
});
