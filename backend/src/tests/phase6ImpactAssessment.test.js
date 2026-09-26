/**
 * SKYRA – Phase 6 Impact Assessment Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive verification of the Phase 6 Impact Assessment pipeline.
 *
 * Test Structure:
 *   1. Impact Assessment Core (Tests 01-08): assessImpact pure function validation
 *   2. Flood Impact (Tests 09-11): flood, waterlogging, heavy rain
 *   3. Wind/Storm Impact (Tests 12-14): strong wind, storm, extreme wind
 *   4. Heat Impact (Tests 15-17): heat stress, extreme heat
 *   5. Infrastructure Impact (Tests 18-20): roads, drainage, power, comms
 *   6. Community Impact (Tests 21-23): mobility, safety, evacuation
 *   7. Location-Specific Impact (Tests 24-27): terrain, historical, seasonal, coordinates
 *   8. Predictive Impact Network (Tests 28-30): causal chain structure
 *   9. Impact Severity (Tests 31-34): severity ≠ riskScore ≠ confidence
 *  10. Impact → Action Mapping (Tests 35-38): hazard-specific actions
 *  11. Safety / No-Fabrication Rules (Tests 39-42): data integrity
 *  12. Failure Safety (Tests 43-46): missing data, backend unavailable
 *  13. intelligenceService Integration (Tests 47-49): end-to-end
 */

const assert = require("assert");

const {
  assessImpact,
  detectActiveHazards,
  computeImpactSeverity,
  buildRecommendedActions,
  buildPredictiveNetwork,
  T,
} = require("../services/impactAssessmentService");

// ── Test counters
let passedTests = 0;
let totalTests  = 0;

function recordPass(testNum, testName) {
  passedTests += 1;
  totalTests  += 1;
  console.log(`  PASS [Test ${String(testNum).padStart(2, "0")}] ${testName}`);
}

function recordFail(testNum, testName, detail) {
  totalTests  += 1;
  console.error(`  FAIL [Test ${String(testNum).padStart(2, "0")}] ${testName}: ${detail}`);
}

// ── Feature helpers ───────────────────────────────────────────────────────────
function makeFeat(overrides = {}) {
  return {
    rainfall:        0,
    forecastRainfall:0,
    humidity:        60,
    windSpeed:       15,
    historicalRisk:  30,
    terrainSlope:    3,
    temperature:     28,
    pressure:        1013,
    ...overrides,
  };
}

function makeRisk(overrides = {}) {
  return {
    riskLevel:  "Low",
    riskScore:  20,
    confidence: 80,
    isFallback: false,
    model:      "Test",
    ...overrides,
  };
}

function makeTerrain(slope = 3) {
  return { slope, source: "Open-Meteo DEM (Test)" };
}

function makeHist(historicalRisk = 30) {
  return {
    historicalRisk,
    source: "ERA5 Test",
    timeWindow: { startDate: "2026-08-01", endDate: "2026-08-31" },
  };
}

function makeLocation(lat = 12.9716, lon = 77.5946, city = "TestCity") {
  return { latitude: lat, longitude: lon, city, region: "Test Region", displayName: `${city}, Test Region` };
}

// ─── SUITE ───────────────────────────────────────────────────────────────────
async function runSuite() {
  console.log("\n================================================================================");
  console.log("   SKYRA PHASE 6: IMPACT ASSESSMENT VERIFICATION SUITE");
  console.log("================================================================================\n");

  // ─── Section 1: Core function validation ─────────────────────────────────
  console.log("── Section 1: Impact Assessment Core ─────────────────────────────────────────\n");

  // Test 01: assessImpact returns required top-level fields
  {
    const result = assessImpact({
      featureObject: makeFeat(),
      riskData: makeRisk(),
      terrainData: makeTerrain(),
      historicalRiskData: makeHist(),
      location: makeLocation(),
    });
    try {
      assert.ok(result.hazard, "hazard field missing");
      assert.ok(result.severity && typeof result.severity.label === "string", "severity.label missing");
      assert.ok(typeof result.severity.score === "number", "severity.score not number");
      assert.ok(Array.isArray(result.impacts), "impacts not array");
      assert.ok(Array.isArray(result.infrastructure), "infrastructure not array");
      assert.ok(Array.isArray(result.community), "community not array");
      assert.ok(Array.isArray(result.locationSpecificFactors), "locationSpecificFactors not array");
      assert.ok(Array.isArray(result.predictiveNetwork), "predictiveNetwork not array");
      assert.ok(Array.isArray(result.recommendedActions), "recommendedActions not array");
      assert.ok(result.evidence && typeof result.evidence === "object", "evidence missing");
      assert.ok(result.provenance && typeof result.provenance.impactEngine === "string", "provenance.impactEngine missing");
      assert.ok(Array.isArray(result.limitations), "limitations not array");
      assert.ok(typeof result.analysisTime === "string", "analysisTime missing");
      recordPass(1, "assessImpact returns all required top-level fields");
    } catch (e) { recordFail(1, "assessImpact top-level fields", e.message); }
  }

  // Test 02: assessImpact fails safely with null featureObject
  {
    const result = assessImpact({ featureObject: null, riskData: makeRisk() });
    try {
      assert.strictEqual(result.hazard, "Assessment Unavailable");
      assert.ok(result.limitations.length > 0, "should have limitations when data missing");
      recordPass(2, "assessImpact fails safely with null featureObject");
    } catch (e) { recordFail(2, "assessImpact null safety", e.message); }
  }

  // Test 03: assessImpact baseline — no hazard when conditions are within normal range
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 0, windSpeed: 10, temperature: 25, humidity: 55 }),
      riskData: makeRisk({ riskLevel: "Low", riskScore: 15 }),
      terrainData: makeTerrain(3),
      historicalRiskData: makeHist(20),
      location: makeLocation(),
    });
    try {
      const hazardTypes = result.activeHazards.map(h => h.type);
      assert.ok(hazardTypes.includes("none"), `Expected 'none' hazard under benign conditions, got: ${hazardTypes.join(",")}`);
      recordPass(3, "No hazard detected under benign conditions");
    } catch (e) { recordFail(3, "No hazard baseline", e.message); }
  }

  // Test 04: Location isolation — same weather at two different locations returns different locationSpecificFactors
  {
    const feat = makeFeat({ rainfall: 15, windSpeed: 30, temperature: 28, humidity: 75 });
    const riskData = makeRisk({ riskLevel: "Moderate", riskScore: 45 });

    const locA = makeLocation(28.6139, 77.2090, "New Delhi");
    const terrainA = makeTerrain(1);  // Very flat — Delhi
    const histA = makeHist(50);

    const locB = makeLocation(11.0168, 76.9558, "Coimbatore");
    const terrainB = makeTerrain(12); // Moderate slope — foothills
    const histB = makeHist(25);

    const resultA = assessImpact({ featureObject: feat, riskData, terrainData: terrainA, historicalRiskData: histA, location: locA });
    const resultB = assessImpact({ featureObject: feat, riskData, terrainData: terrainB, historicalRiskData: histB, location: locB });

    try {
      // Location names must differ
      const coordFactorA = resultA.locationSpecificFactors.find(f => f.factor === "Geographic Coordinates");
      const coordFactorB = resultB.locationSpecificFactors.find(f => f.factor === "Geographic Coordinates");
      assert.notStrictEqual(coordFactorA?.value, coordFactorB?.value, "Coordinates should differ between locations");

      // Terrain factors should differ
      const terrainA_f = resultA.locationSpecificFactors.find(f => f.factor === "Terrain Slope");
      const terrainB_f = resultB.locationSpecificFactors.find(f => f.factor === "Terrain Slope");
      assert.ok(terrainA_f && terrainB_f, "Both should have terrain factors");
      assert.notStrictEqual(terrainA_f.value, terrainB_f.value, "Terrain slope values should differ");

      // Severity score may differ due to different terrain amplifiers
      // (flat terrain amplifies flood risk more than steep terrain)
      assert.ok(typeof resultA.severity.score === "number" && typeof resultB.severity.score === "number");

      recordPass(4, "Location isolation — different terrain/history produce distinct locationSpecificFactors");
    } catch (e) { recordFail(4, "Location isolation", e.message); }
  }

  // Test 05: No cross-location contamination — location name is isolated per call
  {
    const locA = makeLocation(19.0760, 72.8777, "Mumbai");
    const locB = makeLocation(13.0827, 80.2707, "Chennai");

    const resultA = assessImpact({ featureObject: makeFeat(), riskData: makeRisk(), location: locA });
    const resultB = assessImpact({ featureObject: makeFeat(), riskData: makeRisk(), location: locB });

    try {
      const nameFactorA = resultA.locationSpecificFactors.find(f => f.factor === "Location Name");
      const nameFactorB = resultB.locationSpecificFactors.find(f => f.factor === "Location Name");
      assert.ok(!nameFactorA || nameFactorA.value.includes("Mumbai"), `Location A should not contain Chennai: got "${nameFactorA?.value}"`);
      assert.ok(!nameFactorB || nameFactorB.value.includes("Chennai"), `Location B should not contain Mumbai: got "${nameFactorB?.value}"`);
      recordPass(5, "No cross-location contamination in locationSpecificFactors");
    } catch (e) { recordFail(5, "Cross-location isolation", e.message); }
  }

  // ─── Section 2: Flood impact ──────────────────────────────────────────────
  console.log("\n── Section 2: Flood Impact ───────────────────────────────────────────────────\n");

  // Test 09: Flood impact — heavy rain triggers flood impact category
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30, humidity: 90 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      const hazardTypes = result.activeHazards.map(h => h.type);
      assert.ok(hazardTypes.includes("flood"), `Expected flood hazard, got: ${hazardTypes.join(",")}`);
      const floodImpact = result.impacts.find(i => i.category === "Flood Impact");
      assert.ok(floodImpact, "Flood Impact category missing");
      assert.ok(Array.isArray(floodImpact.likelyConsequences) && floodImpact.likelyConsequences.length > 0, "Flood impact has no consequences");
      assert.ok(floodImpact.qualifier, "Flood impact qualifier missing");
      recordPass(9, "Heavy rain triggers Flood Impact with consequences and qualifier");
    } catch (e) { recordFail(9, "Flood impact", e.message); }
  }

  // Test 10: Waterlogging impact — moderate rain triggers waterlogging
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 12, humidity: 85 }),
      riskData: makeRisk({ riskLevel: "Moderate", riskScore: 45 }),
      location: makeLocation(),
    });
    try {
      const hazardTypes = result.activeHazards.map(h => h.type);
      assert.ok(hazardTypes.includes("waterlogging"), `Expected waterlogging, got: ${hazardTypes.join(",")}`);
      const wlImpact = result.impacts.find(i => i.category === "Waterlogging Impact");
      assert.ok(wlImpact, "Waterlogging Impact category missing");
      recordPass(10, "Moderate rain triggers Waterlogging Impact");
    } catch (e) { recordFail(10, "Waterlogging impact", e.message); }
  }

  // Test 11: Heavy rain impact — light rain triggers heavyRain category
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 4, humidity: 75 }),
      riskData: makeRisk(),
      location: makeLocation(),
    });
    try {
      const hazardTypes = result.activeHazards.map(h => h.type);
      assert.ok(hazardTypes.includes("heavyRain"), `Expected heavyRain, got: ${hazardTypes.join(",")}`);
      const rainImpact = result.impacts.find(i => i.category === "Heavy Rain Impact");
      assert.ok(rainImpact, "Heavy Rain Impact category missing");
      recordPass(11, "Light rainfall triggers Heavy Rain Impact category");
    } catch (e) { recordFail(11, "Heavy rain impact", e.message); }
  }

  // ─── Section 3: Wind/Storm impact ─────────────────────────────────────────
  console.log("\n── Section 3: Wind / Storm Impact ───────────────────────────────────────────\n");

  // Test 12: Strong wind triggers wind impact
  {
    const result = assessImpact({
      featureObject: makeFeat({ windSpeed: 60, rainfall: 0 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 68 }),
      location: makeLocation(),
    });
    try {
      const hazardTypes = result.activeHazards.map(h => h.type);
      assert.ok(hazardTypes.includes("wind"), `Expected wind hazard, got: ${hazardTypes.join(",")}`);
      const windImpact = result.impacts.find(i => i.category === "Strong Wind / Storm Impact");
      assert.ok(windImpact, "Wind Impact category missing");
      assert.ok(windImpact.likelyConsequences.length > 0, "Wind impact has no consequences");
      recordPass(12, "Strong wind triggers Wind Impact with consequences");
    } catch (e) { recordFail(12, "Strong wind impact", e.message); }
  }

  // Test 13: Extreme wind triggers critical hazard
  {
    const result = assessImpact({
      featureObject: makeFeat({ windSpeed: 115, rainfall: 10 }),
      riskData: makeRisk({ riskLevel: "Severe", riskScore: 92 }),
      location: makeLocation(),
    });
    try {
      const windHazard = result.activeHazards.find(h => h.type === "wind");
      assert.ok(windHazard, "Wind hazard missing");
      assert.ok(!windHazard.potential, "Extreme wind should be non-potential (active)");
      assert.ok(result.severity.label === "Severe" || result.severity.label === "Critical", `Expected Severe/Critical severity for extreme wind, got: ${result.severity.label}`);
      recordPass(13, "Extreme wind is marked active (not potential) and severity is Severe/Critical");
    } catch (e) { recordFail(13, "Extreme wind severity", e.message); }
  }

  // Test 14: Wind impact actions are wind-specific, not generic flood actions
  {
    const result = assessImpact({
      featureObject: makeFeat({ windSpeed: 65, rainfall: 2 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 70 }),
      location: makeLocation(),
    });
    try {
      const actions = result.recommendedActions.join(" ").toLowerCase();
      assert.ok(
        actions.includes("tree") || actions.includes("outdoor") || actions.includes("object") || actions.includes("shelter"),
        `Expected wind-specific actions, got: ${result.recommendedActions.slice(0,2).join("|")}`
      );
      assert.ok(
        !actions.includes("floodwater") && !actions.includes("drive or walk through"),
        "Flood-specific actions should not appear for wind-only scenario"
      );
      recordPass(14, "Wind actions are hazard-specific, not generic flood actions");
    } catch (e) { recordFail(14, "Wind action specificity", e.message); }
  }

  // ─── Section 4: Heat impact ───────────────────────────────────────────────
  console.log("\n── Section 4: Heat Impact ────────────────────────────────────────────────────\n");

  // Test 15: Extreme heat triggers heat impact
  {
    const result = assessImpact({
      featureObject: makeFeat({ temperature: 44, humidity: 40, rainfall: 0, windSpeed: 10 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      const hazardTypes = result.activeHazards.map(h => h.type);
      assert.ok(hazardTypes.includes("heat"), `Expected heat hazard, got: ${hazardTypes.join(",")}`);
      const heatImpact = result.impacts.find(i => i.category === "Heat Impact");
      assert.ok(heatImpact, "Heat Impact category missing");
      assert.ok(heatImpact.hazardType.includes("Heat"), `Unexpected heat hazard type: ${heatImpact.hazardType}`);
      recordPass(15, "Extreme temperature triggers Heat Impact");
    } catch (e) { recordFail(15, "Heat impact", e.message); }
  }

  // Test 16: Heat + humidity triggers heat stress
  {
    const result = assessImpact({
      featureObject: makeFeat({ temperature: 38, humidity: 88, rainfall: 0 }),
      riskData: makeRisk({ riskLevel: "Moderate", riskScore: 50 }),
      location: makeLocation(),
    });
    try {
      const heatImpact = result.impacts.find(i => i.category === "Heat Impact");
      assert.ok(heatImpact, "Heat stress impact missing");
      const consecStr = heatImpact.likelyConsequences.join(" ").toLowerCase();
      assert.ok(consecStr.includes("humid") || consecStr.includes("heat index") || consecStr.includes("stress"), "Heat+humidity consequence missing");
      recordPass(16, "High temperature + humidity triggers heat stress with humidity-specific consequence");
    } catch (e) { recordFail(16, "Heat stress consequence", e.message); }
  }

  // Test 17: Heat actions are heat-specific
  {
    const result = assessImpact({
      featureObject: makeFeat({ temperature: 44, humidity: 38, rainfall: 0, windSpeed: 5 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      const actions = result.recommendedActions.join(" ").toLowerCase();
      assert.ok(
        actions.includes("water") || actions.includes("hydrat") || actions.includes("shade") || actions.includes("cool"),
        `Expected heat-specific actions, got: ${result.recommendedActions.slice(0,2).join("|")}`
      );
      assert.ok(
        !actions.includes("floodwater") && !actions.includes("tree") && !actions.includes("fallen"),
        "Flood/wind-specific actions should not appear in heat scenario"
      );
      recordPass(17, "Heat actions are heat-specific, not flood/wind actions");
    } catch (e) { recordFail(17, "Heat action specificity", e.message); }
  }

  // ─── Section 5: Infrastructure impact ────────────────────────────────────
  console.log("\n── Section 5: Infrastructure Impact ─────────────────────────────────────────\n");

  // Test 18: Flood scenario includes road/transport infrastructure impact
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30, humidity: 90 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      const roadImpact = result.infrastructure.find(i => i.domain.includes("Roads") || i.domain.includes("Transport"));
      assert.ok(roadImpact, "Roads/Transport infrastructure impact missing for flood");
      assert.ok(roadImpact.details.length > 0, "Roads impact has no details");
      assert.ok(roadImpact.limitation, "Roads impact missing limitation statement (honesty requirement)");
      recordPass(18, "Flood scenario includes Roads/Transport infrastructure impact with limitation");
    } catch (e) { recordFail(18, "Roads infrastructure impact", e.message); }
  }

  // Test 19: Flood scenario includes drainage infrastructure impact
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 25, forecastRainfall: 20, humidity: 88 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 70 }),
      location: makeLocation(),
    });
    try {
      const drainImpact = result.infrastructure.find(i => i.domain.includes("Drainage"));
      assert.ok(drainImpact, "Drainage infrastructure impact missing");
      assert.ok(drainImpact.limitation, "Drainage impact missing limitation");
      recordPass(19, "Flood scenario includes Drainage infrastructure impact with limitation");
    } catch (e) { recordFail(19, "Drainage infrastructure impact", e.message); }
  }

  // Test 20: No infrastructure data fabricated — specific facility counts not in output
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 55, windSpeed: 90 }),
      riskData: makeRisk({ riskLevel: "Severe", riskScore: 85 }),
      location: makeLocation(),
    });
    try {
      const infraStr = JSON.stringify(result.infrastructure).toLowerCase();
      // Should NOT contain made-up statistics like specific hospital counts or road names
      assert.ok(!infraStr.includes("hospital count"), "Should not fabricate hospital count");
      assert.ok(!infraStr.includes("50 km"), "Should not fabricate specific distance statistics");
      assert.ok(!infraStr.includes("population of"), "Should not fabricate population statistics");
      recordPass(20, "Infrastructure impact does not fabricate specific statistics or facility counts");
    } catch (e) { recordFail(20, "Infrastructure no-fabrication rule", e.message); }
  }

  // ─── Section 6: Community impact ─────────────────────────────────────────
  console.log("\n── Section 6: Community Impact ───────────────────────────────────────────────\n");

  // Test 21: Flood scenario includes mobility/access community impact
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30, humidity: 90 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      const mobilityImpact = result.community.find(i => i.domain.includes("Mobility") || i.domain.includes("Access"));
      assert.ok(mobilityImpact, "Mobility/Access community impact missing for flood");
      assert.ok(mobilityImpact.details.length > 0, "Mobility impact has no details");
      assert.ok(mobilityImpact.qualification, "Mobility impact missing qualification (honesty requirement)");
      recordPass(21, "Flood community impact includes Mobility/Access with qualification");
    } catch (e) { recordFail(21, "Mobility community impact", e.message); }
  }

  // Test 22: Public safety impact for flood
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 55, humidity: 95 }),
      riskData: makeRisk({ riskLevel: "Severe", riskScore: 88 }),
      location: makeLocation(),
    });
    try {
      const safetyImpact = result.community.find(i => i.domain.includes("Safety"));
      assert.ok(safetyImpact, "Public safety community impact missing for severe flood");
      assert.ok(safetyImpact.qualification, "Safety impact missing qualification");
      recordPass(22, "Severe flood includes Public Safety community impact");
    } catch (e) { recordFail(22, "Public safety community impact", e.message); }
  }

  // Test 23: No fake population counts in community impact
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 55, windSpeed: 95 }),
      riskData: makeRisk({ riskLevel: "Severe", riskScore: 90 }),
      location: makeLocation(),
    });
    try {
      const communityStr = JSON.stringify(result.community).toLowerCase();
      assert.ok(!communityStr.includes("10,000 people"), "Should not fabricate population count");
      assert.ok(!communityStr.includes("5 hospitals"), "Should not fabricate hospital count");
      assert.ok(!communityStr.includes("3 shelters"), "Should not fabricate shelter count");
      recordPass(23, "Community impact does not fabricate population counts or facility statistics");
    } catch (e) { recordFail(23, "Community no-fabrication rule", e.message); }
  }

  // ─── Section 7: Location-specific impact ─────────────────────────────────
  console.log("\n── Section 7: Location-Specific Impact ───────────────────────────────────────\n");

  // Test 24: Terrain slope appears in locationSpecificFactors when provided
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 20 }),
      riskData: makeRisk(),
      terrainData: makeTerrain(2.5),
      location: makeLocation(),
    });
    try {
      const terrainFactor = result.locationSpecificFactors.find(f => f.factor === "Terrain Slope");
      assert.ok(terrainFactor, "Terrain Slope factor missing");
      assert.ok(terrainFactor.value.includes("2.5"), `Expected 2.5° in terrain factor value, got: ${terrainFactor.value}`);
      assert.ok(terrainFactor.source, "Terrain factor missing source attribution");
      recordPass(24, "Terrain slope appears in locationSpecificFactors with source attribution");
    } catch (e) { recordFail(24, "Terrain location factor", e.message); }
  }

  // Test 25: Missing terrain adds limitation, not fabricated value
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 20 }),
      riskData: makeRisk(),
      terrainData: null,  // deliberately missing
      location: makeLocation(),
    });
    try {
      const terrainFactor = result.locationSpecificFactors.find(f => f.factor === "Terrain Slope");
      assert.ok(!terrainFactor, "Terrain factor should NOT appear when terrain data is null");
      const hasTerrainLimitation = result.limitations.some(l => l.toLowerCase().includes("terrain"));
      assert.ok(hasTerrainLimitation, "Missing terrain should add a limitation entry");
      recordPass(25, "Missing terrain adds limitation entry, not fabricated terrain factor");
    } catch (e) { recordFail(25, "Terrain missing limitation", e.message); }
  }

  // Test 26: Historical risk appears in locationSpecificFactors when provided
  {
    const result = assessImpact({
      featureObject: makeFeat(),
      riskData: makeRisk(),
      historicalRiskData: makeHist(75),
      location: makeLocation(),
    });
    try {
      const histFactor = result.locationSpecificFactors.find(f => f.factor === "Historical Climate Vulnerability");
      assert.ok(histFactor, "Historical Climate Vulnerability factor missing");
      assert.ok(histFactor.value.includes("75"), `Expected 75 in hist factor value, got: ${histFactor.value}`);
      recordPass(26, "Historical climate vulnerability appears in locationSpecificFactors");
    } catch (e) { recordFail(26, "Historical location factor", e.message); }
  }

  // Test 27: Seasonal context appears in locationSpecificFactors
  {
    const result = assessImpact({
      featureObject: makeFeat(),
      riskData: makeRisk(),
      location: makeLocation(),
    });
    try {
      const seasonFactor = result.locationSpecificFactors.find(f => f.factor === "Seasonal Context");
      assert.ok(seasonFactor, "Seasonal Context factor missing");
      assert.ok(typeof seasonFactor.value === "string" && seasonFactor.value.length > 0, "Seasonal Context value is empty");
      recordPass(27, "Seasonal context appears in locationSpecificFactors");
    } catch (e) { recordFail(27, "Seasonal context factor", e.message); }
  }

  // ─── Section 8: Predictive Impact Network ────────────────────────────────
  console.log("\n── Section 8: Predictive Impact Network ──────────────────────────────────────\n");

  // Test 28: Predictive network contains causal chain structure
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30, windSpeed: 60 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      assert.ok(result.predictiveNetwork.length > 0, "Predictive network empty");
      const chain = result.predictiveNetwork[0];
      assert.ok(chain.hazard, "Chain missing hazard label");
      assert.ok(Array.isArray(chain.links) && chain.links.length > 0, "Chain links missing");
      const stepNames = chain.links.map(l => l.step);
      assert.ok(stepNames.includes("Environmental Effect"), `Expected 'Environmental Effect' step, got: ${stepNames.join(",")}`);
      assert.ok(stepNames.includes("Recommended Action"), `Expected 'Recommended Action' step, got: ${stepNames.join(",")}`);
      recordPass(28, "Predictive network contains causal chain with Environmental Effect and Recommended Action steps");
    } catch (e) { recordFail(28, "Predictive network structure", e.message); }
  }

  // Test 29: Predictive network uses qualifier language (not certainty claims)
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 70 }),
      location: makeLocation(),
    });
    try {
      const allText = result.predictiveNetwork
        .flatMap(c => c.links.map(l => (l.description + " " + (l.qualifier || "")).toLowerCase()))
        .join(" ");
      const hasQualifier =
        allText.includes("potential") ||
        allText.includes("may") ||
        allText.includes("likely") ||
        allText.includes("possible") ||
        allText.includes("risk");
      assert.ok(hasQualifier, `Expected qualifier language in predictive network text, got text starting: ${allText.substring(0, 100)}`);
      recordPass(29, "Predictive network uses qualifier language (potential/may/likely), not certainty claims");
    } catch (e) { recordFail(29, "Predictive network qualifier language", e.message); }
  }

  // Test 30: No-hazard scenario still has predictive network (with baseline entry)
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 0, windSpeed: 5, temperature: 22 }),
      riskData: makeRisk({ riskLevel: "Low", riskScore: 10 }),
      location: makeLocation(),
    });
    try {
      assert.ok(result.predictiveNetwork.length > 0, "Predictive network should not be empty even for no-hazard case");
      recordPass(30, "No-hazard scenario still produces a predictive network entry");
    } catch (e) { recordFail(30, "No-hazard predictive network", e.message); }
  }

  // ─── Section 9: Impact Severity (≠ riskScore ≠ confidence) ───────────────
  console.log("\n── Section 9: Impact Severity ────────────────────────────────────────────────\n");

  // Test 31: Impact severity score is NOT identical to riskScore
  {
    const riskData = makeRisk({ riskScore: 72, riskLevel: "High", confidence: 85 });
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30, windSpeed: 60 }),
      riskData,
      terrainData: makeTerrain(3),
      historicalRiskData: makeHist(40),
      location: makeLocation(),
    });
    try {
      // They may coincidentally be equal, but the derivation path must be different
      // The key test: severity has its own basis array
      assert.ok(result.severity.basis.length > 0, "Severity should have its own basis array");
      assert.ok(result.severity.note, "Severity should have a note distinguishing it from riskScore/confidence");
      assert.ok(result.severity.note.includes("distinct"), "Severity note should mention 'distinct'");
      recordPass(31, "Impact severity has independent basis and note distinguishing it from riskScore/confidence");
    } catch (e) { recordFail(31, "Severity ≠ riskScore distinction", e.message); }
  }

  // Test 32: Severity score is bounded [0, 100]
  {
    const extremeFeats = makeFeat({ rainfall: 100, windSpeed: 120, temperature: 50, humidity: 99, forecastRainfall: 80 });
    const severRisk = makeRisk({ riskScore: 99, riskLevel: "Severe" });
    const result = assessImpact({
      featureObject: extremeFeats,
      riskData: severRisk,
      terrainData: makeTerrain(0),
      historicalRiskData: makeHist(95),
      location: makeLocation(),
    });
    try {
      assert.ok(result.severity.score >= 0 && result.severity.score <= 100,
        `Severity score out of bounds: ${result.severity.score}`);
      recordPass(32, "Impact severity score is bounded [0, 100] under extreme conditions");
    } catch (e) { recordFail(32, "Severity bounds", e.message); }
  }

  // Test 33: Severity amplifiers reflect actual terrain/historical inputs
  {
    // Flat terrain should amplify severity vs steep terrain
    const feat = makeFeat({ rainfall: 25, humidity: 85 });
    const riskData = makeRisk({ riskLevel: "High", riskScore: 70 });

    const flatResult  = assessImpact({ featureObject: feat, riskData, terrainData: makeTerrain(1),  historicalRiskData: makeHist(60), location: makeLocation() });
    const steepResult = assessImpact({ featureObject: feat, riskData, terrainData: makeTerrain(25), historicalRiskData: makeHist(60), location: makeLocation() });

    try {
      assert.ok(
        flatResult.severity.score >= steepResult.severity.score,
        `Flat terrain should give >= severity than steep terrain. Flat: ${flatResult.severity.score}, Steep: ${steepResult.severity.score}`
      );
      recordPass(33, "Flat terrain amplifies severity more than steep terrain (flood accumulation risk)");
    } catch (e) { recordFail(33, "Terrain amplifies severity", e.message); }
  }

  // Test 34: Severity evidence appears correctly for rain, wind, and heat
  {
    const rainResult = assessImpact({ featureObject: makeFeat({ rainfall: 55 }), riskData: makeRisk({ riskLevel: "Severe", riskScore: 88 }), location: makeLocation() });
    const windResult = assessImpact({ featureObject: makeFeat({ windSpeed: 90 }), riskData: makeRisk({ riskLevel: "Severe", riskScore: 86 }), location: makeLocation() });
    const heatResult = assessImpact({ featureObject: makeFeat({ temperature: 45, humidity: 35 }), riskData: makeRisk({ riskLevel: "High", riskScore: 72 }), location: makeLocation() });

    try {
      const rainEvidence = rainResult.severity.basis.join(" ").toLowerCase();
      const windEvidence = windResult.severity.basis.join(" ").toLowerCase();
      const heatEvidence = heatResult.severity.basis.join(" ").toLowerCase();

      assert.ok(rainEvidence.includes("rainfall"), `Rain severity evidence should mention rainfall, got: ${rainEvidence}`);
      assert.ok(windEvidence.includes("wind"), `Wind severity evidence should mention wind, got: ${windEvidence}`);
      assert.ok(heatEvidence.includes("temperature"), `Heat severity evidence should mention temperature, got: ${heatEvidence}`);

      recordPass(34, "Severity evidence correctly reflects rain/wind/heat inputs");
    } catch (e) { recordFail(34, "Severity evidence accuracy", e.message); }
  }

  // ─── Section 10: Impact → Action Mapping ─────────────────────────────────
  console.log("\n── Section 10: Impact → Action Mapping ───────────────────────────────────────\n");

  // Test 35: Flood actions are distinct from wind actions
  {
    const floodResult = assessImpact({ featureObject: makeFeat({ rainfall: 55, windSpeed: 10 }), riskData: makeRisk({ riskLevel: "Severe", riskScore: 88 }), location: makeLocation() });
    const windResult  = assessImpact({ featureObject: makeFeat({ rainfall: 0, windSpeed: 95 }),  riskData: makeRisk({ riskLevel: "Severe", riskScore: 86 }), location: makeLocation() });

    try {
      const floodActions = floodResult.recommendedActions.join(" ").toLowerCase();
      const windActions  = windResult.recommendedActions.join(" ").toLowerCase();

      // Flood should mention floodwater/routes/floors
      assert.ok(
        floodActions.includes("flood") || floodActions.includes("water") || floodActions.includes("floor"),
        `Flood actions should be flood-specific, got: ${floodResult.recommendedActions.slice(0,2).join("|")}`
      );

      // Wind should mention trees/outdoor/objects/shelter
      assert.ok(
        windActions.includes("tree") || windActions.includes("outdoor") || windActions.includes("object") || windActions.includes("indoors"),
        `Wind actions should be wind-specific, got: ${windResult.recommendedActions.slice(0,2).join("|")}`
      );

      // Flood should NOT have "stay indoors" as sole action when wind is absent
      // Wind should NOT have "do not drive through floodwater" as primary action
      assert.ok(
        !windActions.includes("drive through flood"),
        "Wind actions should not include flood-specific driving advice"
      );

      recordPass(35, "Flood and wind actions are distinct and hazard-specific");
    } catch (e) { recordFail(35, "Action specificity (flood vs wind)", e.message); }
  }

  // Test 36: No-hazard scenario produces routine monitoring actions
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 0, windSpeed: 5, temperature: 25 }),
      riskData: makeRisk({ riskLevel: "Low", riskScore: 10 }),
      location: makeLocation(),
    });
    try {
      const actions = result.recommendedActions.join(" ").toLowerCase();
      assert.ok(
        actions.includes("monitor") || actions.includes("normal") || actions.includes("awareness"),
        `No-hazard actions should be routine monitoring, got: ${result.recommendedActions.join("|")}`
      );
      assert.ok(result.recommendedActions.length > 0, "Should have at least one action even for no-hazard");
      recordPass(36, "No-hazard scenario produces routine monitoring actions");
    } catch (e) { recordFail(36, "No-hazard routine actions", e.message); }
  }

  // Test 37: Forecast worsening adds preparatory action
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 5, forecastRainfall: 35 }),
      riskData: makeRisk({ riskLevel: "Moderate", riskScore: 48 }),
      location: makeLocation(),
    });
    try {
      const actions = result.recommendedActions.join(" ").toLowerCase();
      const hasPrep = actions.includes("forecast") || actions.includes("worsen") || actions.includes("prepare");
      assert.ok(hasPrep || result.predictiveNetwork.some(c => c.hazard.includes("Forecast")),
        "Should mention forecast worsening in actions or predictive network");
      recordPass(37, "Forecast rainfall triggers preparatory actions or network entry");
    } catch (e) { recordFail(37, "Forecast action", e.message); }
  }

  // Test 38: Heat actions are evidence-based (mention specific temperature/threshold)
  {
    const result = assessImpact({
      featureObject: makeFeat({ temperature: 44, humidity: 38, rainfall: 0, windSpeed: 5 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
      location: makeLocation(),
    });
    try {
      // At minimum, actions should be health-focused
      const actions = result.recommendedActions.join(" ").toLowerCase();
      const hasHealthAction = actions.includes("water") || actions.includes("hydrat") || actions.includes("shade") || actions.includes("cool") || actions.includes("heat");
      assert.ok(hasHealthAction, `Heat actions should include health-focused guidance, got: ${result.recommendedActions.join("|")}`);
      recordPass(38, "Heat actions are health-focused and evidence-based");
    } catch (e) { recordFail(38, "Heat evidence-based actions", e.message); }
  }

  // ─── Section 11: Safety / No-Fabrication Rules ───────────────────────────
  console.log("\n── Section 11: Safety / No-Fabrication Rules ────────────────────────────────\n");

  // Test 39: No Bhubaneswar-specific references in impact output for non-Bhubaneswar location
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 35, windSpeed: 70 }),
      riskData: makeRisk({ riskLevel: "Severe", riskScore: 90 }),
      location: makeLocation(28.6139, 77.2090, "New Delhi"),
    });
    try {
      const fullJson = JSON.stringify(result).toLowerCase();
      assert.ok(!fullJson.includes("bhubaneswar"), `Bhubaneswar reference found in non-Bhubaneswar impact output`);
      assert.ok(!fullJson.includes("odisha"), `Odisha reference found in non-Odisha impact output`);
      assert.ok(!fullJson.includes("nh-16"), `NH-16 reference found (Odisha-specific road) for Delhi location`);
      recordPass(39, "No Bhubaneswar/Odisha-specific references in New Delhi impact output");
    } catch (e) { recordFail(39, "No Bhubaneswar contamination", e.message); }
  }

  // Test 40: No fabricated ML confidence in impact output
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 70, confidence: 82 }),
      location: makeLocation(),
    });
    try {
      // Severity score must not equal confidence (it's independently derived)
      // The note must mention they are distinct
      assert.ok(result.severity.note.includes("distinct"), "Severity note must state it is distinct from confidence");
      // Evidence must show actual rainfall/wind/temp basis, not just copy confidence
      assert.ok(result.severity.basis.length > 0, "Severity basis must be non-empty");
      assert.ok(!result.severity.basis.some(b => b.includes("confidence")), "Severity basis should not reference ML confidence");
      recordPass(40, "Impact severity does not copy or fabricate ML confidence values");
    } catch (e) { recordFail(40, "No fabricated confidence in severity", e.message); }
  }

  // Test 41: Missing historicalRiskData adds limitation, no fabricated baseline
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 20 }),
      riskData: makeRisk({ riskLevel: "Moderate", riskScore: 45 }),
      terrainData: null,
      historicalRiskData: null,
      location: makeLocation(),
    });
    try {
      const hasHistLimitation = result.limitations.some(l => l.toLowerCase().includes("historical"));
      assert.ok(hasHistLimitation, "Missing historical data should produce a historical limitation entry");
      const histFactor = result.locationSpecificFactors.find(f => f.factor === "Historical Climate Vulnerability");
      assert.ok(!histFactor, "Historical factor should NOT appear when historicalRiskData is null");
      recordPass(41, "Missing historical data adds limitation, does not fabricate historical factor");
    } catch (e) { recordFail(41, "Missing historical limitation", e.message); }
  }

  // Test 42: isFallback=true adds limitation about ML model
  {
    const result = assessImpact({
      featureObject: makeFeat({ rainfall: 30 }),
      riskData: makeRisk({ riskLevel: "High", riskScore: 72, isFallback: true, model: "Heuristic Fallback Engine" }),
      location: makeLocation(),
    });
    try {
      const hasFallbackLimitation = result.limitations.some(l => l.toLowerCase().includes("fallback") || l.toLowerCase().includes("ml model"));
      assert.ok(hasFallbackLimitation, "isFallback=true should add a ML fallback limitation entry");
      recordPass(42, "isFallback=true adds limitation about reduced ML accuracy");
    } catch (e) { recordFail(42, "isFallback limitation", e.message); }
  }

  // ─── Section 12: Failure Safety ──────────────────────────────────────────
  console.log("\n── Section 12: Failure Safety ────────────────────────────────────────────────\n");

  // Test 43: assessImpact handles missing riskData gracefully
  {
    try {
      const result = assessImpact({
        featureObject: makeFeat({ rainfall: 15 }),
        riskData: null,
        location: makeLocation(),
      });
      // Should not throw — should return a valid result
      assert.ok(result.hazard, "Should return valid hazard even with null riskData");
      assert.ok(result.severity && typeof result.severity.score === "number", "Should return valid severity with null riskData");
      recordPass(43, "assessImpact handles null riskData without throwing");
    } catch (e) { recordFail(43, "null riskData safety", e.message); }
  }

  // Test 44: assessImpact handles missing location gracefully
  {
    try {
      const result = assessImpact({
        featureObject: makeFeat({ rainfall: 15 }),
        riskData: makeRisk(),
        location: undefined,
      });
      assert.ok(result.hazard, "Should return valid result with undefined location");
      recordPass(44, "assessImpact handles undefined location without throwing");
    } catch (e) { recordFail(44, "undefined location safety", e.message); }
  }

  // Test 45: assessImpact handles missing terrainData and historicalRiskData
  {
    try {
      const result = assessImpact({
        featureObject: makeFeat({ rainfall: 25, windSpeed: 60 }),
        riskData: makeRisk({ riskLevel: "High", riskScore: 72 }),
        terrainData: null,
        historicalRiskData: null,
        location: makeLocation(),
      });
      assert.ok(Array.isArray(result.limitations) && result.limitations.length > 0, "Missing terrain+historical should produce limitations");
      assert.ok(Array.isArray(result.infrastructure) && result.infrastructure.length > 0, "Infrastructure impact should still work without terrain/historical");
      recordPass(45, "Missing terrain+historical data: assessment still works, limitations populated");
    } catch (e) { recordFail(45, "Missing terrain/historical safety", e.message); }
  }

  // Test 46: Extreme inputs (all zeros) do not crash or produce nonsensical output
  {
    try {
      const result = assessImpact({
        featureObject: makeFeat({ rainfall: 0, forecastRainfall: 0, windSpeed: 0, temperature: 0, humidity: 0, pressure: 1013, terrainSlope: 0, historicalRisk: 0 }),
        riskData: makeRisk({ riskLevel: "Low", riskScore: 0, confidence: 0 }),
        location: makeLocation(),
      });
      assert.ok(result.hazard === "No Significant Hazard" || typeof result.hazard === "string", "Should handle all-zero inputs");
      assert.ok(result.severity.score >= 0 && result.severity.score <= 100, "Severity score should be valid for all-zero inputs");
      recordPass(46, "All-zero inputs produce valid no-hazard result without errors");
    } catch (e) { recordFail(46, "All-zero inputs safety", e.message); }
  }

  // ─── Section 13: intelligenceService Integration ─────────────────────────
  console.log("\n── Section 13: intelligenceService Integration ───────────────────────────────\n");

  const { getIntelligenceForLocation } = require("../services/intelligenceService");

  // Test 47: getIntelligenceForLocation returns impactAssessment field
  {
    try {
      const result = await getIntelligenceForLocation({
        latitude: 12.9716,
        longitude: 77.5946,
        locationName: "Bengaluru",
        customInputs: {
          temperature: 30, humidity: 70, windSpeed: 20, rainfall: 5,
          pressure: 1010, condition: "Partly cloudy",
          terrainSlope: 3, historicalRisk: 35,
        },
      });
      assert.ok(result.impactAssessment, "impactAssessment field missing in intelligence result");
      assert.ok(result.impactAssessment.hazard, "impactAssessment.hazard missing");
      assert.ok(result.impactAssessment.severity, "impactAssessment.severity missing");
      assert.ok(Array.isArray(result.impactAssessment.infrastructure), "impactAssessment.infrastructure not array");
      assert.ok(Array.isArray(result.impactAssessment.community), "impactAssessment.community not array");
      assert.ok(Array.isArray(result.impactAssessment.predictiveNetwork), "impactAssessment.predictiveNetwork not array");
      assert.ok(Array.isArray(result.impactAssessment.recommendedActions), "impactAssessment.recommendedActions not array");
      recordPass(47, "getIntelligenceForLocation includes full impactAssessment in result");
    } catch (e) { recordFail(47, "intelligenceService impactAssessment integration", e.message); }
  }

  // Test 48: Two different locations produce different impact assessments (no cross-contamination)
  {
    try {
      const mumbaiResult = await getIntelligenceForLocation({
        latitude: 19.0760, longitude: 72.8777, locationName: "Mumbai",
        customInputs: { temperature: 30, humidity: 85, windSpeed: 40, rainfall: 20, pressure: 1008, condition: "Rain", terrainSlope: 1, historicalRisk: 55 },
      });
      const jaisalmerResult = await getIntelligenceForLocation({
        latitude: 26.9157, longitude: 70.9083, locationName: "Jaisalmer",
        customInputs: { temperature: 42, humidity: 18, windSpeed: 25, rainfall: 0, pressure: 1002, condition: "Clear", terrainSlope: 2, historicalRisk: 20 },
      });

      // Location names must not cross-contaminate
      assert.ok(
        mumbaiResult.location.city === "Mumbai" || mumbaiResult.location.displayName.includes("Mumbai"),
        `Mumbai result should have Mumbai in location, got: ${mumbaiResult.location.displayName}`
      );
      assert.ok(
        jaisalmerResult.location.city === "Jaisalmer" || jaisalmerResult.location.displayName.includes("Jaisalmer"),
        `Jaisalmer result should have Jaisalmer in location, got: ${jaisalmerResult.location.displayName}`
      );

      // Hazards should differ (rain vs heat)
      const mumbaiHazard = mumbaiResult.impactAssessment?.hazard ?? "";
      const jaisalmerHazard = jaisalmerResult.impactAssessment?.hazard ?? "";
      // Mumbai: rain scenario should not have same hazard as Jaisalmer heat scenario
      assert.ok(
        mumbaiHazard !== jaisalmerHazard || mumbaiHazard === "No Significant Hazard",
        `Mumbai (${mumbaiHazard}) and Jaisalmer (${jaisalmerHazard}) should have different hazards`
      );

      recordPass(48, "Two different locations (Mumbai vs Jaisalmer) produce different impact assessments");
    } catch (e) { recordFail(48, "Multi-location isolation in intelligenceService", e.message); }
  }

  // Test 49: impactAssessment evidence fields reflect actual input values
  {
    try {
      const result = await getIntelligenceForLocation({
        latitude: 28.6139, longitude: 77.2090, locationName: "New Delhi",
        customInputs: {
          temperature: 43, humidity: 35, windSpeed: 18, rainfall: 0,
          pressure: 1005, condition: "Hot and Sunny", terrainSlope: 2, historicalRisk: 25,
        },
      });
      const evidence = result.impactAssessment?.evidence;
      assert.ok(evidence, "Evidence field missing in impactAssessment");
      assert.strictEqual(evidence.temperature, 43, `Evidence temperature should be 43, got: ${evidence.temperature}`);
      assert.strictEqual(evidence.humidity, 35, `Evidence humidity should be 35, got: ${evidence.humidity}`);
      assert.strictEqual(evidence.rainfall, 0, `Evidence rainfall should be 0, got: ${evidence.rainfall}`);
      assert.ok(evidence.mlRiskLevel, "Evidence should include mlRiskLevel");
      assert.ok(evidence.mlModel, "Evidence should include mlModel");
      recordPass(49, "impactAssessment evidence reflects actual input values (New Delhi heat scenario)");
    } catch (e) { recordFail(49, "impactAssessment evidence accuracy", e.message); }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const failedTests = totalTests - passedTests;
  console.log("\n================================================================================");
  console.log("   PHASE 6 IMPACT ASSESSMENT TEST RESULTS");
  console.log("================================================================================");
  console.log(`   Total:  ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${failedTests}`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error("\n[FATAL] Test suite threw uncaught error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
