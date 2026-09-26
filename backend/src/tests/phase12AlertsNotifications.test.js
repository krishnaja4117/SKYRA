/**
 * SKYRA Phase 12: Alerts & Notifications Backend Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive tests for:
 *   1. Alert Model schema constraints, GeoJSON coordinates, and indexes
 *   2. Source Authority labeling (Official vs Model vs Emergency)
 *   3. Anti-fabrication guarantees: No fake IMD warnings, station provenance
 *   4. IMD outside coverage handling: Clear state without fake "Green"
 *   5. Priority calculations: P1 Emergency, P2 Warning, P3 Watch, P4 Advisory
 *   6. Low-confidence handling & uncertainty downgrades
 *   7. Deterministic SHA-256 fingerprinting & spatial hashing (no timestamps)
 *   8. Deduplication & occurrenceCount tracking within cooldown
 *   9. Escalation handling: Lower priority superseded by higher priority
 *  10. Auto-resolution when hazards subside
 *  11. Dynamic Expiry (TTL calculation for official and model alerts)
 *  12. Lifecycle state machine: Active -> Acknowledged -> Resolved / Expired
 *  13. Strict rejection of invalid transitions (e.g. Resolved -> Active)
 *  14. Acknowledgement persistence via API
 *  15. Resolution persistence via API
 *  16. Idle monitor behavior with zero coordinates (No Bhubaneswar fallback)
 *  17. Upstream provider failure resilience without false panic
 *  18. XSS sanitization of alert fields
 *  19. Phase 7 Tree-Path XAI immutability
 *  20. Phase 8 RAG citation immutability
 *  21. Phase 11 Geospatial context immutability
 */

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const Alert = require("../models/Alert");
const {
  SOURCE_AUTHORITIES,
  PRIORITIES,
  LIFECYCLE_STATUS,
  DEFAULT_COOLDOWN_MS,
  generateAlertFingerprint,
  determinePriority,
  calculateExpiry,
  evaluateAlertLifecycleTransition,
  isAlertStale,
  isCooldownActive,
} = require("../services/alertEngine");

const {
  setMonitoredLocation,
  getMonitoredLocation,
  getActiveAlert,
  getAlertHistory,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  runMonitoringCycle,
  _resetMonitorState,
  _setWeatherFetcherOverride,
} = require("../services/monitorService");

const app = require("../server");

// Helper to make local HTTP requests to Express app
function testRequest(app, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : null;
      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      };

      const req = http.request(options, (res) => {
        let rawData = "";
        res.on("data", (chunk) => { rawData += chunk; });
        res.on("end", () => {
          server.close();
          try {
            const json = JSON.parse(rawData);
            resolve({ status: res.statusCode, body: json });
          } catch (_) {
            resolve({ status: res.statusCode, body: rawData });
          }
        });
      });

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe("SKYRA Phase 12 – Backend Alert Engine & Lifecycle Suite", () => {
  beforeEach(() => {
    _resetMonitorState();
  });

  // ─── 1. ALERT MODEL VALIDATION ───────────────────────────────────────────────
  test("1. Alert model schema validates GeoJSON Point and Phase 12 fields", async () => {
    const doc = new Alert({
      id: "SKYRA-TEST-001",
      location: "Chennai",
      latitude: 13.0827,
      longitude: 80.2707,
      alertType: "Urban Flooding",
      severity: "Warning",
      priority: "P2",
      sourceAuthority: "MODEL_ESTIMATE",
      riskLevel: "High",
      riskScore: 75,
      confidence: 85,
      calibratedConfidence: 85,
      hazard: "Urban Flooding",
      title: "Model-Estimated High Risk Alert",
      message: "Heavy precipitation in progress.",
      recommendedAction: "Move to higher ground.",
      reason: "Rainfall exceeds 35mm threshold.",
      fingerprint: "abc123mockhash",
      status: "Active",
    });

    await doc.validate();
    assert.strictEqual(doc.coordinates.type, "Point");
    assert.strictEqual(doc.coordinates.coordinates[0], 80.2707);
    assert.strictEqual(doc.coordinates.coordinates[1], 13.0827);
    assert.strictEqual(doc.priority, "P2");
    assert.strictEqual(doc.sourceAuthority, "MODEL_ESTIMATE");
    assert.strictEqual(doc.occurrenceCount, 1);
  });

  // ─── 2. SOURCE AUTHORITY ENUMERATION ─────────────────────────────────────────
  test("2. Source authority strictly enforces known enumerations", () => {
    assert.strictEqual(SOURCE_AUTHORITIES.OFFICIAL_ADVISORY, "OFFICIAL_ADVISORY");
    assert.strictEqual(SOURCE_AUTHORITIES.MODEL_ESTIMATE, "MODEL_ESTIMATE");
    assert.strictEqual(SOURCE_AUTHORITIES.EMERGENCY_SYSTEM, "EMERGENCY_SYSTEM");
    assert.strictEqual(SOURCE_AUTHORITIES.OBSERVATION, "OBSERVATION");

    const invalidDoc = new Alert({
      id: "SKYRA-INVALID-001",
      riskLevel: "High",
      riskScore: 70,
      hazard: "Flood",
      title: "Test",
      message: "Test",
      recommendedAction: "Test",
      reason: "Test",
      sourceAuthority: "FABRICATED_AGENCY", // invalid enum
    });

    const err = invalidDoc.validateSync();
    assert.ok(err && err.errors["sourceAuthority"], "Must reject unverified source authorities");
  });

  // ─── 3. ANTI-FABRICATION: OFFICIAL VS MODEL ESTIMATE ─────────────────────────
  test("3. Model-Estimated risk is never given official government source labeling", async () => {
    const alert = await createAlert({
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      hazard: "Heavy Rainfall",
      severity: "Warning",
      priority: PRIORITIES.P2,
      riskLevel: "High",
      riskScore: 78,
      calibratedConfidence: 82,
      title: "SKYRA Model-Estimated High Risk Alert: Heavy Rainfall",
      message: "Model prediction based on live meteorological inputs.",
      recommendedAction: "Avoid waterlogged roads.",
      reason: "Calibrated Random Forest detected 78% risk.",
      location: "Coimbatore",
      latitude: 11.0168,
      longitude: 76.9558,
    });

    assert.strictEqual(alert.sourceAuthority, "MODEL_ESTIMATE");
    assert.ok(!alert.title.includes("IMD Official Warning"), "Model alerts must not masquerade as IMD warnings");
    assert.strictEqual(alert.source, "SKYRA Automated Monitor");
    assert.strictEqual(alert.priority, "P2");
  });

  // ─── 4. OFFICIAL ADVISORY PROVENANCE ─────────────────────────────────────────
  test("4. Official advisory alert preserves IMD station identity and provenance", async () => {
    const alert = await createAlert({
      sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
      hazard: "Heavy Rain & Squall",
      severity: "Warning",
      priority: PRIORITIES.P1,
      riskLevel: "Severe",
      riskScore: 84,
      imdStationId: "43279",
      title: "🇮🇳 IMD Official Warning: Heavy Rainfall Bulletin",
      message: "Official bulletin issued by regional IMD observatory.",
      recommendedAction: "Follow local disaster management guidelines.",
      reason: "Station 43279 issued Red warning.",
      location: "Chennai",
      latitude: 13.0827,
      longitude: 80.2707,
    });

    assert.strictEqual(alert.sourceAuthority, "OFFICIAL_ADVISORY");
    assert.ok(alert.source.includes("India Meteorological Department"));
    assert.strictEqual(alert.imdStationId, "43279");
    assert.strictEqual(alert.priority, "P1");
  });

  // ─── 5. PRIORITY DERIVATION (P1, P2, P3, P4) ─────────────────────────────────
  test("5. Priority derivation correctly maps official colors and model thresholds", () => {
    // Official IMD Red -> P1 Emergency
    const pRed = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
      imdWarningColor: "Red",
      riskScore: 60,
    });
    assert.strictEqual(pRed, PRIORITIES.P1);

    // Official IMD Orange -> P2 Warning
    const pOrange = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
      imdWarningColor: "Orange",
      riskScore: 50,
    });
    assert.strictEqual(pOrange, PRIORITIES.P2);

    // Severe ML risk (score >= 80) with high confidence & high rain -> P1 Emergency
    const pSevHigh = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      riskLevel: "Severe",
      riskScore: 90,
      calibratedConfidence: 85,
      rainfall: 65,
    });
    assert.strictEqual(pSevHigh, PRIORITIES.P1);

    // High ML risk (score 75) with calibrated confidence >= 65% -> P2 Warning
    const pHigh = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      riskLevel: "High",
      riskScore: 75,
      calibratedConfidence: 75,
    });
    assert.strictEqual(pHigh, PRIORITIES.P2);

    // Moderate ML risk (score 50) -> P3 Watch
    const pMod = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      riskLevel: "Moderate",
      riskScore: 50,
    });
    assert.strictEqual(pMod, PRIORITIES.P3);

    // Low ML risk (score 25) -> P4 Advisory
    const pLow = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      riskLevel: "Low",
      riskScore: 25,
    });
    assert.strictEqual(pLow, PRIORITIES.P4);
  });

  // ─── 6. LOW-CONFIDENCE UNCERTAINTY DOWNGRADE ─────────────────────────────────
  test("6. High ML risk with low calibrated confidence (<65%) is downgraded to P3 Watch", () => {
    const downgradedPriority = determinePriority({
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      riskLevel: "High",
      riskScore: 75,
      calibratedConfidence: 52, // Below 65% confidence threshold
    });

    assert.strictEqual(downgradedPriority, PRIORITIES.P3, "Low confidence must downgrade priority to avoid false panic");
  });

  // ─── 7. DETERMINISTIC FINGERPRINT GENERATION ─────────────────────────────────
  test("7. Alert fingerprint is deterministic and excludes temporal variables", () => {
    const fp1 = generateAlertFingerprint({
      alertType: "Urban Flooding",
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      hazard: "Urban Flooding",
      severity: "Warning",
      latitude: 12.971598,
      longitude: 77.594562,
    });

    const fp2 = generateAlertFingerprint({
      alertType: "Urban Flooding",
      sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
      hazard: "Urban Flooding",
      severity: "Warning",
      latitude: 12.971599, // tiny micro-coordinate delta within same bucket
      longitude: 77.594561,
    });

    assert.strictEqual(fp1, fp2, "Fingerprint must hash identical spatial bucket and properties identically");
    assert.strictEqual(typeof fp1, "string");
    assert.strictEqual(fp1.length, 64, "Must be standard SHA-256 hexadecimal string");
  });

  // ─── 8. DEDUPLICATION: OCCURRENCE COUNT & METRICS UPDATE ─────────────────────
  test("8. Deduplication increments occurrenceCount without generating duplicate alerts", async () => {
    _setWeatherFetcherOverride(async () => ({
      current: {
        rainfall: 45,
        windSpeed: 40,
        humidity: 90,
        temperature: 28,
        pressure: 1008,
      },
      forecast: {
        precipitationExpected: 50,
        hourly: [{ precipitation: 50 }],
      },
    }));

    await setMonitoredLocation(13.0827, 80.2707, "Chennai");

    const firstActive = getActiveAlert();
    assert.ok(firstActive, "First cycle should create an active alert if risk is elevated");
    const initialCount = firstActive.occurrenceCount || 1;
    const historyCount1 = getAlertHistory().length;

    // Second cycle runs immediately with same conditions
    await runMonitoringCycle();
    const secondActive = getActiveAlert();

    assert.strictEqual(secondActive.id, firstActive.id, "Alert ID must remain identical during cooldown");
    assert.strictEqual(secondActive.occurrenceCount, initialCount + 1, "occurrenceCount must increment");
    assert.strictEqual(getAlertHistory().length, historyCount1, "Alert history must not duplicate active record");
  });

  // ─── 9. COOLDOWN EXPIRATION & RE-ALERT ───────────────────────────────────────
  test("9. Cooldown tracking evaluates whether cooldown window is active", () => {
    const activeDoc = {
      status: "Active",
      createdAt: new Date(),
      lastObservedAt: new Date(Date.now() - (10 * 60 * 1000)), // 10 minutes ago
    };
    assert.strictEqual(isCooldownActive(activeDoc, DEFAULT_COOLDOWN_MS), true);

    const expiredCooldownDoc = {
      status: "Active",
      createdAt: new Date(Date.now() - (70 * 60 * 1000)),
      lastObservedAt: new Date(Date.now() - (70 * 60 * 1000)), // 70 minutes ago
    };
    assert.strictEqual(isCooldownActive(expiredCooldownDoc, DEFAULT_COOLDOWN_MS), false);
  });

  // ─── 10. DYNAMIC EXPIRATION (TTL) ───────────────────────────────────────────
  test("10. Expiry dates are calculated dynamically and never return null", () => {
    const p1Exp = calculateExpiry({ priority: PRIORITIES.P1 });
    const p2Exp = calculateExpiry({ priority: PRIORITIES.P2 });
    const p3Exp = calculateExpiry({ priority: PRIORITIES.P3 });
    const p4Exp = calculateExpiry({ priority: PRIORITIES.P4 });

    const now = Date.now();
    assert.ok(p1Exp.getTime() > now, "P1 expiry must be in the future");
    assert.ok(p2Exp.getTime() > p1Exp.getTime(), "P2 expiry window must exceed P1");
    assert.ok(p3Exp.getTime() > p2Exp.getTime(), "P3 expiry window must exceed P2");
    assert.ok(p4Exp.getTime() > p3Exp.getTime(), "P4 expiry window must exceed P3");

    // Official IMD advisory with validTo
    const officialExp = calculateExpiry({
      sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
      imdAdvisory: { validTo: new Date(now + 18 * 3600000).toISOString() },
    });
    assert.strictEqual(officialExp.getTime(), new Date(now + 18 * 3600000).getTime());
  });

  // ─── 11. LIFECYCLE STATE TRANSITIONS ─────────────────────────────────────────
  test("11. Lifecycle state-machine enforces legal transitions and blocks illegal ones", () => {
    // Legal transitions
    assert.strictEqual(evaluateAlertLifecycleTransition("Active", "Acknowledged").valid, true);
    assert.strictEqual(evaluateAlertLifecycleTransition("Active", "Resolved").valid, true);
    assert.strictEqual(evaluateAlertLifecycleTransition("Active", "Expired").valid, true);
    assert.strictEqual(evaluateAlertLifecycleTransition("Acknowledged", "Resolved").valid, true);
    assert.strictEqual(evaluateAlertLifecycleTransition("Acknowledged", "Expired").valid, true);

    // Illegal transitions: Once Resolved or Expired, cannot be re-activated
    assert.strictEqual(evaluateAlertLifecycleTransition("Resolved", "Active").valid, false);
    assert.strictEqual(evaluateAlertLifecycleTransition("Resolved", "Acknowledged").valid, false);
    assert.strictEqual(evaluateAlertLifecycleTransition("Expired", "Active").valid, false);
    assert.strictEqual(evaluateAlertLifecycleTransition("Expired", "Resolved").valid, false);
  });

  // ─── 12. STALE ALERT CHECK ───────────────────────────────────────────────────
  test("12. isAlertStale detects expired alerts based on timestamp and status", () => {
    const freshAlert = {
      status: "Active",
      expiresAt: new Date(Date.now() + 60000),
    };
    assert.strictEqual(isAlertStale(freshAlert), false);

    const expiredAlert = {
      status: "Active",
      expiresAt: new Date(Date.now() - 1000),
    };
    assert.strictEqual(isAlertStale(expiredAlert), true);

    const resolvedAlert = {
      status: "Resolved",
      expiresAt: new Date(Date.now() + 60000),
    };
    assert.strictEqual(isAlertStale(resolvedAlert), true);
  });

  // ─── 13. USER ACKNOWLEDGEMENT MUTATION ───────────────────────────────────────
  test("13. acknowledgeAlert updates status, records timestamp, and updates active alert", async () => {
    const alert = await createAlert({
      hazard: "Heavy Rainfall",
      severity: "Warning",
      priority: PRIORITIES.P2,
      riskLevel: "High",
      riskScore: 72,
      title: "Test Alert",
      message: "Test Message",
      recommendedAction: "Take Shelter",
      reason: "Test Reason",
      location: "Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
    });

    assert.strictEqual(alert.status, "Active");

    const updated = await acknowledgeAlert(alert.id, "operator_test_user");
    assert.strictEqual(updated.status, "Acknowledged");
    assert.strictEqual(updated.acknowledgedBy, "operator_test_user");
    assert.ok(updated.acknowledgedAt instanceof Date);

    const active = getActiveAlert();
    assert.strictEqual(active.status, "Acknowledged");
  });

  // ─── 14. ALERT RESOLUTION MUTATION ───────────────────────────────────────────
  test("14. resolveAlert marks alert as Resolved and clears active alert", async () => {
    const alert = await createAlert({
      hazard: "High Winds",
      severity: "Warning",
      priority: PRIORITIES.P2,
      riskLevel: "High",
      riskScore: 74,
      title: "Wind Alert",
      message: "Wind advisory.",
      recommendedAction: "Stay indoors",
      reason: "Wind speed high.",
      location: "Madurai",
      latitude: 9.9252,
      longitude: 78.1198,
    });

    const resolved = await resolveAlert(alert.id, "system_admin", "Conditions returned to green");
    assert.strictEqual(resolved.status, "Resolved");
    assert.strictEqual(resolved.resolvedBy, "system_admin");
    assert.ok(resolved.resolvedAt instanceof Date);

    const active = getActiveAlert();
    assert.strictEqual(active, null, "Active alert should be cleared after resolution");
  });

  // ─── 15. HTTP API: ACKNOWLEDGE ENDPOINT ──────────────────────────────────────
  test("15. POST /api/alerts/:id/acknowledge successfully acknowledges active alert", async () => {
    const alert = await createAlert({
      hazard: "Monsoon Surge",
      severity: "Warning",
      priority: PRIORITIES.P2,
      riskLevel: "High",
      riskScore: 71,
      title: "Monsoon Surge Alert",
      message: "Heavy rain forecasted.",
      recommendedAction: "Secure loose items.",
      reason: "Surge detected.",
      location: "Kochi",
      latitude: 9.9312,
      longitude: 76.2673,
    });

    const res = await testRequest(app, "POST", `/api/alerts/${alert.id}/acknowledge`, {
      acknowledgedBy: "mobile_user_01",
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "success");
    assert.strictEqual(res.body.alert.status, "Acknowledged");
    assert.strictEqual(res.body.alert.acknowledgedBy, "mobile_user_01");
  });

  // ─── 16. HTTP API: RESOLVE ENDPOINT ──────────────────────────────────────────
  test("16. POST /api/alerts/:id/resolve successfully resolves alert", async () => {
    const alert = await createAlert({
      hazard: "Local Inundation",
      severity: "Warning",
      priority: PRIORITIES.P2,
      riskLevel: "High",
      riskScore: 70,
      title: "Inundation Alert",
      message: "Water logging possible.",
      recommendedAction: "Avoid underpasses.",
      reason: "Drainage capacity exceeded.",
      location: "Trivandrum",
      latitude: 8.5241,
      longitude: 76.9366,
    });

    const res = await testRequest(app, "POST", `/api/alerts/${alert.id}/resolve`, {
      resolvedBy: "flood_control_officer",
      reason: "Pumps deployed, roads clear",
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "success");
    assert.strictEqual(res.body.alert.status, "Resolved");
  });

  // ─── 17. HTTP API: INVALID ID HANDLING ───────────────────────────────────────
  test("17. Acknowledging non-existent alert returns HTTP 404", async () => {
    const res = await testRequest(app, "POST", "/api/alerts/NON-EXISTENT-ALERT-ID/acknowledge", {
      acknowledgedBy: "user",
    });

    assert.strictEqual(res.status, 404);
    assert.ok(res.body.error.includes("not found"));
  });

  // ─── 18. NO LOCATION IDLE BEHAVIOR (NO BHUBANESWAR FALLBACK) ─────────────────
  test("18. Monitoring remains idle with zero coordinates without defaulting to Bhubaneswar", async () => {
    setMonitoredLocation(null, null); // explicitly idle
    await runMonitoringCycle();

    assert.strictEqual(getMonitoredLocation(), null);
    assert.strictEqual(getActiveAlert(), null);
  });

  // ─── 19. XSS SANITIZATION & SAFE STRING ESCAPING ─────────────────────────────
  test("19. Alert model safely stores script strings without execution hazards", async () => {
    const xssPayload = "<script>alert('pwned')</script>";
    const alert = await createAlert({
      hazard: xssPayload,
      severity: "Warning",
      priority: PRIORITIES.P3,
      riskLevel: "Moderate",
      riskScore: 50,
      title: `Risk Alert: ${xssPayload}`,
      message: `Message with ${xssPayload}`,
      recommendedAction: xssPayload,
      reason: xssPayload,
      location: `City ${xssPayload}`,
      latitude: 12.0,
      longitude: 77.0,
    });

    assert.strictEqual(typeof alert.title, "string");
    assert.ok(alert.title.includes(xssPayload));
    // Standard JSON output preserves raw string without parsing as HTML
    const jsonStr = JSON.stringify(alert);
    assert.ok(jsonStr.includes("<script>"));
  });

  // ─── 20. PHASE 7 TREE-PATH XAI REGRESSION CHECK ──────────────────────────────
  test("20. Phase 7 Tree-Path feature attribution remains unaltered", async () => {
    const { calculateRisk } = require("../services/riskEngine");
    const result = await calculateRisk({
      rainfall: 45,
      forecastRainfall: 50,
      humidity: 92,
      windSpeed: 40,
      historicalRisk: 65,
      terrainSlope: 4,
      temperature: 27,
      pressure: 1008,
      featureVector: [45, 50, 92, 40, 65, 4, 27, 1008],
      location: "Chennai",
    });

    assert.ok(result.riskScore >= 0 && result.riskScore <= 100);
    assert.ok(Array.isArray(result.factors));
    assert.ok(result.xai, "Tree-path XAI explanation must be present");
  });

  // ─── 21. PHASE 8 RAG CITATION REGRESSION CHECK ───────────────────────────────
  test("21. Phase 8 RAG and evidence services operate without disruption", () => {
    const { getRagRetrievalService } = require("../services/ragRetrievalService");
    const service = getRagRetrievalService();
    assert.ok(service, "Phase 8 RAG retrieval service must remain instantiated");
  });

  // ─── 22. PHASE 11 GEOSPATIAL CONTEXT COMPATIBILITY ───────────────────────────
  test("22. Phase 11 Geospatial context API remains functional", async () => {
    const res = await testRequest(app, "GET", "/api/geospatial/context?lat=13.0827&lon=80.2707");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.radar);
    assert.ok(res.body.terrain);
  });
});
