/**
 * SKYRA – Satellite Remote Sensing (INSAT / MOSDAC) Ingestion Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates:
 *   1. Satellite product schema and physical bound validation.
 *   2. MOSDAC credential configuration and status reporting (safe, no secret leak).
 *   3. Live telemetry retrieval simulation with full provenance.
 *   4. Graceful degradation when credentials are unconfigured or upstream is blocked.
 *   5. In-memory caching lifecycle and cache clearing.
 *   6. Dedicated HTTP endpoint (/api/weather/satellite).
 *   7. Pipeline integration into intelligence and impact assessment.
 */

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");

const {
  fetchSatelliteData,
  clearSatelliteCache,
  validateSatelliteProducts,
  getMosdacConfigStatus,
  SATELLITE_FIXTURES,
} = require("../services/ingestion/satelliteService");

const { assessImpact } = require("../services/impactAssessmentService");
const { getIntelligenceForLocation } = require("../services/intelligenceService");

describe("1. Satellite Product Validation & Configuration Status", () => {
  beforeEach(() => {
    clearSatelliteCache();
  });

  test("validateSatelliteProducts accepts valid physical atmospheric measurements", () => {
    const valid = {
      cloudCoverPercent: 82.5,
      cloudTopTemperatureK: 230.4,
      cloudTopHeightKm: 9.2,
      brightnessTemperatureK: 282.1,
      rainfallRateEstimateMmH: 5.6,
      satelliteName: "INSAT-3DR",
      sensor: "IMAGER-TIR1",
    };
    assert.strictEqual(validateSatelliteProducts(valid), true);
  });

  test("validateSatelliteProducts rejects non-object inputs", () => {
    assert.throws(() => validateSatelliteProducts(null), /must be a non-empty object/);
    assert.throws(() => validateSatelliteProducts("invalid"), /must be a non-empty object/);
  });

  test("validateSatelliteProducts rejects out-of-range cloudCoverPercent (<0 or >100)", () => {
    assert.throws(() => validateSatelliteProducts({ cloudCoverPercent: -5 }), /within \[0, 100\]%/);
    assert.throws(() => validateSatelliteProducts({ cloudCoverPercent: 120 }), /within \[0, 100\]%/);
  });

  test("validateSatelliteProducts rejects unphysical cloudTopTemperatureK (<160 or >340 K)", () => {
    assert.throws(() => validateSatelliteProducts({ cloudTopTemperatureK: 120 }), /out of physical atmospheric range/);
    assert.throws(() => validateSatelliteProducts({ cloudTopTemperatureK: 400 }), /out of physical atmospheric range/);
  });

  test("validateSatelliteProducts rejects unphysical cloudTopHeightKm (<0 or >25 km)", () => {
    assert.throws(() => validateSatelliteProducts({ cloudTopHeightKm: -2 }), /out of tropospheric range/);
    assert.throws(() => validateSatelliteProducts({ cloudTopHeightKm: 32 }), /out of tropospheric range/);
  });

  test("validateSatelliteProducts rejects negative or extreme rainfallRateEstimateMmH", () => {
    assert.throws(() => validateSatelliteProducts({ rainfallRateEstimateMmH: -1 }), /out of valid range/);
    assert.throws(() => validateSatelliteProducts({ rainfallRateEstimateMmH: 600 }), /out of valid range/);
  });

  test("getMosdacConfigStatus reports safe configuration status without exposing credentials", () => {
    const status = getMosdacConfigStatus();
    assert.strictEqual(typeof status.configured, "boolean");
    assert.strictEqual(typeof status.hasApiKey, "boolean");
    assert.strictEqual(typeof status.hasUserEmail, "boolean");
    assert.strictEqual(typeof status.endpoint, "string");
    assert.ok(status.endpoint.includes("mosdac.gov.in"));
    assert.strictEqual(status.provider, "ISRO / MOSDAC Space Applications Centre");
    // Ensure no secret keys are present in the status object
    assert.strictEqual(status.apiKey, undefined);
    assert.strictEqual(status.MOSDAC_API_KEY, undefined);
  });
});

describe("2. Satellite Remote Sensing Telemetry Ingestion", () => {
  beforeEach(() => {
    clearSatelliteCache();
  });

  test("fetchSatelliteData retrieves live telemetry with provenance when live data is provided", async () => {
    const liveTelemetry = {
      cloudCoverPercent: 92.0,
      cloudTopTemperatureK: 218.5,
      cloudTopHeightKm: 11.4,
      brightnessTemperatureK: 275.0,
      rainfallRateEstimateMmH: 14.8,
      satelliteName: "INSAT-3DR",
      sensor: "IMAGER-TIR1",
      observationTime: "2026-10-14T10:30:00.000Z",
    };

    const result = await fetchSatelliteData(10.7089, 76.7479, {
      fetcherOverride: async () => liveTelemetry,
    });

    assert.strictEqual(result.available, true);
    assert.strictEqual(result.products.satelliteName, "INSAT-3DR");
    assert.strictEqual(result.products.rainfallRateEstimateMmH, 14.8);
    assert.strictEqual(result.products.cloudTopTemperatureK, 218.5);
    assert.strictEqual(result.provenance.provider, "ISRO / MOSDAC Space Applications Centre");
    assert.strictEqual(result.provenance.freshness, "live");
    assert.strictEqual(result.provenance.status, "ok");
    assert.deepStrictEqual(result.provenance.geographicScope.bbox, [
      76.7479 - 0.5,
      10.7089 - 0.5,
      76.7479 + 0.5,
      10.7089 + 0.5,
    ]);
  });

  test("fetchSatelliteData degrades gracefully to regional fixture when live credentials unconfigured", async () => {
    const result = await fetchSatelliteData(13.0827, 80.2707, { locationName: "Chennai" });

    assert.strictEqual(result.available, true);
    assert.strictEqual(result.isFixture, true);
    assert.strictEqual(result.products.satelliteName, "INSAT-3DR");
    assert.strictEqual(result.products.cloudCoverPercent, SATELLITE_FIXTURES.Chennai.cloudCoverPercent);
    assert.strictEqual(result.provenance.status, "mock");
    assert.strictEqual(result.provenance.freshness, "recent");
    assert.ok(result.provenance.diagnosticMessage.includes("credentials"));
  });

  test("fetchSatelliteData reports explicit blocked status when allowFixture=false", async () => {
    const result = await fetchSatelliteData(13.0827, 80.2707, { allowFixture: false });

    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, "UPSTREAM_BLOCKED");
    assert.strictEqual(result.products, null);
    assert.strictEqual(result.provenance.status, "blocked");
    assert.ok(result.provenance.diagnosticMessage.includes("BLOCKED"));
  });

  test("fetchSatelliteData caches responses within TTL and clearSatelliteCache flushes it", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return {
        cloudCoverPercent: 60,
        cloudTopTemperatureK: 250,
        cloudTopHeightKm: 6.0,
        brightnessTemperatureK: 288,
        rainfallRateEstimateMmH: 1.0,
        satelliteName: "INSAT-3D",
        sensor: "IMAGER-TIR1",
      };
    };

    const first = await fetchSatelliteData(15.0, 75.0, { fetcherOverride: fetcher });
    assert.strictEqual(callCount, 1);
    assert.strictEqual(first.provenance.freshness, "live");

    const second = await fetchSatelliteData(15.0, 75.0, { fetcherOverride: fetcher });
    assert.strictEqual(callCount, 1); // Served from cache
    assert.strictEqual(second.provenance.freshness, "cached");

    clearSatelliteCache();

    const third = await fetchSatelliteData(15.0, 75.0, { fetcherOverride: fetcher });
    assert.strictEqual(callCount, 2); // Re-fetched
    assert.strictEqual(third.provenance.freshness, "live");
  });
});

describe("3. Risk Intelligence & Impact Assessment Pipeline Integration", () => {
  beforeEach(() => {
    clearSatelliteCache();
  });

  test("assessImpact integrates INSAT satellite convective cloud tops and rain rate into severity & evidence", () => {
    const featureObject = {
      rainfall: 15,
      forecastRainfall: 20,
      windSpeed: 25,
      temperature: 28,
      humidity: 80,
      pressure: 1008,
      historicalRisk: 45,
      terrainSlope: 8,
    };

    const riskData = {
      riskLevel: "Moderate",
      riskScore: 50,
      confidence: 85,
      model: "RandomForest ML Service",
      isFallback: false,
    };

    const satelliteData = {
      available: true,
      products: {
        satelliteName: "INSAT-3DR",
        sensor: "IMAGER-TIR1",
        cloudCoverPercent: 88.0,
        cloudTopTemperatureK: 215.0, // Cold convective cloud top
        cloudTopHeightKm: 12.0,
        rainfallRateEstimateMmH: 18.5, // High HEM rain rate
      },
      provenance: {
        provider: "ISRO / MOSDAC Space Applications Centre",
        status: "ok",
        freshness: "live",
      },
    };

    const impact = assessImpact({
      featureObject,
      riskData,
      location: { latitude: 10.7, longitude: 76.7, displayName: "Palakkad, Kerala, India" },
      satelliteData,
    });

    assert.ok(impact.severity.score > 0);
    // Verify satellite amplifier was applied
    const hasSatAmplifier = impact.severity.amplifiers.some((a) => a.includes("INSAT Satellite"));
    assert.ok(hasSatAmplifier, "Satellite deep convective cloud top must amplify impact severity");

    // Verify satellite evidence is recorded
    assert.ok(impact.evidence.satellite, "Satellite evidence must be populated");
    assert.strictEqual(impact.evidence.satellite.satelliteName, "INSAT-3DR");
    assert.strictEqual(impact.evidence.satellite.cloudTopTemperatureK, 215.0);
    assert.strictEqual(impact.evidence.satellite.rainfallRateEstimateMmH, 18.5);

    // Verify provenance
    assert.ok(impact.provenance.satelliteSource.includes("MOSDAC"));

    // Verify locationSpecificFactors includes INSAT telemetry
    const hasSatFactor = impact.locationSpecificFactors.some((f) => f.factor.includes("INSAT"));
    assert.ok(hasSatFactor, "Location-specific factors must document INSAT geostationary observation");
  });

  test("getIntelligenceForLocation packages observational satellite data and connects to impact assessment", async () => {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai",
    });

    assert.ok(result, "Intelligence result required");
    assert.ok(result.observationalData, "observationalData required");
    assert.ok(result.observationalData.satellite, "observationalData.satellite required");
    assert.strictEqual(result.observationalData.satellite.available, true);
    assert.strictEqual(result.observationalData.satellite.products.satelliteName, "INSAT-3DR");

    assert.ok(result.sourceInformation.satelliteSource.includes("MOSDAC"));
    assert.ok(result.impactAssessment, "Impact assessment must be present");
    assert.ok(result.impactAssessment.evidence.satellite, "Impact evidence must contain satellite entry");
  });
});

describe("4. Dedicated Satellite API Route (/api/weather/satellite)", () => {
  const http = require("http");
  const app = require("../server");
  let server = null;
  let baseUrl = "";

  beforeEach(async () => {
    clearSatelliteCache();
  });

  test("GET /api/weather/satellite returns 200 with normalized satellite data for valid coords", async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const res = await fetch(`${baseUrl}/api/weather/satellite?lat=13.0827&lon=80.2707&location=Chennai`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.available, true);
      assert.ok(data.products);
      assert.strictEqual(data.products.satelliteName, "INSAT-3DR");
      assert.ok(data.provenance.provider.includes("MOSDAC"));
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
    }
  });

  test("GET /api/weather/satellite returns 400 when coordinates are omitted", async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const res = await fetch(`${baseUrl}/api/weather/satellite`);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.sourceStatus, "invalid_coordinates");
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
    }
  });
});
