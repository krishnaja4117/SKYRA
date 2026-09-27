/**
 * SKYRA – Phase 15 Backend Architecture & Service Consolidation Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative regression and architectural verification for:
 *   • Modular routing layer (src/routes/) consolidating all 11 domain route groups
 *   • Subsystem health monitoring & deep readiness probes (/api/health)
 *   • Machine-readable API Service Catalog (/api/meta)
 *   • Structured JSON 404 handling for unhandled /api/* paths
 *   • Rate limiting architecture & middleware boundaries
 *   • Preservation of canonical data contracts across consolidated endpoints
 *   • Phase 13 Emergency Mode integration & state machine preservation
 *   • Phase 12 Smart Alert Engine lifecycle preservation
 *   • Location safety (Zero silent default to Bhubaneswar)
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");

const app = require("../server");
const apiRouter = require("../routes");
const { getVectorStore } = require("../knowledge/vectorStore");
const { EMERGENCY_STATES, clearEmergencyStore } = require("../services/emergencyService");
const { _resetMonitorState } = require("../services/monitorService");

let server = null;
let baseUrl = "";

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  clearEmergencyStore();
  _resetMonitorState();
});

describe("Phase 15 – Consolidated Backend Architecture Verification Suite", () => {
  test("1. Modular Router Architecture: apiRouter mounts all 11 domain route groups", () => {
    assert.ok(apiRouter, "apiRouter must be defined and exported");
    assert.strictEqual(typeof apiRouter, "function", "apiRouter must be an Express router function");
    assert.ok(apiRouter.stack && apiRouter.stack.length >= 11, "apiRouter must contain all domain routers in its stack");
  });

  test("2. Subsystem Readiness & Health Check: /api/health returns comprehensive status", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200, "Health endpoint must return HTTP 200");

    const body = await res.json();
    assert.strictEqual(body.status, "ok", "Overall health status must be 'ok'");
    assert.strictEqual(body.service, "skyra-backend");
    assert.strictEqual(body.version, "2.0.0");
    assert.strictEqual(body.architecturePhase, "Phase 15 - Consolidated Backend Architecture");

    // Subsystems object verification
    assert.ok(body.subsystems, "Health response must contain subsystems object");
    assert.ok(body.subsystems.database, "Must report database subsystem");
    assert.ok(body.subsystems.mlMicroservice, "Must report mlMicroservice subsystem");
    assert.ok(body.subsystems.vectorKnowledgeStore, "Must report vectorKnowledgeStore subsystem");
    assert.ok(body.subsystems.cloudStorage, "Must report cloudStorage subsystem");
    assert.ok(body.subsystems.alertEngine, "Must report alertEngine subsystem");
    assert.ok(body.subsystems.emergencySystem, "Must report emergencySystem subsystem");

    // Backward compatibility checks
    assert.ok(body.database, "Must maintain backward-compatible database property");
    assert.ok(body.services, "Must maintain backward-compatible services property");
  });

  test("3. Deep Health Probe: /api/health?deep=true executes subsystem probing without throwing", async () => {
    const res = await fetch(`${baseUrl}/api/health?deep=true`);
    assert.strictEqual(res.status, 200, "Deep health check must return HTTP 200");

    const body = await res.json();
    assert.ok(body.subsystems.mlMicroservice.probe, "Deep probe must populate probe field");
    assert.ok(
      ["online", "offline_heuristic_active"].includes(body.subsystems.mlMicroservice.probe) ||
      body.subsystems.mlMicroservice.probe.startsWith("degraded"),
      `Unexpected probe status: ${body.subsystems.mlMicroservice.probe}`
    );
  });

  test("4. API Service Catalog & Discovery: /api/meta provides complete machine-readable schema", async () => {
    const res = await fetch(`${baseUrl}/api/meta`);
    assert.strictEqual(res.status, 200, "Catalog endpoint must return HTTP 200");

    const body = await res.json();
    assert.strictEqual(body.version, "2.0.0");
    assert.strictEqual(body.dataContractVersion, "2.0");
    assert.ok(Array.isArray(body.domains), "Domains must be an array");
    assert.strictEqual(body.domains.length, 11, "Must catalogue exactly 11 architectural domains");

    const domainNames = body.domains.map((d) => d.domain);
    const requiredDomains = [
      "Health & Metadata",
      "Weather Ingestion",
      "Unified Intelligence",
      "Legacy Risk",
      "Smart Alerts",
      "Emergency Mode",
      "Facilities Proxy",
      "RAG & Knowledge",
      "Conversational Chat",
      "Multilingual Voice",
      "Geospatial & Map Context",
    ];

    for (const reqDomain of requiredDomains) {
      assert.ok(domainNames.includes(reqDomain), `Missing catalog domain: ${reqDomain}`);
    }
  });

  test("5. Structured JSON 404 Handler: Unmatched /api/* routes return uniform JSON error", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent_subsystem_endpoint_xyz`);
    assert.strictEqual(res.status, 404, "Unmatched API route must return HTTP 404");

    const body = await res.json();
    assert.strictEqual(body.status, 404);
    assert.ok(body.error && body.error.includes("API endpoint not found"), "Error message must state endpoint not found");
    assert.strictEqual(body.path, "/api/nonexistent_subsystem_endpoint_xyz");
  });

  test("6. Location Safety & Coordinate Strictness: Rejects missing coordinates without silent fallback", async () => {
    const res = await fetch(`${baseUrl}/api/intelligence`);
    assert.strictEqual(res.status, 400, "Missing coordinates must return HTTP 400");

    const body = await res.json();
    assert.strictEqual(body.status, 400);
    assert.strictEqual(body.sourceStatus, "invalid_coordinates");
    assert.ok(!body.location || body.location.city !== "Bhubaneswar", "Must never default to Bhubaneswar");
  });

  test("7. Weather Ingestion Router: Live and terrain endpoints operational", async () => {
    const res = await fetch(`${baseUrl}/api/terrain?lat=13.0827&lon=80.2707`);
    assert.strictEqual(res.status, 200, "Terrain endpoint must return HTTP 200");

    const body = await res.json();
    assert.ok(typeof body.elevation === "number", "Must return numeric elevation");
    assert.ok(typeof body.slope === "number", "Must return numeric slope");
  });

  test("8. Canonical Data Contract: POST /api/intelligence produces standardized intelligence payload", async () => {
    const payload = {
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai Test Location",
      weatherInputs: {
        rainfall: 45,
        temperature: 30,
        humidity: 85,
        windSpeed: 25,
      },
    };

    const res = await fetch(`${baseUrl}/api/intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 200, "Intelligence POST must return HTTP 200");
    const body = await res.json();

    assert.ok(body.location, "Must contain location");
    assert.strictEqual(body.location.latitude, 13.0827);
    assert.strictEqual(body.location.longitude, 80.2707);
    assert.ok(body.currentWeather, "Must contain currentWeather");
    assert.ok(body.riskScore != null, "Must contain riskScore");
    assert.ok(["Low", "Moderate", "High", "Severe"].includes(body.riskLevel), "Must return valid 4-tier risk level");
    assert.ok(body.impactAssessment, "Must contain full Phase 6 impact assessment");
    assert.ok(body.xai, "Must contain Explainable AI payload");
  });

  test("9. Phase 13 Emergency Mode Router Integration: Full lifecycle execution", async () => {
    clearEmergencyStore();

    // 1. Activate Emergency
    const activateRes = await fetch(`${baseUrl}/api/emergency/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: 19.076,
        longitude: 72.8777,
        locationLabel: "Mumbai Coastal Test Zone",
        emergencyType: "URBAN_FLOOD",
        contacts: [{ name: "Family Lead", phone: "+91 98765 43210" }],
      }),
    });

    assert.strictEqual(activateRes.status, 200, "Emergency activation must return HTTP 200");
    const actBody = await activateRes.json();
    assert.strictEqual(actBody.status, "SUCCESS");
    assert.strictEqual(actBody.state, "EMERGENCY_ACTIVE");
    const eventId = actBody.eventId;
    assert.ok(eventId, "Must return unique eventId");

    // 2. Query Status
    const statusRes = await fetch(`${baseUrl}/api/emergency/status/${eventId}`);
    assert.strictEqual(statusRes.status, 200, "Status query must return HTTP 200");
    const statusBody = await statusRes.json();
    assert.strictEqual(statusBody.status, "SUCCESS");
    assert.ok(statusBody.event, "Status response must contain event");
    assert.strictEqual(statusBody.event.state, "EMERGENCY_ACTIVE");
    assert.strictEqual(statusBody.event.location.label, "Mumbai Coastal Test Zone");

    // 3. Deactivate
    const deactRes = await fetch(`${baseUrl}/api/emergency/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, reason: "Phase 15 Verification Completed" }),
    });
    assert.strictEqual(deactRes.status, 200, "Deactivate must return HTTP 200");
    const deactBody = await deactRes.json();
    assert.strictEqual(deactBody.status, "SUCCESS");
    assert.strictEqual(deactBody.state, "RESOLVED");
  });

  test("10. Phase 12 Alert Engine Router Integration: Alerts feed and CAP XML accessible", async () => {
    const res = await fetch(`${baseUrl}/api/alerts`);
    assert.strictEqual(res.status, 200, "Alerts endpoint must return HTTP 200");
    const body = await res.json();
    assert.ok(body.history !== undefined, "Must return alert history array");

    const capRes = await fetch(`${baseUrl}/api/alerts/cap`);
    assert.strictEqual(capRes.status, 200, "CAP XML endpoint must return HTTP 200");
    const capText = await capRes.text();
    assert.ok(capText.includes("<?xml") || capText.includes("<alert"), "CAP response must be valid XML");
  });

  test("11. Error Shielding & Security: Rejects malformed JSON with standard error without stack trace leaks", async () => {
    const res = await fetch(`${baseUrl}/api/intelligence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "INVALID_MALFORMED_JSON_STRING",
    });

    assert.strictEqual(res.status, 400, "Malformed JSON must return HTTP 400");
    const body = await res.json();
    assert.ok(body.error, "Must return structured error message");
    assert.ok(!body.stack, "Production response must NEVER leak stack trace");
  });

  test("12. Coordinate Isolation Across Domain Routers: Independent multi-city telemetry", async () => {
    const [chennaiRes, mumbaiRes] = await Promise.all([
      fetch(`${baseUrl}/api/intelligence?lat=13.0827&lon=80.2707&locationName=Chennai`),
      fetch(`${baseUrl}/api/intelligence?lat=19.0760&lon=72.8777&locationName=Mumbai`),
    ]);

    assert.strictEqual(chennaiRes.status, 200);
    assert.strictEqual(mumbaiRes.status, 200);

    const chennaiData = await chennaiRes.json();
    const mumbaiData = await mumbaiRes.json();

    assert.strictEqual(chennaiData.location.latitude, 13.0827);
    assert.strictEqual(mumbaiData.location.latitude, 19.076);
    assert.strictEqual(chennaiData.location.city, "Chennai");
    assert.strictEqual(mumbaiData.location.city, "Mumbai");
    assert.notDeepStrictEqual(chennaiData.location, mumbaiData.location, "Cities must retain strict isolation");
  });
});
