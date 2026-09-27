/**
 * SKYRA – Phase 14 Unified Dashboard Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive verification of Phase 14 Unified Dashboard:
 *   1. Complete 9-Question Information Architecture Data Contract
 *      - WHERE AM I? (Location: latitude, longitude, city, region, source)
 *      - WHAT IS THE WEATHER? (Current conditions: temp, humidity, wind, rainfall, pressure)
 *      - WHAT IS THE RISK? (Calibrated score /100, severity tier, confidence)
 *      - WHY IS IT RISKY? (XAI: tree-path feature attribution, physical reasoning)
 *      - WHAT MAY HAPPEN? (Forecast horizon & Phase 6 predictive impact network)
 *      - WHAT SHOULD I DO? (Actionable advice: Do Now, Avoid, Prepare, Escalate)
 *      - ARE THERE ALERTS? (Smart alerts, CAP feeds, priority indicators)
 *      - CAN I ASK SKYRA? (Conversational access readiness)
 *      - CAN I ENTER EMERGENCY MODE? (Phase 13 emergency state machine integration)
 *   2. Dynamic Location Safety (No silent fallback, explicit coordinate preservation)
 *   3. Weather Variable Consistency & Physical Range Bounds
 *   4. Calibrated 4-Tier Risk Score & Platt Sigmoid Confidence Isolation
 *   5. Explainable AI Feature Attribution & Physical Environmental Thresholds
 *   6. Meteorological Forecast Horizon (Hourly & Precipitation Expectation)
 *   7. Phase 6 Predictive Impact Assessment & Causal Impact Chains
 *   8. Actionable Advice Structure & Priority Assignment
 *   9. Smart Alerts Prioritization & Broadcast Integrity
 *  10. Phase 13 Emergency Mode Integration & Compatibility
 *  11. Graceful Degradation & Unavailable State Integrity (Zero Fake Data)
 *  12. Multi-City Coordinate Isolation & Provenance Traceability
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getIntelligenceForLocation } = require("../services/intelligenceService");
const { validateCoordinates } = require("../services/weatherService");
const { createSkyraIntelligenceResult, getRiskLevelFromScore } = require("../utils/dataContract");
const {
  EMERGENCY_STATES,
  activateEmergency,
  triggerSos,
  updateSafetyStatus,
  getEmergencyStatus,
  clearEmergencyStore,
} = require("../services/emergencyService");

test.beforeEach(() => {
  clearEmergencyStore();
});

test("Phase 14 – Unified SKYRA Dashboard Verification Suite", async (t) => {
  // ── Test 1: Complete 9-Question Data Contract ─────────────────────────────
  await t.test("1. Information Architecture: Canonical result answers all 9 product questions", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Observatory",
      customInputs: {
        temperature: 32,
        humidity: 85,
        windSpeed: 45,
        rainfall: 35,
        pressure: 1004,
        condition: "Heavy rainfall with strong wind",
      },
    });

    // Q1: WHERE AM I?
    assert.ok(result.location, "Location must be present");
    assert.equal(result.location.latitude, 13.0827);
    assert.equal(result.location.longitude, 80.2707);
    assert.equal(result.location.city, "Chennai Observatory");

    // Q2: WHAT IS THE WEATHER?
    assert.ok(result.currentWeather, "Current weather must be present");
    assert.equal(result.currentWeather.temperature, 32);
    assert.equal(result.currentWeather.humidity, 85);
    assert.equal(result.currentWeather.windSpeed, 45);
    assert.equal(result.currentWeather.rainfall, 35);
    assert.equal(result.currentWeather.surfacePressure, 1004);

    // Q3: WHAT IS THE RISK?
    assert.ok(typeof result.riskScore === "number", "Risk score must be numeric");
    assert.ok(["Low", "Moderate", "High", "Severe"].includes(result.riskLevel), "Risk level must be valid tier");
    assert.ok(typeof result.confidence === "number", "Confidence must be numeric");

    // Q4: WHY IS IT RISKY? (XAI)
    assert.ok(result.xai, "XAI attribution must be present");
    assert.ok(result.xai.whyThisRisk, "XAI whyThisRisk must be present");
    assert.ok(result.xai.explanation, "XAI explanation must be present");
    assert.ok(Array.isArray(result.xai.factors), "XAI factors must be an array");

    // Q5: WHAT MAY HAPPEN? (Forecast + Impact)
    assert.ok(result.forecast, "Forecast must be present");
    assert.ok(Array.isArray(result.forecast.hourly), "Hourly forecast must be present");
    assert.ok(result.impactAssessment || result.impacts, "Impact assessment must be present");

    // Q6: WHAT SHOULD I DO? (Advice)
    assert.ok(result.actionableAdvice, "Actionable advice must be present");
    assert.ok(Array.isArray(result.actionableAdvice.immediateActions), "Immediate actions must be an array");
    assert.ok(Array.isArray(result.actionableAdvice.avoidActions), "Avoid actions must be an array");
    assert.ok(Array.isArray(result.actionableAdvice.preparationActions), "Preparation actions must be an array");

    // Q7: ARE THERE ALERTS?
    assert.ok(result.alerts, "Alerts section must be present");
    assert.ok(result.alerts.status, "Alert status must be present");

    // Q8: CAN I ASK SKYRA? (Knowledge & Source Information)
    assert.ok(result.sourceInformation, "Source information must be present for grounding");
    assert.ok(result.sourceMetadata, "Source metadata must be present for provenance");

    // Q9: CAN I ENTER EMERGENCY MODE? (Emergency Readiness)
    assert.ok(result.emergencyState, "Emergency state must be present");
    assert.ok(result.emergencyState.nearestShelter, "Nearest shelter must be present");
    assert.ok(result.emergencyState.nearestHospital, "Nearest hospital must be present");
    assert.ok(result.emergencyState.hotlineNumbers, "Hotline numbers must be present");
  });

  // ── Test 2: Dynamic Location Safety & Strict Coordinate Preservation ──────
  await t.test("2. Location Safety: Coordinates preserved precisely without silent fallback to Bhubaneswar", async () => {
    // Valid location: Kochi
    const kochi = await getIntelligenceForLocation({
      latitude: 9.9312,
      longitude: 76.2673,
      locationName: "Kochi Port",
      customInputs: { temperature: 29, humidity: 78, windSpeed: 20, rainfall: 5 },
    });
    assert.equal(kochi.location.latitude, 9.9312);
    assert.equal(kochi.location.longitude, 76.2673);
    assert.equal(kochi.location.city, "Kochi Port");

    // Missing coordinates must throw explicitly (NEVER silently default to Bhubaneswar)
    await assert.rejects(
      async () => {
        validateCoordinates(null, null);
      },
      (err) => {
        assert.equal(err.sourceStatus, "invalid_coordinates");
        return true;
      }
    );

    // Invalid coordinates out of bounds must throw explicitly
    await assert.rejects(
      async () => {
        validateCoordinates(95.0, 76.2); // Latitude > 90
      },
      (err) => {
        assert.equal(err.sourceStatus, "invalid_coordinates");
        return true;
      }
    );
  });

  // ── Test 3: Weather Telemetry Physical Consistency ────────────────────────
  await t.test("3. Current Weather: Physical variables adhere to meteorological constraints", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 19.0760,
      longitude: 72.8777,
      locationName: "Mumbai Coastal",
      customInputs: {
        temperature: 30,
        humidity: 90,
        windSpeed: 60,
        rainfall: 45,
        pressure: 998,
      },
    });

    const w = result.currentWeather;
    assert.ok(w.temperature >= -50 && w.temperature <= 60, "Temperature in physical range");
    assert.ok(w.humidity >= 0 && w.humidity <= 100, "Humidity in [0, 100]");
    assert.ok(w.windSpeed >= 0 && w.windSpeed <= 300, "Wind speed in valid range");
    assert.ok(w.rainfall >= 0 && w.rainfall <= 1000, "Rainfall non-negative");
    assert.ok(w.surfacePressure >= 800 && w.surfacePressure <= 1100, "Atmospheric pressure in valid range");
  });

  // ── Test 4: Calibrated 4-Tier Risk Score & Confidence Isolation ───────────
  await t.test("4. Risk Overview: Calibrated 4-tier risk classification with confidence isolation", async () => {
    // Score boundary verification
    assert.equal(getRiskLevelFromScore(0), "Low");
    assert.equal(getRiskLevelFromScore(39), "Low");
    assert.equal(getRiskLevelFromScore(40), "Moderate");
    assert.equal(getRiskLevelFromScore(69), "Moderate");
    assert.equal(getRiskLevelFromScore(70), "High");
    assert.equal(getRiskLevelFromScore(79), "High");
    assert.equal(getRiskLevelFromScore(80), "Severe");
    assert.equal(getRiskLevelFromScore(100), "Severe");

    // Extreme event simulation
    const severeResult = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Cyclone Simulation Zone",
      customInputs: {
        temperature: 24,
        humidity: 98,
        windSpeed: 110,
        rainfall: 120,
        forecastRainfall: 110,
        historicalRisk: 85,
        terrainSlope: 30,
        pressure: 975,
      },
    });

    assert.equal(severeResult.riskLevel, "Severe");
    assert.ok(severeResult.riskScore >= 80, `Severe risk score expected >= 80, got ${severeResult.riskScore}`);
    assert.ok(severeResult.confidence >= 0 && severeResult.confidence <= 100, "Confidence must be 0-100");
    assert.notEqual(severeResult.confidence, severeResult.riskScore, "Confidence and risk score must be distinct metrics");
  });

  // ── Test 5: Explainable AI Feature Attribution Integrity ──────────────────
  await t.test("5. Explainable AI (XAI): Provides tree-path attribution and physical environmental reasoning", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 12.9716,
      longitude: 77.5946,
      locationName: "Bengaluru Urban",
      customInputs: {
        temperature: 24,
        humidity: 92,
        windSpeed: 55,
        rainfall: 50,
        pressure: 1005,
      },
    });

    const xai = result.xai;
    assert.ok(xai.available, "XAI must report available");
    assert.ok(xai.whyThisRisk.length > 10, "XAI whyThisRisk must be a meaningful explanation");
    assert.ok(xai.factors.length > 0, "XAI factors must not be empty");
    assert.ok(xai.explanationMethod, "Explanation method must be specified");
    assert.ok(xai.confidenceExplanation, "Confidence explanation must be specified");
  });

  // ── Test 6: Meteorological Forecast Horizon ───────────────────────────────
  await t.test("6. Forecast: Provides upcoming horizon with precipitation expectation", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Forecast Test",
      customInputs: {
        temperature: 28,
        humidity: 70,
        windSpeed: 15,
        rainfall: 0,
      },
    });

    const f = result.forecast;
    assert.ok(Array.isArray(f.hourly), "Forecast hourly must be an array");
    assert.ok(typeof f.precipitationExpected === "number", "Precipitation expected must be numeric");
    assert.ok(typeof f.maxRainProbability === "number", "Max rain probability must be numeric");
  });

  // ── Test 7: Predictive Impact Network & Causal Chains ─────────────────────
  await t.test("7. Predictive Impact: Authoritative Phase 6 backend impact assessment with domain impacts", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Flooding Impact",
      customInputs: {
        temperature: 26,
        humidity: 96,
        windSpeed: 50,
        rainfall: 60,
        pressure: 1002,
      },
    });

    const impact = result.impactAssessment;
    assert.ok(impact, "Authoritative impact assessment must be present");
    assert.ok(impact.hazard, "Detected hazard must be specified");
    assert.ok(impact.severity, "Impact severity must be specified");
    assert.ok(typeof impact.severity.score === "number", "Impact severity score must be numeric");
    assert.ok(Array.isArray(impact.activeHazards), "Active hazards list must be present");
    assert.ok(Array.isArray(impact.predictiveNetwork), "Predictive causal network must be present");
    assert.ok(Array.isArray(impact.infrastructure), "Infrastructure domain impact must be present");
    assert.ok(Array.isArray(impact.community), "Community domain impact must be present");
  });

  // ── Test 8: Actionable Advice Generation ──────────────────────────────────
  await t.test("8. Actionable Advice: Produces structured Do Now, Avoid, and Prepare actions", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Advisory Test",
      customInputs: {
        temperature: 28,
        humidity: 80,
        windSpeed: 30,
        rainfall: 20,
      },
    });

    const adv = result.actionableAdvice;
    assert.ok(adv.priority, "Advice priority must be present");
    assert.ok(adv.title, "Advice title must be present");
    assert.ok(adv.immediateActions.length > 0, "Do Now actions must not be empty");
    assert.ok(adv.avoidActions.length > 0, "Avoid actions must not be empty");
    assert.ok(adv.preparationActions.length > 0, "Prepare actions must not be empty");
    assert.ok(adv.emergencyGuidance.length > 0, "Emergency guidance must not be empty");
  });

  // ── Test 9: Smart Alerts Prioritization ───────────────────────────────────
  await t.test("9. Smart Alerts: Correct alert structure and severity representation", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Alert Test",
      customInputs: {
        temperature: 24,
        humidity: 98,
        windSpeed: 110,
        rainfall: 120,
        forecastRainfall: 110,
        historicalRisk: 85,
        terrainSlope: 30,
        pressure: 975,
      },
    });

    const alerts = result.alerts;
    assert.ok(alerts, "Alerts must be present");
    assert.ok(alerts.status, "Alert status must be present");
    assert.equal(alerts.severity, "Severe");
  });

  // ── Test 10: Phase 13 Emergency Mode Integration Compatibility ────────────
  await t.test("10. Emergency Mode: Full Phase 13 state machine and SOS integration preserved", async () => {
    // 1. Activate Emergency Mode
    const activation = await activateEmergency({
      latitude: 13.0827,
      longitude: 80.2707,
      locationLabel: "Chennai Downtown",
    });
    assert.equal(activation.status, "SUCCESS");
    assert.equal(activation.state, EMERGENCY_STATES.EMERGENCY_ACTIVE);

    // 2. Trigger SOS
    const sos = await triggerSos({
      eventId: activation.eventId,
      latitude: 13.0827,
      longitude: 80.2707,
      locationLabel: "Chennai Downtown",
      emergencyType: "USER_SOS",
    });
    assert.equal(sos.state, EMERGENCY_STATES.SOS_SENT);

    // 3. Update safety check-in to SAFE
    const safeCheckIn = await updateSafetyStatus({
      eventId: activation.eventId,
      safetyStatus: "SAFE",
      notes: "Checked in via Phase 14 unified dashboard",
    });
    assert.equal(safeCheckIn.state, EMERGENCY_STATES.SAFE);

    // 4. Query current status
    const status = await getEmergencyStatus(activation.eventId);
    assert.equal(status.state, EMERGENCY_STATES.SAFE);
    assert.equal(status.safetyStatus, "SAFE");
  });

  // ── Test 11: Graceful Degradation on Incomplete/Unavailable Data ──────────
  await t.test("11. Truthful Status: Normalized result handles missing values without fabricating fake data", () => {
    const emptyResult = createSkyraIntelligenceResult({
      location: {
        latitude: null,
        longitude: null,
        displayName: "Location Unavailable",
        source: "unavailable",
      },
      currentWeather: {
        temperature: null,
        humidity: null,
        windSpeed: null,
        rainfall: null,
      },
      riskScore: 0,
      confidence: 0,
    });

    assert.equal(emptyResult.location.latitude, null);
    assert.equal(emptyResult.location.longitude, null);
    assert.equal(emptyResult.location.displayName, "Location Unavailable");
    assert.equal(emptyResult.location.source, "unavailable");
    assert.equal(emptyResult.riskScore, 0);
  });

  // ── Test 12: Multi-City Coordinate Isolation ──────────────────────────────
  await t.test("12. Coordinate Isolation: Chennai, Mumbai, and Delhi return independent telemetry", async () => {
    const chennai = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai",
      customInputs: { temperature: 33, rainfall: 40, windSpeed: 50, humidity: 85 },
    });

    const mumbai = await getIntelligenceForLocation({
      latitude: 19.0760,
      longitude: 72.8777,
      locationName: "Mumbai",
      customInputs: { temperature: 28, rainfall: 5, windSpeed: 20, humidity: 65 },
    });

    const delhi = await getIntelligenceForLocation({
      latitude: 28.6139,
      longitude: 77.2090,
      locationName: "Delhi",
      customInputs: { temperature: 42, rainfall: 0, windSpeed: 12, humidity: 30 },
    });

    assert.notEqual(chennai.location.latitude, mumbai.location.latitude);
    assert.notEqual(mumbai.location.latitude, delhi.location.latitude);
    assert.notEqual(chennai.currentWeather.temperature, delhi.currentWeather.temperature);
    assert.notEqual(chennai.currentWeather.rainfall, delhi.currentWeather.rainfall);
    assert.equal(chennai.location.city, "Chennai");
    assert.equal(mumbai.location.city, "Mumbai");
    assert.equal(delhi.location.city, "Delhi");
  });
});
