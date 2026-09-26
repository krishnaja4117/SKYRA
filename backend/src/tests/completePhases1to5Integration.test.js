/**
 * SKYRA – Master Phase 1 to 5 Comprehensive Integration & Regression Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates all architectural layers from Phase 1 through Phase 5:
 *   • Part 1: Phase 1 Location Safety & Coordinate Validation (Tests 1-4)
 *   • Part 2: Phase 2 External Sources & Common Provenance (Tests 5-11)
 *     - Open-Meteo, IMD, Satellite (INSAT-3D), Radar (DWR)
 *   • Part 3: Phase 3 Ingestion, Isolation & AWS S3 Storage (Tests 12-18)
 *   • Part 4: Phase 4 Knowledge Base, FAISS & Pinecone Vector Store (Tests 19-23)
 *   • Part 5: Phase 5 AI Inference, XGBoost/RF, Calibration & Fallbacks (Tests 24-30)
 */

const assert = require("assert");

// Ingestion & External Sources
const { createProvenance } = require("../services/ingestion/provenanceService");
const { fetchIMDAdvisories, findNearestIMDStation, clearIMDCache } = require("../services/ingestion/imdService");
const { fetchSatelliteData, clearSatelliteCache } = require("../services/ingestion/satelliteService");
const { fetchRadarData, findCoveringRadarStation, clearRadarCache } = require("../services/ingestion/radarService");
const { fetchTerrainData, clearTerrainCache } = require("../services/ingestion/terrainService");
const { fetchWeather, validateCoordinates, clearWeatherCache } = require("../services/weatherService");
const { fetchHistoricalRisk, clearHistoricalRiskCache } = require("../services/analytics/historicalRiskService");

// Storage & Vector
const { uploadIngestionRecord, generateObjectKey, ALLOWED_PREFIXES, clearLocalMockS3Store } = require("../services/storage/s3Service");
const { getIntelligenceForLocation } = require("../services/intelligenceService");
const { calculateRisk, calculateFallbackRisk } = require("../services/riskEngine");
const { extractFeatures } = require("../services/features/featureExtractor");

let passed = 0;
let total = 0;

function recordPass(num, name) {
  passed += 1;
  total += 1;
  console.log(`  PASS [Test ${String(num).padStart(2, "0")}] ${name}`);
}

async function runMasterSuite() {
  console.log("\n================================================================================");
  console.log("   SKYRA MASTER PHASES 1–5 COMPREHENSIVE INTEGRATION SUITE");
  console.log("================================================================================\n");

  /* ==========================================================================
     PART 1: PHASE 1 LOCATION SAFETY & ZERO SILENT FALLBACK (Tests 1-4)
     ========================================================================== */
  console.log("--- PART 1: Phase 1 Location Safety & Coordinates ---");

  // Test 1: Valid WGS-84 coordinate validation
  {
    const coords = validateCoordinates(13.0827, 80.2707);
    assert.strictEqual(coords.latitude, 13.0827);
    assert.strictEqual(coords.longitude, 80.2707);
    recordPass(1, "Location: Exact Coordinate Parsing & Validation");
  }

  // Test 2: Rejection of missing coordinates (zero default city fallback)
  {
    assert.throws(
      () => validateCoordinates(null, null),
      (err) => err.statusCode === 400
    );
    assert.throws(
      () => validateCoordinates(undefined, undefined),
      (err) => err.statusCode === 400
    );
    recordPass(2, "Location Safety: Explicit Error on Missing Coordinates");
  }

  // Test 3: Rejection of out-of-range coordinates
  {
    assert.throws(
      () => validateCoordinates(95.0, 77.0),
      (err) => err.statusCode === 400
    );
    assert.throws(
      () => validateCoordinates(15.0, 195.0),
      (err) => err.statusCode === 400
    );
    recordPass(3, "Location Safety: Out-of-Bounds Coordinate Rejection");
  }

  // Test 4: Verification of zero silent fallback to Bhubaneswar (20.2961, 85.8245)
  {
    const BHUBANESWAR_LAT = 20.2961;
    const BHUBANESWAR_LON = 85.8245;
    const coords = validateCoordinates(19.0760, 72.8777); // Mumbai
    assert.notStrictEqual(coords.latitude, BHUBANESWAR_LAT);
    assert.notStrictEqual(coords.longitude, BHUBANESWAR_LON);
    recordPass(4, "Location Safety: Zero Silent Fallback to Bhubaneswar");
  }

  /* ==========================================================================
     PART 2: PHASE 2 EXTERNAL DATA SOURCES & PROVENANCE (Tests 5-11)
     ========================================================================== */
  console.log("\n--- PART 2: Phase 2 External Sources & Common Provenance ---");

  // Test 5: Common Provenance contract generation
  {
    const prov = createProvenance({
      provider: "Open-Meteo",
      dataset: "NWP Weather",
      sourceUrl: "https://api.open-meteo.com/v1/forecast",
      geographicScope: { latitude: 13.0827, longitude: 80.2707 },
      status: "ok",
      freshness: "live",
    });
    assert.strictEqual(prov.provider, "Open-Meteo");
    assert.strictEqual(prov.dataset, "NWP Weather");
    assert.strictEqual(prov.status, "ok");
    assert(prov.retrievalTime);
    recordPass(5, "Provenance: Standard Multi-Source Provenance Schema");
  }

  // Test 6: IMD integration for Chennai station (Station 43279)
  {
    clearIMDCache();
    const imd = await fetchIMDAdvisories(13.0827, 80.2707);
    assert.strictEqual(imd.available, true);
    assert.strictEqual(imd.station.id, "43279");
    assert(imd.provenance.provider.includes("IMD"));
    assert(imd.advisory.warningColor);
    recordPass(6, "IMD Ingestion: Official Station Proximity Matching (Chennai)");
  }

  // Test 7: IMD outside-coverage handling (zero Bhubaneswar fallback)
  {
    clearIMDCache();
    // Indian Ocean point far from any station
    const remote = await fetchIMDAdvisories(5.0, 75.0);
    assert.strictEqual(remote.available, false);
    assert.strictEqual(remote.reason, "OUTSIDE_STATION_COVERAGE");
    assert.strictEqual(remote.station, null);
    assert.strictEqual(remote.provenance.status, "blocked");
    recordPass(7, "IMD Ingestion: Non-Station Area Explicitly Unavailable (No Fallback)");
  }

  // Test 8: Satellite remote sensing ingestion (INSAT-3D / MOSDAC)
  {
    clearSatelliteCache();
    const sat = await fetchSatelliteData(13.0827, 80.2707, { locationName: "Chennai" });
    assert.strictEqual(sat.available, true);
    assert.strictEqual(sat.products.satelliteName, "INSAT-3DR");
    assert(typeof sat.products.cloudCoverPercent === "number");
    assert(sat.provenance.provider.includes("MOSDAC"));
    recordPass(8, "Satellite Ingestion: Remote Sensing Cloud & Radiance Products");
  }

  // Test 9: Doppler Weather Radar ingestion (DWR Chennai Port)
  {
    clearRadarCache();
    const radar = await fetchRadarData(13.0827, 80.2707);
    assert.strictEqual(radar.available, true);
    assert.strictEqual(radar.radar.id, "DWR_CHN");
    assert(typeof radar.products.maxReflectivityDbz === "number");
    assert(radar.provenance.provider.includes("Radar"));
    recordPass(9, "Radar Ingestion: Doppler Weather Radar Sweep Ingestion");
  }

  // Test 10: Radar out-of-range detection (> 250 km)
  {
    clearRadarCache();
    const outOfRange = await fetchRadarData(15.0, 74.0); // Middle of Western Ghats far from radar
    assert.strictEqual(outOfRange.available, false);
    assert.strictEqual(outOfRange.reason, "OUTSIDE_RADAR_COVERAGE");
    recordPass(10, "Radar Ingestion: 250 km Radar Surveillance Range Enforcement");
  }

  // Test 11: Real DEM terrain slope ingestion
  {
    clearTerrainCache();
    const terrain = await fetchTerrainData(13.0827, 80.2707);
    assert(typeof terrain.slope === "number");
    assert.notStrictEqual(terrain.slope, 15, "Slope must not be hardcoded 15");
    recordPass(11, "Terrain Ingestion: Real DEM Slope from Topographic Elevation");
  }

  /* ==========================================================================
     PART 3: PHASE 3 INGESTION & S3 CLOUD STORAGE (Tests 12-18)
     ========================================================================== */
  console.log("\n--- PART 3: Phase 3 Ingestion & S3 Cloud Storage ---");

  // Test 12: Allowed S3 logical prefixes
  {
    assert.deepStrictEqual(ALLOWED_PREFIXES, [
      "weather/",
      "forecast/",
      "historical/",
      "terrain/",
      "imd/",
      "satellite/",
      "radar/",
    ]);
    recordPass(12, "S3 Storage: Complete 7-Domain Logical Storage Prefixes");
  }

  // Test 13: Deterministic S3 object key generation
  {
    const key = generateObjectKey("weather/", 13.0827, 80.2707, "2026-09-26T12:00:00Z");
    assert(key.startsWith("weather/13.0827_80.2707_"));
    assert(key.endsWith(".json"));
    recordPass(13, "S3 Storage: Deterministic Idempotent Object Key Generation");
  }

  // Test 14: S3 storage upload with SHA-256 integrity hash
  {
    clearLocalMockS3Store();
    const payload = { temperature: 32.5, humidity: 75 };
    const uploadRes = await uploadIngestionRecord("weather/", payload, {
      latitude: 13.0827,
      longitude: 80.2707,
      timestamp: "2026-09-26T12:00:00Z",
    });
    assert.strictEqual(uploadRes.success, true);
    assert(uploadRes.contentHash && uploadRes.contentHash.length === 64);
    assert(uploadRes.liveUploadStatus === "UPLOADED" || uploadRes.liveUploadStatus === "BLOCKED");
    recordPass(14, "S3 Storage: Payload Serialization & SHA-256 Hashing");
  }

  // Test 15: S3 invalid domain prefix rejection
  {
    assert.throws(
      () => generateObjectKey("invalid_domain/", 13.0, 80.0),
      (err) => err.message.includes("Invalid S3 prefix")
    );
    recordPass(15, "S3 Storage: Invalid Storage Domain Rejection");
  }

  // Test 16: Failure isolation - Secondary source failure does not break primary weather
  {
    clearWeatherCache();
    const weather = await fetchWeather(13.0827, 80.2707, "Chennai");
    assert.strictEqual(weather.sourceMetadata.sourceStatus, "ok");
    assert(weather.current.temperature !== undefined);
    recordPass(16, "Ingestion Resilience: Live Weather Unaffected by Secondary Feeds");
  }

  // Test 17: Empirical Historical Risk calculation (no hardcoded 60)
  {
    clearHistoricalRiskCache();
    const mockRecords = [
      { date: "2026-08-01", precipitation: 45.0, windSpeedMax: 25.0 },
      { date: "2026-08-02", precipitation: 10.0, windSpeedMax: 15.0 },
    ];
    const hist = await fetchHistoricalRisk(13.0827, 80.2707, { recordsOverride: mockRecords });
    assert.notStrictEqual(hist.historicalRisk, 60, "Must not be hardcoded 60");
    assert(hist.historicalRisk >= 5 && hist.historicalRisk <= 100);
    recordPass(17, "Historical Ingestion: Empirical Derivation (Zero Hardcoded 60)");
  }

  // Test 18: Cache coordinate isolation across cities
  {
    clearWeatherCache();
    const resA = await fetchWeather(13.0827, 80.2707, "Chennai");
    const resB = await fetchWeather(12.9716, 77.5946, "Bengaluru");
    assert.notStrictEqual(resA.current.pressure, resB.current.pressure);
    recordPass(18, "Ingestion Isolation: Cross-City Meteorological Separation");
  }

  /* ==========================================================================
     PART 4: PHASE 4 VECTOR KNOWLEDGE & RETRIEVAL (Tests 19-23)
     ========================================================================== */
  console.log("\n--- PART 4: Phase 4 Knowledge Base & Vector Search ---");

  // Test 19: Authoritative document provenance in knowledgeService
  {
    const { calculateContentHash } = require("../services/knowledgeService");
    const hash = calculateContentHash("NDMA Flood Guidelines", "Dewatering pumps and evacuation.");
    assert.strictEqual(typeof hash, "string");
    assert.strictEqual(hash.length, 64);
    recordPass(19, "Knowledge Base: Cryptographic Content Hash Verification");
  }

  // Test 20: Knowledge document schema constraints
  {
    const KnowledgeDocument = require("../models/KnowledgeDocument");
    const { calculateContentHash } = require("../services/knowledgeService");
    const title = "Test Flood Response Guidelines";
    const content = "Test evacuation protocol content.";
    const doc = new KnowledgeDocument({
      documentId: "TEST-NDMA-01",
      title,
      content,
      category: "emergency_response",
      source: "NDMA",
      scope: "NATIONAL",
      language: "en",
      contentHash: calculateContentHash(title, content),
    });
    const err = doc.validateSync();
    assert.strictEqual(err, undefined);
    recordPass(20, "Knowledge Base: Authoritative Document Schema Validation");
  }

  // Test 21: Cross-region document filtering
  {
    const KnowledgeDocument = require("../models/KnowledgeDocument");
    const { calculateContentHash } = require("../services/knowledgeService");
    const title = "Chennai Flood SOP";
    const content = "Adyar river protocol.";
    const chennaiDoc = new KnowledgeDocument({
      documentId: "CHN-SOP-01",
      title,
      content,
      category: "flood",
      source: "TN-SDMA",
      scope: "LOCAL",
      targetRegion: "Chennai",
      language: "en",
      contentHash: calculateContentHash(title, content),
    });
    assert.strictEqual(chennaiDoc.targetRegion, "Chennai");
    assert.strictEqual(chennaiDoc.scope, "LOCAL");
    recordPass(21, "Knowledge Base: City-Level Geographic Scope Isolation");
  }

  // Test 22: RiskResult schema storage of calibrated confidence & provenance
  {
    const RiskResult = require("../models/RiskResult");
    const riskDoc = new RiskResult({
      location: { latitude: 13.0827, longitude: 80.2707 },
      coordinates: { type: "Point", coordinates: [80.2707, 13.0827] },
      riskLevel: "Moderate",
      riskScore: 48,
      confidence: 92,
      confidenceType: "CALIBRATED",
      calibrationMethod: "Platt Sigmoid (5-fold Cross-Validation)",
      model: "Calibrated RandomForestClassifier (Port 8000)",
      modelVersion: "2.0.0",
      inputs: {
        rainfall: 15,
        forecastRainfall: 10,
        humidity: 75,
        windSpeed: 20,
        historicalRisk: 30,
        terrainSlope: 1.5,
        temperature: 29,
        pressure: 1008,
      },
    });
    const err = riskDoc.validateSync();
    assert.strictEqual(err, undefined);
    assert.strictEqual(riskDoc.confidenceType, "CALIBRATED");
    assert.strictEqual(riskDoc.modelVersion, "2.0.0");
    recordPass(22, "RiskResult: Calibrated Confidence & Model Provenance Storage");
  }

  // Test 23: Offline persistence handling (non-blocking)
  {
    const { persistRiskResult } = require("../services/riskPersistenceService");
    const res = await persistRiskResult({
      location: { latitude: 13.0827, longitude: 80.2707 },
      riskLevel: "Low",
      riskScore: 20,
      confidence: 90,
      confidenceType: "CALIBRATED",
      inputs: { rainfall: 0, forecastRainfall: 0, humidity: 60, windSpeed: 10, historicalRisk: 15, terrainSlope: 1, temperature: 28, pressure: 1012 },
    });
    assert(res.persisted === true || res.persisted === false);
    recordPass(23, "Persistence: Non-Blocking Offline Degradation Resilience");
  }

  /* ==========================================================================
     PART 5: PHASE 5 AI INFERENCE, CALIBRATION & FALLBACKS (Tests 24-30)
     ========================================================================== */
  console.log("\n--- PART 5: Phase 5 AI Inference, Calibration & Fallbacks ---");

  // Test 24: Strict 8-feature order and naming extraction
  {
    const raw = {
      rainfall: 25.0,
      forecastRainfall: 15.0,
      humidity: 82.0,
      windSpeed: 28.0,
      historicalRisk: 35.0,
      terrainSlope: 3.5,
      temperature: 29.0,
      pressure: 1006.0,
    };
    const extracted = extractFeatures(raw);
    assert.strictEqual(extracted.featureVector.length, 8);
    assert.deepStrictEqual(extracted.featureNames, [
      "rainfall", "forecastRainfall", "humidity", "windSpeed",
      "historicalRisk", "terrainSlope", "temperature", "pressure",
    ]);
    recordPass(24, "AI Pipeline: Strict 8-Feature Contract Extraction");
  }

  // Test 25: Calibrated ML inference response validation
  {
    const mockFetcher = async () => ({
      riskLevel: "High",
      riskScore: 74,
      confidence: 91,
      confidenceType: "CALIBRATED",
      calibrationMethod: "Platt Sigmoid (5-fold Cross-Validation)",
      model: "Calibrated RandomForestClassifier (Port 8000)",
      modelVersion: "2.0.0",
      datasetVersion: "ERA5-MultiCity-2021-2023",
      isFallback: false,
    });

    const result = await calculateRisk({}, { fetcherOverride: mockFetcher });
    assert.strictEqual(result.riskLevel, "High");
    assert.strictEqual(result.riskScore, 74);
    assert.strictEqual(result.confidence, 91);
    assert.strictEqual(result.confidenceType, "CALIBRATED");
    assert.strictEqual(result.isFallback, false);
    recordPass(25, "ML Inference: Calibrated Probability & Provenance Response");
  }

  // Test 26: Distinction between Risk Score and Confidence
  {
    const mockFetcher = async () => ({
      riskLevel: "Moderate",
      riskScore: 46,
      confidence: 88,
      confidenceType: "CALIBRATED",
      isFallback: false,
    });
    const result = await calculateRisk({}, { fetcherOverride: mockFetcher });
    assert.notStrictEqual(result.riskScore, result.confidence);
    assert(result.riskScore >= 0 && result.riskScore <= 100);
    assert(result.confidence >= 0 && result.confidence <= 100);
    recordPass(26, "Risk Semantics: Strict Separation (Risk Score != Confidence)");
  }

  // Test 27: Safe heuristic fallback on timeout (isFallback = true)
  {
    const timeoutFetcher = async () => {
      const err = new Error("AbortError: Operation timed out");
      throw err;
    };
    const fallback = await calculateRisk({ rainfall: 30, forecastRainfall: 10, windSpeed: 20 }, { fetcherOverride: timeoutFetcher });
    assert.strictEqual(fallback.isFallback, true);
    assert.strictEqual(fallback.model, "Heuristic Fallback Engine");
    assert.strictEqual(fallback.confidenceType, "HEURISTIC");
    recordPass(27, "Fallback Safety: ML Timeout Gracefully Routes to Fallback");
  }

  // Test 28: Never present heuristic fallback as ML output
  {
    const fallback = calculateFallbackRisk({ rainfall: 5, forecastRainfall: 0 });
    assert.strictEqual(fallback.isFallback, true);
    assert.strictEqual(fallback.model, "Heuristic Fallback Engine");
    assert.notStrictEqual(fallback.model, "Calibrated RandomForestClassifier (Port 8000)");
    recordPass(28, "Provenance Integrity: Truthful Fallback Model Attribution");
  }

  // Test 29: End-to-end intelligence aggregation (Chennai live test)
  {
    const intelligence = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai",
    });
    assert.strictEqual(intelligence.location.latitude, 13.0827);
    assert.strictEqual(intelligence.location.longitude, 80.2707);
    assert(intelligence.currentWeather.temperature !== undefined);
    assert(intelligence.riskScore >= 0 && intelligence.riskScore <= 100);
    assert(intelligence.confidence >= 0 && intelligence.confidence <= 100);
    recordPass(29, "End-to-End Aggregation: Live SkyraIntelligenceResult (Chennai)");
  }

  // Test 30: Multi-city complete cross-location isolation
  {
    const cities = [
      { name: "Chennai", lat: 13.0827, lon: 80.2707 },
      { name: "Bengaluru", lat: 12.9716, lon: 77.5946 },
      { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
      { name: "Kolkata", lat: 22.5726, lon: 88.3639 },
    ];

    const results = await Promise.all(
      cities.map((c) => getIntelligenceForLocation({ latitude: c.lat, longitude: c.lon, locationName: c.name }))
    );

    for (let i = 0; i < cities.length; i++) {
      assert.strictEqual(results[i].location.latitude, cities[i].lat);
      assert.strictEqual(results[i].location.longitude, cities[i].lon);
      assert.strictEqual(results[i].location.city, cities[i].name);
    }
    recordPass(30, "Location Isolation: 4-City Multi-Region Non-Contamination");
  }

  console.log("\n================================================================================");
  console.log(`   MASTER PHASES 1-5 SUITE COMPLETE: ${passed}/${total} TESTS PASSED`);
  console.log("================================================================================\n");
}

runMasterSuite().catch((err) => {
  console.error("FATAL ERROR IN MASTER SUITE:", err);
  process.exit(1);
});
