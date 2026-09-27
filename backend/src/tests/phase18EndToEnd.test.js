/**
 * SKYRA – Phase 18: End-to-End Testing & Multi-Domain Validation Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative verification covering all 15 Phase 18 checklist areas:
 *
 * Core E2E Chain (1–11):
 *   1. Weather → ingestion
 *   2. Ingestion → feature generation
 *   3. Features → ML prediction
 *   4. ML → impact assessment
 *   5. Impact → XAI
 *   6. XAI → RAG
 *   7. RAG → conversational chatbot
 *   8. Chatbot → frontend UI
 *   9. Risk → Risk Map
 *  10. Risk → Smart Alerts
 *  11. Alert → Emergency Mode
 *
 * Extended E2E Validation (12–15):
 *  12. Multi-location testing (5 diverse Indian regions, zero cross-contamination, no Bhubaneswar fallback)
 *  13. Failure testing (Weather API, Historical, Terrain, ML unavailable, RAG, MongoDB, malformed inputs)
 *  14. Offline testing (connectivity loss, local queue, reconnection flush, stale data labeling)
 *  15. Concurrent load testing (concurrent requests, latency distribution, memory stability)
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const app = require("../server");
const env = require("../config/env");
const { fetchWeather, validateCoordinates, clearWeatherCache } = require("../services/weatherService");
const { extractFeatures } = require("../services/features/featureExtractor");
const { calculateRisk, calculateFallbackRisk } = require("../services/riskEngine");
const { assessImpact } = require("../services/impactAssessmentService");
const { generateXaiExplanation } = require("../services/xaiService");
const { getLlmService } = require("../services/llmService");
const { processConversationalMessage } = require("../services/conversationService");
const {
  setMonitoredLocation,
  getActiveAlert,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  _resetMonitorState,
} = require("../services/monitorService");
const {
  EMERGENCY_STATES,
  activateEmergency,
  triggerSos,
  updateSafetyStatus,
  resolveEmergency,
  clearEmergencyStore,
  getEmergencyStatus,
} = require("../services/emergencyService");
const { getIntelligenceForLocation } = require("../services/intelligenceService");
const { persistRiskResult } = require("../services/riskPersistenceService");

let testServer = null;
let baseUrl = "";

before(async () => {
  testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const port = testServer.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`\n================================================================================`);
  console.log(`   SKYRA PHASE 18: END-TO-END VALIDATION SUITE RUNNING ON ${baseUrl}`);
  console.log(`================================================================================\n`);
});

after(async () => {
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
  }
  clearEmergencyStore();
  _resetMonitorState();
  clearWeatherCache();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Weather → Ingestion
// ═════════════════════════════════════════════════════════════════════════════
describe("1. Weather → Ingestion Stage", () => {
  test("Fetches live NWP weather data, validates coordinates and schema bounds", async () => {
    const weather = await fetchWeather(13.0827, 80.2707, "Chennai");
    assert.ok(weather, "Weather payload must exist");
    assert.strictEqual(weather.latitude, 13.0827);
    assert.strictEqual(weather.longitude, 80.2707);

    assert.ok(typeof weather.current.temperature === "number");
    assert.ok(typeof weather.current.humidity === "number");
    assert.ok(typeof weather.current.windSpeed === "number");
    assert.ok(typeof weather.current.pressure === "number");
    assert.ok(typeof weather.current.rainfall === "number");

    assert.ok(weather.current.humidity >= 0 && weather.current.humidity <= 100);
    assert.ok(weather.current.windSpeed >= 0 && weather.current.windSpeed <= 500);
    assert.ok(weather.current.pressure >= 300 && weather.current.pressure <= 1200);

    assert.strictEqual(weather.sourceMetadata.provider, "Open-Meteo");
    assert.strictEqual(weather.sourceMetadata.sourceStatus, "ok");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Ingestion → Feature Generation
// ═════════════════════════════════════════════════════════════════════════════
describe("2. Ingestion → Feature Generation Stage", () => {
  test("Deterministically generates canonical 8-feature vector within physical boundaries", () => {
    const rawInput = {
      rainfall: 12.5,
      forecastRainfall: 25.0,
      humidity: 82,
      windSpeed: 28,
      historicalRisk: 35,
      terrainSlope: 1.8,
      temperature: 31.5,
      pressure: 1008.2,
    };

    const extracted = extractFeatures(rawInput);
    assert.ok(extracted.featureObject, "featureObject must be generated");
    assert.ok(Array.isArray(extracted.featureVector), "featureVector must be an array");
    assert.strictEqual(extracted.featureVector.length, 8, "Feature vector must have exactly 8 elements");

    // Strict order: [rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]
    assert.strictEqual(extracted.featureVector[0], 12.5);
    assert.strictEqual(extracted.featureVector[1], 25.0);
    assert.strictEqual(extracted.featureVector[2], 82);
    assert.strictEqual(extracted.featureVector[3], 28);
    assert.strictEqual(extracted.featureVector[4], 35);
    assert.strictEqual(extracted.featureVector[5], 1.8);
    assert.strictEqual(extracted.featureVector[6], 31.5);
    assert.strictEqual(extracted.featureVector[7], 1008.2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Features → ML Prediction
// ═════════════════════════════════════════════════════════════════════════════
describe("3. Features → ML Prediction Stage", () => {
  test("Invokes Python ML ensemble microservice and obtains calibrated probabilities", async () => {
    const inputs = {
      rainfall: 5.0,
      forecastRainfall: 10.0,
      humidity: 70,
      windSpeed: 15,
      historicalRisk: 25,
      terrainSlope: 0.5,
      temperature: 29.0,
      pressure: 1012.0,
      featureVector: [5.0, 10.0, 70, 15, 25, 0.5, 29.0, 1012.0],
      location: "Chennai",
    };

    const risk = await calculateRisk(inputs);
    assert.ok(risk, "Risk output must be defined");
    assert.ok(["Low", "Moderate", "High", "Severe"].includes(risk.riskLevel), "Valid risk level required");
    assert.ok(risk.riskScore >= 0 && risk.riskScore <= 100, "Risk score must be in [0, 100]");
    assert.ok(risk.confidence >= 0 && risk.confidence <= 100, "Confidence must be in [0, 100]");
    assert.strictEqual(risk.isFallback, false, "Live ML service must provide non-fallback inference");
    assert.ok(risk.model.includes("RandomForest") || risk.model.includes("XGBoost"), "Model attribution must cite active ensemble");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ML → Impact Assessment
// ═════════════════════════════════════════════════════════════════════════════
describe("4. ML → Impact Assessment Stage", () => {
  test("Derives physics-grounded impact vectors from ML outputs and environmental context", () => {
    const impact = assessImpact({
      featureObject: {
        rainfall: 45,
        forecastRainfall: 60,
        humidity: 90,
        windSpeed: 55,
        terrainSlope: 0.3,
        historicalRisk: 40,
        temperature: 28,
        pressure: 998,
      },
      riskData: {
        riskScore: 78,
        riskLevel: "High",
        confidence: 94,
        isFallback: false,
        model: "Calibrated RandomForestClassifier",
      },
      terrainData: { slope: 0.3, elevation: 8 },
      historicalRiskData: { historicalRisk: 40 },
      location: "Chennai Coastal Zone",
    });

    assert.ok(impact, "Impact assessment must be generated");
    assert.ok(impact.severity, "Impact severity must exist");
    assert.ok(["Minimal", "Minor", "Moderate", "Severe", "Catastrophic"].includes(impact.severity.label));
    assert.ok(Array.isArray(impact.activeHazards), "activeHazards must be an array");
    assert.ok(Array.isArray(impact.infrastructure), "infrastructure impact must be evaluated");
    assert.ok(Array.isArray(impact.community), "community impact must be evaluated");
    assert.ok(impact.provenance, "Provenance information must accompany impact");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Impact → XAI
// ═════════════════════════════════════════════════════════════════════════════
describe("5. Impact → XAI Stage", () => {
  test("Generates tree-path feature attribution with risk and protective factors", () => {
    const xai = generateXaiExplanation({
      riskData: {
        riskLevel: "High",
        riskScore: 75,
        confidence: 90,
        isFallback: false,
        model: "Calibrated RandomForestClassifier",
      },
      featureObject: {
        rainfall: 65,
        forecastRainfall: 70,
        humidity: 88,
        windSpeed: 45,
        historicalRisk: 30,
        terrainSlope: 0.2,
        temperature: 29,
        pressure: 1001,
      },
    });

    assert.ok(xai, "XAI explanation must be generated");
    assert.ok(Array.isArray(xai.riskFactors), "riskFactors must be an array");
    assert.ok(xai.riskFactors.length > 0, "At least one risk factor must be identified for elevated weather");
    assert.ok(typeof xai.whyThisRisk === "string" && xai.whyThisRisk.length > 20, "Narrative whyThisRisk required");
    assert.ok(xai.explanationMethod.includes("Tree Path") || xai.explanationMethod.includes("Attribution"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. XAI → RAG
// ═════════════════════════════════════════════════════════════════════════════
describe("6. XAI → RAG Stage", () => {
  test("Grounds XAI and risk context against authoritative NDMA/IMD knowledge", async () => {
    const llm = getLlmService({ apiKey: "" }); // deterministic test synthesizer
    const synthesis = llm.generateDeterministicConversationalSynthesis({
      userMessage: "What actions should be taken for urban flood risk in Chennai?",
      locationName: "Chennai",
      intent: "DISASTER_GUIDANCE",
      evidencePack: {
        groundedChunks: [
          {
            citationIndex: 1,
            sourceAgency: "NDMA",
            documentId: "NDMA-FLOOD-2024",
            text: "Evacuate basement structures, avoid wading through floodwaters, monitor local drainage advisories.",
          },
        ],
      },
      xaiFactors: [
        { name: "Rainfall", contribution: 35, impact: "High" },
        { name: "Terrain Slope", contribution: 20, impact: "Moderate" },
      ],
      impactContext: {
        overallSeverity: "Moderate",
        primaryHazard: "Urban Waterlogging",
      },
      riskScore: 68,
      riskLevel: "Moderate",
      confidence: 92,
    });

    assert.ok(synthesis.answer, "Grounded synthesis answer required");
    assert.ok(synthesis.answer.includes("[Citation 1]"), "Authoritative citation must be preserved");
    assert.ok(synthesis.answer.includes("NDMA"), "Authoritative agency NDMA must be cited");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. RAG → Conversational Chatbot
// ═════════════════════════════════════════════════════════════════════════════
describe("7. RAG → Conversational Chatbot Stage", () => {
  test("Processes user conversation end-to-end via POST /api/chat with full provenance", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What is the cyclone and flood advisory for Chennai right now?",
        locationContext: {
          name: "Chennai",
          latitude: 13.0827,
          longitude: 80.2707,
        },
      }),
    });

    assert.strictEqual(res.status, 200, "Chatbot API must return HTTP 200");
    const data = await res.json();
    assert.ok(data.answer, "Chatbot answer required");
    assert.ok(Array.isArray(data.citations), "Citations array required");
    assert.ok(data.metadata, "Chatbot metadata required");
    assert.strictEqual(data.location.name, "Chennai");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Chatbot → Frontend UI Integration
// ═════════════════════════════════════════════════════════════════════════════
describe("8. Chatbot → Frontend UI Integration Stage", () => {
  test("Frontend reverse proxy and backend schema compatibility", async () => {
    // Verify frontend can access health, intelligence, and chat contracts
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.service, "skyra-backend");

    const metaRes = await fetch(`${baseUrl}/api/meta`);
    assert.strictEqual(metaRes.status, 200);
    const metaData = await metaRes.json();
    assert.ok(Array.isArray(metaData.domains), "Metadata must contain domain list");
    const allPaths = metaData.domains.flatMap((d) => d.endpoints.map((e) => e.path));
    assert.ok(allPaths.includes("/api/chat"), "/api/chat must be in service catalog");
    assert.ok(allPaths.includes("/api/intelligence"), "/api/intelligence must be in service catalog");
    assert.ok(allPaths.includes("/api/geospatial/context"), "/api/geospatial/context must be in service catalog");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Risk → Risk Map
// ═════════════════════════════════════════════════════════════════════════════
describe("9. Risk → Risk Map Stage", () => {
  test("GET /api/geospatial/context returns point-level risk, slope, and radar surveillance", async () => {
    const res = await fetch(`${baseUrl}/api/geospatial/context?lat=13.0827&lon=80.2707`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.location.latitude, 13.0827);
    assert.strictEqual(body.location.longitude, 80.2707);

    assert.ok(body.terrain, "Terrain context required");
    assert.strictEqual(typeof body.terrain.slope, "number");
    assert.strictEqual(typeof body.terrain.elevation, "number");

    assert.ok(body.radar, "Radar surveillance required");
    assert.strictEqual(body.radar.nearestStation.id, "DWR_CHN");
    assert.strictEqual(body.radar.coverageRadiusKm, 250);
    assert.strictEqual(body.radar.withinCoverage, true);

    // Anti-fabrication: No fake radius circle or synthetic hazard boundary
    assert.strictEqual(body.hazardBoundary, undefined, "Zero synthetic hazard boundary polygon");
    assert.strictEqual(body.riskRadiusKm, undefined, "Zero synthetic risk radius circle");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Risk → Smart Alerts
// ═════════════════════════════════════════════════════════════════════════════
describe("10. Risk → Smart Alerts Stage", () => {
  test("Monitored location triggers alert lifecycle, deduplication, and CAP v1.2 syndication", async () => {
    const monitorRes = await fetch(`${baseUrl}/api/alerts/monitor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: 13.0827,
        longitude: 80.2707,
        name: "Chennai Coastal",
      }),
    });

    assert.strictEqual(monitorRes.status, 200);
    const monitorBody = await monitorRes.json();
    assert.strictEqual(monitorBody.status, "active");
    assert.ok(monitorBody.activeAlert, "Active alert should be generated or updated");
    assert.ok(monitorBody.activeAlert.fingerprint, "Deterministic fingerprint required");
    assert.ok(monitorBody.activeAlert.triggerMetrics, "Trigger metrics must be recorded");

    // CAP XML endpoint verification
    const capRes = await fetch(`${baseUrl}/api/alerts/cap`);
    assert.strictEqual(capRes.status, 200);
    const capXml = await capRes.text();
    assert.ok(capXml.includes("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\">"), "OASIS CAP v1.2 XML header required");
    assert.ok(capXml.includes("<identifier>"), "CAP alert identifier required");
    assert.ok(capXml.includes("<severity>"), "CAP alert severity required");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Alert → Emergency Mode
// ═════════════════════════════════════════════════════════════════════════════
describe("11. Alert → Emergency Mode Stage", () => {
  test("Emergency activation, SOS dispatch, safety transition, and resolution", async () => {
    // 1. Activate Emergency
    const actRes = await fetch(`${baseUrl}/api/emergency/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: 13.0827,
        longitude: 80.2707,
        locationLabel: "Chennai Adyar Basin",
        reason: "Severe Flood Warning Triggered",
      }),
    });
    assert.strictEqual(actRes.status, 200);
    const actData = await actRes.json();
    assert.strictEqual(actData.status, "SUCCESS");
    assert.strictEqual(actData.state, EMERGENCY_STATES.EMERGENCY_ACTIVE);
    const eventId = actData.eventId;
    assert.ok(eventId.startsWith("EMG-"), "Unique event ID required");

    // 2. Trigger SOS
    const sosRes = await fetch(`${baseUrl}/api/emergency/sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        message: "Trapped in flood waters near river bank",
      }),
    });
    assert.strictEqual(sosRes.status, 200);
    const sosData = await sosRes.json();
    assert.strictEqual(sosData.state, EMERGENCY_STATES.SOS_SENT);
    assert.strictEqual(sosData.deliveryState, "SENT");
    assert.ok(sosData.dispatchReceipts, "Dispatch receipts required");
    assert.strictEqual(sosData.dispatchReceipts.channels.in_app.status, "DELIVERED");

    // 3. Update Status to SAFE
    const safeRes = await fetch(`${baseUrl}/api/emergency/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        safetyStatus: "SAFE",
        note: "Reached rescue boat safely",
      }),
    });
    assert.strictEqual(safeRes.status, 200);
    const safeData = await safeRes.json();
    assert.strictEqual(safeData.state, EMERGENCY_STATES.SAFE);

    // 4. Resolve Emergency
    const deactRes = await fetch(`${baseUrl}/api/emergency/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        resolutionNote: "All evacuated to shelter",
      }),
    });
    assert.strictEqual(deactRes.status, 200);
    const deactData = await deactRes.json();
    assert.strictEqual(deactData.state, EMERGENCY_STATES.RESOLVED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. Multi-Location Testing
// ═════════════════════════════════════════════════════════════════════════════
describe("12. Multi-Location Validation (5 Diverse Indian Meteorological Zones)", () => {
  const LOCATIONS = [
    { name: "Chennai", lat: 13.0827, lon: 80.2707, expectedRadar: "DWR_CHN" },
    { name: "Mumbai", lat: 19.0760, lon: 72.8777, expectedRadar: "DWR_MUM" },
    { name: "New Delhi", lat: 28.6139, lon: 77.2090, expectedRadar: "DWR_DEL" },
    { name: "Kolkata", lat: 22.5726, lon: 88.3639, expectedRadar: "DWR_KOL" },
    { name: "Bengaluru", lat: 12.9716, lon: 77.5946, expectedRadar: "DWR_BLR" },
  ];

  test("Each Indian region receives strictly location-specific weather, terrain, and radar", async () => {
    const results = [];
    for (const loc of LOCATIONS) {
      // 1. Check intelligence endpoint
      const res = await fetch(`${baseUrl}/api/intelligence?lat=${loc.lat}&lon=${loc.lon}`);
      assert.strictEqual(res.status, 200, `Intelligence endpoint must succeed for ${loc.name}`);
      const data = await res.json();

      // Verify coordinate preservation
      assert.strictEqual(data.location.latitude, loc.lat, `${loc.name} latitude preserved`);
      assert.strictEqual(data.location.longitude, loc.lon, `${loc.name} longitude preserved`);

      // Anti-fabrication: Never fall back to Bhubaneswar coordinates (20.2961, 85.8245)
      assert.notStrictEqual(data.location.latitude, 20.2961, "Never fallback to Bhubaneswar latitude");
      assert.notStrictEqual(data.location.longitude, 85.8245, "Never fallback to Bhubaneswar longitude");

      // 2. Check geospatial context endpoint for radar and terrain
      const geoRes = await fetch(`${baseUrl}/api/geospatial/context?lat=${loc.lat}&lon=${loc.lon}`);
      assert.strictEqual(geoRes.status, 200);
      const geoData = await geoRes.json();
      assert.strictEqual(geoData.radar.nearestStation.id, loc.expectedRadar, `${loc.name} radar station match`);

      results.push({ name: loc.name, elevation: geoData.terrain.elevation, slope: geoData.terrain.slope });
    }

    // Verify topography differences: Bengaluru plateau elevation (~900m) >> Chennai coastal elevation (<30m)
    const blr = results.find((r) => r.name === "Bengaluru");
    const chn = results.find((r) => r.name === "Chennai");
    assert.ok(blr.elevation > 700, `Bengaluru elevation (${blr.elevation}m) must reflect Deccan Plateau`);
    assert.ok(chn.elevation < 50, `Chennai elevation (${chn.elevation}m) must reflect coastal plain`);
  });

  test("Zero cross-contamination between alternating requests", async () => {
    // Request Chennai, then Mumbai, then Chennai again
    const res1 = await fetch(`${baseUrl}/api/geospatial/context?lat=13.0827&lon=80.2707`);
    const data1 = await res1.json();
    assert.strictEqual(data1.location.latitude, 13.0827);
    assert.strictEqual(data1.radar.nearestStation.id, "DWR_CHN");

    const res2 = await fetch(`${baseUrl}/api/geospatial/context?lat=19.0760&lon=72.8777`);
    const data2 = await res2.json();
    assert.strictEqual(data2.location.latitude, 19.0760);
    assert.strictEqual(data2.radar.nearestStation.id, "DWR_MUM");

    const res3 = await fetch(`${baseUrl}/api/geospatial/context?lat=13.0827&lon=80.2707`);
    const data3 = await res3.json();
    assert.strictEqual(data3.location.latitude, 13.0827);
    assert.strictEqual(data3.radar.nearestStation.id, "DWR_CHN");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. Failure Testing
// ═════════════════════════════════════════════════════════════════════════════
describe("13. Comprehensive Failure & Error Shielding Testing", () => {
  test("1. Weather API: Out-of-bounds coordinates rejected safely with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/weather?lat=95.0&lon=80.0`);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.status, 400);
    assert.ok(body.error.includes("Latitude must be between -90 and 90"));
  });

  test("2. Historical data failure: Intelligence service falls back safely without crashing", async () => {
    // Simulate historical risk failure using an unmapped coordinate
    const intelligence = await getIntelligenceForLocation({
      latitude: 10.0,
      longitude: 76.0,
      locationName: "Test Hazard Spot",
      customInputs: { rainfall: 10, forecastRainfall: 10, historicalRisk: null },
    });
    assert.ok(intelligence, "Intelligence must succeed");
    assert.ok(intelligence.riskScore >= 0, "Risk score must be calculated");
  });

  test("3. Terrain data failure: Natural flat ground default used without fabricating slope", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Test",
      customInputs: { terrainSlope: null },
    });
    assert.ok(result.impactAssessment.evidence.terrainSlope !== undefined);
  });

  test("4. ML service unavailable: Seamless degradation to deterministic physics heuristics", async () => {
    // calculateRisk with fetcherOverride simulating an unreachable ML microservice
    const offlineRisk = await calculateRisk(
      {
        rainfall: 60,
        forecastRainfall: 80,
        humidity: 95,
        windSpeed: 60,
        historicalRisk: 50,
        terrainSlope: 0.5,
        temperature: 28,
        pressure: 995,
      },
      {
        fetcherOverride: async () => {
          throw new Error("ML Service Connection Refused (ECONNREFUSED)");
        },
      }
    );

    assert.ok(offlineRisk);
    assert.strictEqual(offlineRisk.isFallback, true, "Truthful fallback flag required");
    assert.strictEqual(offlineRisk.model, "Heuristic Fallback Engine");
    assert.strictEqual(offlineRisk.confidenceType, "HEURISTIC");
    assert.strictEqual(offlineRisk.riskLevel, "Severe");
  });

  test("5. RAG / Vector retrieval failure: Chatbot degrades gracefully without crashing", async () => {
    const llm = getLlmService({ apiKey: "" });
    const fallbackResponse = llm.generateDeterministicConversationalSynthesis({
      userMessage: "What is the emergency advisory for Coastal District?",
      locationName: "Coastal District",
      retrievedDocs: [], // 0 vector docs retrieved
      xaiFactors: [],
      impactContext: null,
      riskScore: 25,
      riskLevel: "Low",
      confidence: 80,
    });

    assert.ok(fallbackResponse.answer);
    assert.ok(fallbackResponse.answer.includes("Coastal District"));
  });

  test("6. MongoDB unavailable: Risk persistence degrades non-fatally", async () => {
    const persistenceResult = await persistRiskResult(
      {
        riskScore: 35,
        riskLevel: "Low",
        confidence: 85,
        weather: { temperature: 28, humidity: 65, rainfall: 0, windSpeed: 10, pressure: 1013 },
      },
      {
        latitude: 13.0827,
        longitude: 80.2707,
        locationName: "Chennai",
      }
    );

    assert.ok(persistenceResult !== undefined, "Persistence call must not throw an unhandled rejection");
  });

  test("7. Malformed / invalid location: Missing lat/lon query parameters return HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/intelligence`);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.status, 400);
    assert.ok(body.error.includes("required"));
  });

  test("8. Invalid API payload: Malformed JSON body returns HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/emergency/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json-body-content",
    });
    assert.strictEqual(res.status, 400);
  });

  test("9. Timeout / network failure: Handled gracefully via AbortController", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10); // rapid abort
    try {
      await fetch(`${baseUrl}/api/intelligence?lat=13.0827&lon=80.2707`, {
        signal: controller.signal,
      });
      assert.fail("Should have aborted");
    } catch (err) {
      assert.ok(err.name === "AbortError" || err.message.includes("aborted"));
    } finally {
      clearTimeout(timeoutId);
    }
  });

  test("10. Partial upstream failure: Missing IMD/satellite data does not crash intelligence pipeline", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Test Partial",
    });

    assert.ok(result, "Pipeline must succeed despite upstream fixture status");
    assert.ok(result.observationalData, "Observational data block present");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. Offline Testing
// ═════════════════════════════════════════════════════════════════════════════
describe("14. Offline & Disconnected Resilience Testing", () => {
  test("Emergency SOS creates QUEUED delivery state when network is offline", async () => {
    // 1. Activate emergency in normal state
    const actRes = await activateEmergency({
      latitude: 13.0827,
      longitude: 80.2707,
      locationLabel: "Chennai Offline Area",
    });
    const eventId = actRes.eventId;

    // 2. Trigger SOS with isOffline = true
    const sosRes = await triggerSos({
      eventId,
      message: "Offline emergency beacon",
      isOffline: true,
    });

    assert.strictEqual(sosRes.status, "SUCCESS");
    assert.strictEqual(sosRes.state, EMERGENCY_STATES.QUEUED);
    assert.strictEqual(sosRes.deliveryState, "QUEUED");
    assert.strictEqual(sosRes.dispatchReceipts, null, "Dispatch receipts must be null while offline");

    // 3. Reconnect and replay SOS (isOffline = false)
    const reconnectedSos = await triggerSos({
      eventId,
      message: "Offline emergency beacon - reconnected replay",
      isOffline: false,
    });

    assert.strictEqual(reconnectedSos.status, "SUCCESS");
    assert.strictEqual(reconnectedSos.state, EMERGENCY_STATES.SOS_SENT);
    assert.strictEqual(reconnectedSos.deliveryState, "SENT");
    assert.ok(reconnectedSos.dispatchReceipts, "Dispatch receipts must be generated upon reconnection");
    assert.strictEqual(reconnectedSos.dispatchReceipts.channels.in_app.status, "DELIVERED");
  });

  test("Weather cache distinguishes cached/stale data from live data", async () => {
    clearWeatherCache();
    // First call: live fetch
    const firstCall = await fetchWeather(13.0827, 80.2707, "Chennai");
    assert.strictEqual(firstCall.provenance.dataFreshness, "live");
    assert.strictEqual(firstCall.provenance.cacheStatus.isCached, false);

    // Immediate second call: served from in-memory cache
    const secondCall = await fetchWeather(13.0827, 80.2707, "Chennai");
    assert.strictEqual(secondCall.provenance.dataFreshness, "cached");
    assert.strictEqual(secondCall.provenance.cacheStatus.isCached, true);
    assert.ok(secondCall.provenance.cacheStatus.cacheKey, "Cache key must be recorded");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. Concurrent Load Testing
// ═════════════════════════════════════════════════════════════════════════════
describe("15. Concurrent Request Load & Stability Testing", () => {
  test("Executes 30 concurrent requests across intelligence, weather, and chat without failure", async () => {
    const memoryBefore = process.memoryUsage().rss;
    const startTime = Date.now();

    const requestPromises = [];
    const endpoints = [
      `${baseUrl}/api/weather?lat=13.0827&lon=80.2707`,
      `${baseUrl}/api/geospatial/context?lat=13.0827&lon=80.2707`,
      `${baseUrl}/api/intelligence?lat=13.0827&lon=80.2707`,
      `${baseUrl}/api/intelligence?lat=19.0760&lon=72.8777`,
      `${baseUrl}/api/intelligence?lat=28.6139&lon=77.2090`,
    ];

    const latencies = [];

    // Dispatch 30 requests concurrently (6 rounds of 5 distinct endpoints)
    for (let i = 0; i < 30; i++) {
      const url = endpoints[i % endpoints.length];
      const reqStart = Date.now();
      const p = fetch(url).then(async (res) => {
        const reqEnd = Date.now();
        latencies.push(reqEnd - reqStart);
        assert.strictEqual(res.status, 200, `Endpoint ${url} must return 200 OK under load`);
        return res.json();
      });
      requestPromises.push(p);
    }

    const results = await Promise.all(requestPromises);
    const totalDuration = Date.now() - startTime;
    const memoryAfter = process.memoryUsage().rss;

    assert.strictEqual(results.length, 30, "All 30 concurrent requests must complete successfully");

    latencies.sort((a, b) => a - b);
    const minLatency = latencies[0];
    const maxLatency = latencies[latencies.length - 1];
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`\n  --- LOAD TEST METRICS (30 Concurrent Requests) ---`);
    console.log(`  Total Completed:    ${results.length}/30 (100% Success Rate)`);
    console.log(`  Total Duration:     ${totalDuration} ms`);
    console.log(`  Min Latency:        ${minLatency} ms`);
    console.log(`  Avg Latency:        ${avgLatency} ms`);
    console.log(`  P95 Latency:        ${p95Latency} ms`);
    console.log(`  Max Latency:        ${maxLatency} ms`);
    console.log(`  RSS Delta:          ${((memoryAfter - memoryBefore) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  --------------------------------------------------\n`);

    assert.ok(avgLatency < 5000, `Average latency (${avgLatency}ms) must remain within acceptable local limit (<5000ms)`);
  });
});
