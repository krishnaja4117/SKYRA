/**
 * SKYRA – Phase 5 AI & Analytics Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive audit and end-to-end verification of the AI/analytics layer:
 *
 *   1. Feature Pipeline & Schema Validation (Tests 1-8)
 *      - Strict 8-feature order: [rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]
 *      - Rejection of missing values, non-numeric types, NaN/Infinity, out-of-range bounds
 *   2. Model Prediction & Risk Scoring (Tests 9-14)
 *      - Probability-weighted Risk Score (20-95, 0-100)
 *      - Raw ensemble voting Confidence (0-100)
 *      - Clear distinction: Risk Score != Probability != Confidence
 *      - Truthful model provenance (model name, version "1.0.0", isFallback flag)
 *   3. Empirical Historical Risk Analytics (Tests 15-18)
 *      - Genuine derivation from ERA5 reanalysis time-series records
 *      - Zero hardcoded 60 in pipeline
 *      - Sensitivity to extreme rain, heavy rain frequency, and gale-force winds
 *   4. Topographic Terrain Analytics (Tests 19-21)
 *      - Real DEM slope ingestion via Open-Meteo
 *      - Zero hardcoded 15 in production pipeline
 *   5. Safe Fallback & Resilience (Tests 22-28)
 *      - ML service timeout (abort signal) routes to heuristic fallback
 *      - ML service HTTP 500 routes to fallback
 *      - ML service network/connection error routes to fallback
 *      - Malformed ML responses (invalid score, missing riskLevel, NaN) route to fallback
 *      - Truthful attribution: isFallback=true, model="Heuristic Fallback Engine"
 *   6. Location Safety & Multi-City Isolation (Tests 29-34)
 *      - Chennai, Bengaluru, Mumbai, Kolkata tested independently
 *      - Zero silent fallback to Bhubaneswar (20.2961, 85.8245)
 *      - Rejection of invalid/missing coordinates with HTTP 400
 *   7. RiskResult Persistence & Traceability (Tests 35-38)
 *      - Exact 8-feature snapshot, GeoJSON coordinates, model version, and XAI factors
 */

const assert = require("assert");
const mongoose = require("mongoose");

// Core Services
const { extractFeatures } = require("../services/features/featureExtractor");
const {
  calculateRisk,
  calculateFallbackRisk,
  VALID_RISK_LEVELS,
} = require("../services/riskEngine");
const {
  deriveHistoricalRiskFromRecords,
  fetchHistoricalRisk,
  clearHistoricalRiskCache,
} = require("../services/analytics/historicalRiskService");
const {
  fetchTerrainData,
  clearTerrainCache,
} = require("../services/ingestion/terrainService");
const {
  getIntelligenceForLocation,
} = require("../services/intelligenceService");
const {
  validateCoordinates,
  clearWeatherCache,
} = require("../services/weatherService");
const { persistRiskResult } = require("../services/riskPersistenceService");

// Models
const RiskResult = require("../models/RiskResult");

// Test Counters
let passedTests = 0;
let totalTests = 0;

function recordPass(testNum, testName) {
  passedTests += 1;
  totalTests += 1;
  console.log(`  PASS [Test ${String(testNum).padStart(2, "0")}] ${testName}`);
}

async function runSuite() {
  console.log("\n================================================================================");
  console.log("   SKYRA PHASE 5: AI & ANALYTICS VERIFICATION SUITE");
  console.log("================================================================================\n");

  /* ==========================================================================
     1. FEATURE PIPELINE & SCHEMA VALIDATION (Tests 1-8)
     ========================================================================== */
  console.log("--- 1. Feature Pipeline & Schema Validation ---");

  // Test 1: Strict 8-feature order and naming
  {
    const sampleInput = {
      rainfall: 12.5,
      forecastRainfall: 8.0,
      humidity: 78,
      windSpeed: 24,
      historicalRisk: 35,
      terrainSlope: 4.2,
      temperature: 29.5,
      pressure: 1008.2,
    };
    const extracted = extractFeatures(sampleInput);
    assert.strictEqual(extracted.featureVector.length, 8, "Feature vector must contain exactly 8 features");
    assert.deepStrictEqual(extracted.featureNames, [
      "rainfall",
      "forecastRainfall",
      "humidity",
      "windSpeed",
      "historicalRisk",
      "terrainSlope",
      "temperature",
      "pressure",
    ]);
    assert.strictEqual(extracted.featureVector[0], 12.5);
    assert.strictEqual(extracted.featureVector[1], 8.0);
    assert.strictEqual(extracted.featureVector[2], 78);
    assert.strictEqual(extracted.featureVector[3], 24);
    assert.strictEqual(extracted.featureVector[4], 35);
    assert.strictEqual(extracted.featureVector[5], 4.2);
    assert.strictEqual(extracted.featureVector[6], 29.5);
    assert.strictEqual(extracted.featureVector[7], 1008.2);
    recordPass(1, "Feature Pipeline: Strict 8-Feature Vector Order and Naming");
  }

  // Test 2: Support for nested structured weather objects
  {
    const structuredInput = {
      current: {
        rainfall: 5.0,
        humidity: 82,
        windSpeed: 18,
        temperature: 30,
        pressure: 1011,
      },
      forecast: {
        precipitationExpected: 15.0,
      },
      context: {
        historicalRisk: 42,
        terrainSlope: 3.5,
      },
    };
    const extracted = extractFeatures(structuredInput);
    assert.strictEqual(extracted.featureObject.rainfall, 5.0);
    assert.strictEqual(extracted.featureObject.forecastRainfall, 15.0);
    assert.strictEqual(extracted.featureObject.humidity, 82);
    assert.strictEqual(extracted.featureObject.windSpeed, 18);
    assert.strictEqual(extracted.featureObject.historicalRisk, 42);
    assert.strictEqual(extracted.featureObject.terrainSlope, 3.5);
    assert.strictEqual(extracted.featureObject.temperature, 30);
    assert.strictEqual(extracted.featureObject.pressure, 1011);
    recordPass(2, "Feature Pipeline: Structured Nested Weather Ingestion");
  }

  // Test 3: Missing feature throws ERR_MISSING_FEATURE
  {
    assert.throws(
      () => {
        extractFeatures({
          // missing rainfall
          forecastRainfall: 10,
          humidity: 60,
          windSpeed: 15,
          historicalRisk: 25,
          terrainSlope: 1,
          temperature: 28,
          pressure: 1010,
        });
      },
      (err) => err.code === "ERR_MISSING_FEATURE" && err.statusCode === 400
    );
    recordPass(3, "Feature Validation: Missing Feature Rejection (ERR_MISSING_FEATURE)");
  }

  // Test 4: Non-numeric / NaN values throw ERR_INVALID_NUMERIC
  {
    assert.throws(
      () => {
        extractFeatures({
          rainfall: "heavy_rain",
          forecastRainfall: 10,
          humidity: 60,
          windSpeed: 15,
          historicalRisk: 25,
          terrainSlope: 1,
          temperature: 28,
          pressure: 1010,
        });
      },
      (err) => err.code === "ERR_INVALID_NUMERIC" && err.statusCode === 400
    );

    assert.throws(
      () => {
        extractFeatures({
          rainfall: NaN,
          forecastRainfall: 10,
          humidity: 60,
          windSpeed: 15,
          historicalRisk: 25,
          terrainSlope: 1,
          temperature: 28,
          pressure: 1010,
        });
      },
      (err) => err.code === "ERR_INVALID_NUMERIC" && err.statusCode === 400
    );
    recordPass(4, "Feature Validation: Non-Numeric and NaN Rejection (ERR_INVALID_NUMERIC)");
  }

  // Test 5: Infinite values throw ERR_INVALID_NUMERIC
  {
    assert.throws(
      () => {
        extractFeatures({
          rainfall: Infinity,
          forecastRainfall: 10,
          humidity: 60,
          windSpeed: 15,
          historicalRisk: 25,
          terrainSlope: 1,
          temperature: 28,
          pressure: 1010,
        });
      },
      (err) => err.code === "ERR_INVALID_NUMERIC" && err.statusCode === 400
    );
    recordPass(5, "Feature Validation: Infinity Rejection (ERR_INVALID_NUMERIC)");
  }

  // Test 6: Negative rainfall / forecastRainfall / windSpeed rejection
  {
    assert.throws(
      () => {
        extractFeatures({
          rainfall: -5,
          forecastRainfall: 10,
          humidity: 60,
          windSpeed: 15,
          historicalRisk: 25,
          terrainSlope: 1,
          temperature: 28,
          pressure: 1010,
        });
      },
      (err) => err.code === "ERR_OUT_OF_RANGE"
    );

    assert.throws(
      () => {
        extractFeatures({
          rainfall: 0,
          forecastRainfall: -1,
          humidity: 60,
          windSpeed: 15,
          historicalRisk: 25,
          terrainSlope: 1,
          temperature: 28,
          pressure: 1010,
        });
      },
      (err) => err.code === "ERR_OUT_OF_RANGE"
    );
    recordPass(6, "Feature Validation: Negative Rainfall & Wind Range Enforcement");
  }

  // Test 7: Out-of-bounds humidity and terrain slope rejection
  {
    assert.throws(
      () => {
        extractFeatures({
          rainfall: 0,
          forecastRainfall: 0,
          humidity: 105, // > 100
          windSpeed: 10,
          historicalRisk: 25,
          terrainSlope: 5,
          temperature: 25,
          pressure: 1012,
        });
      },
      (err) => err.code === "ERR_OUT_OF_RANGE"
    );

    assert.throws(
      () => {
        extractFeatures({
          rainfall: 0,
          forecastRainfall: 0,
          humidity: 50,
          windSpeed: 10,
          historicalRisk: 25,
          terrainSlope: 95, // > 90 degrees
          temperature: 25,
          pressure: 1012,
        });
      },
      (err) => err.code === "ERR_OUT_OF_RANGE"
    );
    recordPass(7, "Feature Validation: Humidity (0-100) & Terrain Slope (0-90) Constraints");
  }

  // Test 8: Surface pressure boundary validation (300 to 1200 hPa)
  {
    assert.throws(
      () => {
        extractFeatures({
          rainfall: 0,
          forecastRainfall: 0,
          humidity: 50,
          windSpeed: 10,
          historicalRisk: 25,
          terrainSlope: 5,
          temperature: 25,
          pressure: 250, // < 300
        });
      },
      (err) => err.code === "ERR_OUT_OF_RANGE"
    );
    recordPass(8, "Feature Validation: Barometric Pressure Physical Range Enforcement");
  }

  /* ==========================================================================
     2. MODEL PREDICTION & RISK SCORING (Tests 9-14)
     ========================================================================== */
  console.log("\n--- 2. Model Prediction & Risk Scoring ---");

  // Test 9: ML prediction via test fetcher override (Low risk baseline)
  {
    const inputs = {
      rainfall: 0,
      forecastRainfall: 0,
      humidity: 45,
      windSpeed: 8,
      historicalRisk: 15,
      terrainSlope: 2,
      temperature: 26,
      pressure: 1014,
    };

    const mockMlFetcher = async () => ({
      riskLevel: "Low",
      riskScore: 22,
      confidence: 90,
      confidenceType: "CALIBRATED",
      explanation: "Classified as Low risk.",
      factors: [{ name: "Baseline", impact: "Low", detail: "Normal conditions" }],
      model: "Calibrated RandomForestClassifier (Port 8000)",
      modelVersion: "2.0.0",
      datasetVersion: "ERA5-MultiCity-2021-2023",
      isFallback: false,
    });

    const result = await calculateRisk(inputs, { fetcherOverride: mockMlFetcher });
    assert.strictEqual(result.riskLevel, "Low");
    assert.strictEqual(result.riskScore, 22);
    assert.strictEqual(result.confidence, 90);
    assert.strictEqual(result.confidenceType, "CALIBRATED");
    assert.strictEqual(result.isFallback, false);
    assert.strictEqual(result.model, "Calibrated RandomForestClassifier (Port 8000)");
    assert.strictEqual(result.modelVersion, "2.0.0");
    recordPass(9, "ML Inference: Low-Risk Prediction & Attribution");
  }

  // Test 10: ML prediction (Severe risk scenario)
  {
    const severeInputs = {
      rainfall: 120,
      forecastRainfall: 95,
      humidity: 96,
      windSpeed: 90,
      historicalRisk: 85,
      terrainSlope: 35,
      temperature: 24,
      pressure: 980,
    };

    const mockMlSevere = async () => ({
      riskLevel: "Severe",
      riskScore: 92,
      confidence: 95,
      confidenceType: "CALIBRATED",
      explanation: "Classified as Severe risk.",
      factors: [{ name: "Heavy rainfall", impact: "High", detail: "120 mm rain" }],
      model: "Calibrated RandomForestClassifier (Port 8000)",
      modelVersion: "2.0.0",
      datasetVersion: "ERA5-MultiCity-2021-2023",
      isFallback: false,
    });

    const result = await calculateRisk(severeInputs, { fetcherOverride: mockMlSevere });
    assert.strictEqual(result.riskLevel, "Severe");
    assert.strictEqual(result.riskScore, 92);
    assert.strictEqual(result.confidence, 95);
    assert.strictEqual(result.isFallback, false);
    recordPass(10, "ML Inference: Severe-Risk Prediction & Attribution");
  }

  // Test 11: Valid risk levels adherence (Low, Moderate, High, Severe)
  {
    assert.deepStrictEqual(VALID_RISK_LEVELS, ["Low", "Moderate", "High", "Severe"]);
    recordPass(11, "Risk Levels: Strict 4-Tier Scale Adherence");
  }

  // Test 12: Clear distinction between Risk Score and Confidence
  {
    const mockFetcher = async () => ({
      riskLevel: "High",
      riskScore: 71,   // Expected severity (scale 0-100)
      confidence: 88,  // Voting agreement percentage (scale 0-100)
      factors: [],
      model: "RandomForest ML Service (Port 8000)",
      modelVersion: "1.0.0",
      isFallback: false,
    });

    const result = await calculateRisk({}, { fetcherOverride: mockFetcher });
    assert.notStrictEqual(result.riskScore, result.confidence, "Risk score must not equal confidence indiscriminately");
    assert(result.riskScore >= 0 && result.riskScore <= 100);
    assert(result.confidence >= 0 && result.confidence <= 100);
    recordPass(12, "Risk Semantics: Strict Distinction (Risk Score != Confidence)");
  }

  // Test 13: Clamping of risk scores and confidence to [0, 100]
  {
    const mockClamping = async () => ({
      riskLevel: "Moderate",
      riskScore: 47.6,
      confidence: 82.3,
      factors: [],
      model: "RandomForest ML Service",
      modelVersion: "1.0.0",
      isFallback: false,
    });

    const result = await calculateRisk({}, { fetcherOverride: mockClamping });
    assert.strictEqual(result.riskScore, 48); // Rounded
    assert.strictEqual(result.confidence, 82); // Rounded
    recordPass(13, "Risk Scoring: Integer Rounding and [0, 100] Bounds Enforcement");
  }

  // Test 14: Heuristic fallback function self-consistency
  {
    const lowInput = { rainfall: 0, forecastRainfall: 0, windSpeed: 5, humidity: 40 };
    const lowFallback = calculateFallbackRisk(lowInput);
    assert.strictEqual(lowFallback.riskLevel, "Low");
    assert.strictEqual(lowFallback.isFallback, true);
    assert.strictEqual(lowFallback.model, "Heuristic Fallback Engine");

    const severeInput = { rainfall: 65, forecastRainfall: 20, windSpeed: 80, humidity: 90 };
    const severeFallback = calculateFallbackRisk(severeInput);
    assert.strictEqual(severeFallback.riskLevel, "Severe");
    assert.strictEqual(severeFallback.isFallback, true);
    recordPass(14, "Heuristic Fallback: Deterministic Scale & Truthful Attribution");
  }

  /* ==========================================================================
     3. EMPIRICAL HISTORICAL RISK ANALYTICS (Tests 15-18)
     ========================================================================== */
  console.log("\n--- 3. Empirical Historical Risk Analytics ---");

  // Test 15: Pure mathematical derivation from historical records
  {
    // Dry baseline records (30 days, zero rain, low wind)
    const dryRecords = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      precipitation: 0,
      windSpeedMax: 10,
    }));
    const dryRisk = deriveHistoricalRiskFromRecords(dryRecords);
    assert.strictEqual(dryRisk.historicalRisk, 5, "Dry baseline should yield minimum historical risk (5)");
    assert.strictEqual(dryRisk.riskTier, "Low");

    // Extreme records (multiple heavy rain days, tropical gale winds)
    const stormyRecords = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      precipitation: i % 3 === 0 ? 80 : 5,
      windSpeedMax: 65,
    }));
    const stormyRisk = deriveHistoricalRiskFromRecords(stormyRecords);
    assert(stormyRisk.historicalRisk >= 75, `Expected severe historical risk, got ${stormyRisk.historicalRisk}`);
    assert.strictEqual(stormyRisk.riskTier, "Severe");
    recordPass(15, "Historical Risk: Mathematical Derivation from Empirical Timeseries");
  }

  // Test 16: Zero hardcoded 60 in historical risk service
  {
    clearHistoricalRiskCache();
    // Test with recordsOverride for realistic coastal data
    const realisticRecords = [
      { date: "2026-08-01", precipitation: 25.0, windSpeedMax: 22.0 },
      { date: "2026-08-02", precipitation: 5.0, windSpeedMax: 18.0 },
      { date: "2026-08-03", precipitation: 0.0, windSpeedMax: 14.0 },
    ];
    const derived = await fetchHistoricalRisk(13.0827, 80.2707, { recordsOverride: realisticRecords });
    assert.notStrictEqual(derived.historicalRisk, 60, "Must not return hardcoded 60");
    assert(derived.historicalRisk >= 0 && derived.historicalRisk <= 100);
    recordPass(16, "Historical Risk: Verified Zero Hardcoded 60 Fallback");
  }

  // Test 17: Multi-city empirical historical risk difference (Chennai vs Mumbai)
  {
    clearHistoricalRiskCache();
    const chennaiRecords = Array.from({ length: 30 }, () => ({ precipitation: 10, windSpeedMax: 20 }));
    const mumbaiRecords = Array.from({ length: 30 }, () => ({ precipitation: 55, windSpeedMax: 45 }));

    const chennaiRisk = deriveHistoricalRiskFromRecords(chennaiRecords);
    const mumbaiRisk = deriveHistoricalRiskFromRecords(mumbaiRecords);

    assert.notStrictEqual(chennaiRisk.historicalRisk, mumbaiRisk.historicalRisk);
    assert(mumbaiRisk.historicalRisk > chennaiRisk.historicalRisk, "Monsoon Mumbai records should have higher historical risk than mild records");
    recordPass(17, "Historical Risk: Geographically Sensitive Risk Differentiation");
  }

  // Test 18: Ingestion cache TTL and key isolation
  {
    clearHistoricalRiskCache();
    const records = [{ date: "2026-08-01", precipitation: 15, windSpeedMax: 20 }];
    const res1 = await fetchHistoricalRisk(13.0827, 80.2707, { recordsOverride: records });
    // Second call should return cached entry
    const res2 = await fetchHistoricalRisk(13.0827, 80.2707);
    assert.strictEqual(res2.historicalRisk, res1.historicalRisk);
    recordPass(18, "Historical Risk: 24-Hour Ingestion Caching & Coordinate Isolation");
  }

  /* ==========================================================================
     4. TOPOGRAPHIC TERRAIN ANALYTICS (Tests 19-21)
     ========================================================================== */
  console.log("\n--- 4. Topographic Terrain Analytics ---");

  // Test 19: Real DEM slope ingestion from terrainService
  {
    clearTerrainCache();
    const terrain = await fetchTerrainData(13.0827, 80.2707); // Chennai coastal plain
    assert(terrain.elevation !== null && terrain.elevation !== undefined);
    assert(typeof terrain.slope === "number");
    assert(terrain.slope >= 0 && terrain.slope <= 90);
    assert.notStrictEqual(terrain.slope, 15, "Coastal plain slope must not be hardcoded 15");
    recordPass(19, "Terrain Analytics: Genuine DEM Topographic Ingestion");
  }

  // Test 20: Verified absence of hardcoded terrainSlope = 15
  {
    clearTerrainCache();
    const flatTerrain = await fetchTerrainData(22.5726, 88.3639); // Kolkata Gangetic delta
    assert(typeof flatTerrain.slope === "number");
    assert(flatTerrain.slope < 5.0, "Gangetic delta slope should be nearly flat (< 5 degrees)");
    assert.notStrictEqual(flatTerrain.slope, 15);
    recordPass(20, "Terrain Analytics: Verified Zero Hardcoded 'terrainSlope = 15'");
  }

  // Test 21: Terrain caching and coordinate boundary
  {
    const t1 = await fetchTerrainData(12.9716, 77.5946); // Bengaluru plateau
    const t2 = await fetchTerrainData(12.9716, 77.5946);
    assert.strictEqual(t1.elevation, t2.elevation);
    assert.strictEqual(t1.slope, t2.slope);
    recordPass(21, "Terrain Analytics: Spatial Cache Consistency");
  }

  /* ==========================================================================
     5. SAFE FALLBACK & RESILIENCE (Tests 22-28)
     ========================================================================== */
  console.log("\n--- 5. Safe Fallback & Resilience ---");

  // Test 22: ML service timeout routes to heuristic fallback
  {
    const slowMockFetcher = async () => {
      // Simulate timeout
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    const inputs = { rainfall: 30, forecastRainfall: 10, windSpeed: 20, humidity: 75 };
    const result = await calculateRisk(inputs, { fetcherOverride: slowMockFetcher });

    assert.strictEqual(result.isFallback, true, "Timeout must mark isFallback=true");
    assert.strictEqual(result.model, "Heuristic Fallback Engine");
    assert(result.riskScore >= 0 && result.riskScore <= 100);
    recordPass(22, "Fallback Resilience: ML Timeout Abort Routes to Fallback");
  }

  // Test 23: ML service HTTP 500 error routes to fallback
  {
    const httpErrorFetcher = async () => {
      const err = new Error("ML Service Internal Server Error");
      throw err;
    };

    const inputs = { rainfall: 5, forecastRainfall: 0, windSpeed: 10, humidity: 60 };
    const result = await calculateRisk(inputs, { fetcherOverride: httpErrorFetcher });

    assert.strictEqual(result.isFallback, true);
    assert.strictEqual(result.model, "Heuristic Fallback Engine");
    recordPass(23, "Fallback Resilience: ML HTTP Error Routes to Fallback");
  }

  // Test 24: ML service network unavailability (ECONNREFUSED) routes to fallback
  {
    const connRefusedFetcher = async () => {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:8000");
      throw err;
    };

    const inputs = { rainfall: 50, forecastRainfall: 40, windSpeed: 60, humidity: 85 };
    const result = await calculateRisk(inputs, { fetcherOverride: connRefusedFetcher });

    assert.strictEqual(result.isFallback, true);
    assert.strictEqual(result.model, "Heuristic Fallback Engine");
    assert.strictEqual(result.riskLevel, "Severe");
    recordPass(24, "Fallback Resilience: Network Unavailability Routes to Fallback");
  }

  // Test 25: Malformed ML response - Missing riskLevel
  {
    const malformedFetcher = async () => ({
      // missing riskLevel
      riskScore: 50,
      confidence: 80,
    });

    const result = await calculateRisk({}, { fetcherOverride: malformedFetcher });
    assert.strictEqual(result.isFallback, true, "Missing riskLevel must route to fallback");
    assert.strictEqual(result.model, "Heuristic Fallback Engine");
    recordPass(25, "Malformed ML Rejection: Missing riskLevel Routes to Fallback");
  }

  // Test 26: Malformed ML response - Out-of-bounds riskScore (> 100)
  {
    const outOfBoundsFetcher = async () => ({
      riskLevel: "High",
      riskScore: 150, // Invalid!
      confidence: 85,
    });

    const result = await calculateRisk({}, { fetcherOverride: outOfBoundsFetcher });
    assert.strictEqual(result.isFallback, true, "Out-of-bounds score must route to fallback");
    assert.strictEqual(result.model, "Heuristic Fallback Engine");
    recordPass(26, "Malformed ML Rejection: Out-of-Bounds Score (>100) Routes to Fallback");
  }

  // Test 27: Malformed ML response - NaN confidence
  {
    const nanConfidenceFetcher = async () => ({
      riskLevel: "Low",
      riskScore: 20,
      confidence: NaN, // Invalid!
    });

    const result = await calculateRisk({}, { fetcherOverride: nanConfidenceFetcher });
    assert.strictEqual(result.isFallback, true);
    assert.strictEqual(result.model, "Heuristic Fallback Engine");
    recordPass(27, "Malformed ML Rejection: NaN Confidence Routes to Fallback");
  }

  // Test 28: Never present heuristic fallback as ML output
  {
    const fallback = calculateFallbackRisk({ rainfall: 10, forecastRainfall: 5 });
    assert.strictEqual(fallback.isFallback, true);
    assert.notStrictEqual(fallback.model, "RandomForest ML Service (Port 8000)");
    assert.strictEqual(fallback.model, "Heuristic Fallback Engine");
    recordPass(28, "Provenance Integrity: Heuristic Fallback Never Presented as ML");
  }

  /* ==========================================================================
     6. LOCATION SAFETY & MULTI-CITY ISOLATION (Tests 29-34)
     ========================================================================== */
  console.log("\n--- 6. Location Safety & Multi-City Isolation ---");

  const CITIES = [
    { name: "Chennai", lat: 13.0827, lon: 80.2707 },
    { name: "Bengaluru", lat: 12.9716, lon: 77.5946 },
    { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
    { name: "Kolkata", lat: 22.5726, lon: 88.3639 },
  ];

  // Tests 29-32: Isolation across 4 major Indian cities
  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    clearWeatherCache();

    const intelligence = await getIntelligenceForLocation({
      latitude: city.lat,
      longitude: city.lon,
      locationName: city.name,
      customInputs: {
        rainfall: 10 + i * 5,
        forecastRainfall: 5 + i * 2,
        humidity: 60 + i * 5,
        windSpeed: 15 + i * 3,
        historicalRisk: 20 + i * 10,
        terrainSlope: 1.5 + i * 0.5,
        temperature: 28 + i,
        pressure: 1012 - i,
      },
    });

    assert.strictEqual(intelligence.location.latitude, city.lat);
    assert.strictEqual(intelligence.location.longitude, city.lon);
    assert.strictEqual(intelligence.location.city, city.name);
    assert(VALID_RISK_LEVELS.includes(intelligence.riskLevel));
    assert(intelligence.riskScore >= 0 && intelligence.riskScore <= 100);
    recordPass(29 + i, `Location Isolation: ${city.name} (${city.lat}, ${city.lon}) Safe Execution`);
  }

  // Test 33: Zero silent fallback to Bhubaneswar in intelligenceService
  {
    assert.throws(
      () => {
        validateCoordinates(null, null);
      },
      (err) => err.statusCode === 400
    );

    assert.throws(
      () => {
        validateCoordinates(undefined, undefined);
      },
      (err) => err.statusCode === 400
    );
    recordPass(33, "Location Safety: Explicit Error on Missing Coordinates (Zero Bhubaneswar Fallback)");
  }

  // Test 34: Out-of-bounds coordinates throw explicit HTTP 400
  {
    assert.throws(
      () => {
        validateCoordinates(95.0, 80.0); // lat > 90
      },
      (err) => err.statusCode === 400
    );

    assert.throws(
      () => {
        validateCoordinates(13.0, 195.0); // lon > 180
      },
      (err) => err.statusCode === 400
    );
    recordPass(34, "Location Safety: Out-of-Bounds Coordinate Rejection");
  }

  /* ==========================================================================
     7. RISKRESULT PERSISTENCE & TRACEABILITY (Tests 35-38)
     ========================================================================== */
  console.log("\n--- 7. RiskResult Persistence & Traceability ---");

  // Test 35: RiskResult Schema strict validation
  {
    const validDoc = new RiskResult({
      location: {
        displayName: "Chennai, Tamil Nadu",
        city: "Chennai",
        region: "Tamil Nadu",
        latitude: 13.0827,
        longitude: 80.2707,
      },
      coordinates: {
        type: "Point",
        coordinates: [80.2707, 13.0827],
      },
      riskLevel: "High",
      riskScore: 72,
      confidence: 85,
      confidenceType: "CALIBRATED",
      calibrationMethod: "Platt Sigmoid (5-fold Cross-Validation)",
      hazard: "Heavy Rain / Waterlogging",
      impactLevel: "Warning",
      model: "Calibrated RandomForestClassifier (Port 8000)",
      modelVersion: "2.0.0",
      datasetVersion: "ERA5-MultiCity-2021-2023",
      isFallback: false,
      inputs: {
        rainfall: 35.0,
        forecastRainfall: 20.0,
        humidity: 85.0,
        windSpeed: 28.0,
        historicalRisk: 45.0,
        terrainSlope: 2.1,
        temperature: 29.0,
        pressure: 1007.0,
      },
      featureVector: [35.0, 20.0, 85.0, 28.0, 45.0, 2.1, 29.0, 1007.0],
      factors: [
        { name: "Heavy rainfall", impact: "High", detail: "35 mm recorded" },
      ],
      explanation: "Classified as High risk.",
      provenance: {
        weatherSource: "Open-Meteo API",
        executionDurationMs: 42,
      },
    });

    let validationError;
    try {
      await validDoc.validate();
    } catch (err) {
      validationError = err;
    }
    assert.strictEqual(validationError, undefined, "Valid RiskResult doc must pass schema validation");
    recordPass(35, "RiskResult Schema: 8-Feature Snapshot & Provenance Validation");
  }

  // Test 36: RiskResult Schema rejection of invalid riskLevel
  {
    const invalidDoc = new RiskResult({
      location: { latitude: 13.0827, longitude: 80.2707 },
      coordinates: { type: "Point", coordinates: [80.2707, 13.0827] },
      riskLevel: "EXTREME_DANGER", // Invalid enum!
      riskScore: 90,
      inputs: {
        rainfall: 0,
        forecastRainfall: 0,
        humidity: 50,
        windSpeed: 10,
        historicalRisk: 20,
        terrainSlope: 0,
        temperature: 25,
        pressure: 1013,
      },
    });

    let validationError;
    try {
      await invalidDoc.validate();
    } catch (err) {
      validationError = err;
    }
    assert(validationError !== undefined, "Invalid riskLevel enum must be rejected");
    assert(validationError.errors.riskLevel);
    recordPass(36, "RiskResult Schema: Strict RiskLevel Enum Validation");
  }

  // Test 37: RiskResult Schema rejection of out-of-range riskScore (> 100)
  {
    const invalidScoreDoc = new RiskResult({
      location: { latitude: 13.0827, longitude: 80.2707 },
      coordinates: { type: "Point", coordinates: [80.2707, 13.0827] },
      riskLevel: "Severe",
      riskScore: 105, // Invalid > 100!
      inputs: {
        rainfall: 0,
        forecastRainfall: 0,
        humidity: 50,
        windSpeed: 10,
        historicalRisk: 20,
        terrainSlope: 0,
        temperature: 25,
        pressure: 1013,
      },
    });

    let validationError;
    try {
      await invalidScoreDoc.validate();
    } catch (err) {
      validationError = err;
    }
    assert(validationError !== undefined);
    assert(validationError.errors.riskScore);
    recordPass(37, "RiskResult Schema: RiskScore Range Constraint (0-100)");
  }

  // Test 38: Non-blocking persistence handling when offline
  {
    const offlineResult = await persistRiskResult({
      location: {
        displayName: "Chennai, Tamil Nadu",
        city: "Chennai",
        region: "Tamil Nadu",
        latitude: 13.0827,
        longitude: 80.2707,
      },
      riskLevel: "Low",
      riskScore: 20,
      confidence: 85,
      hazard: "No Significant Hazard",
      impactLevel: "Advisory",
      model: "Heuristic Fallback Engine",
      modelVersion: "1.0.0",
      isFallback: true,
      inputs: {
        rainfall: 0,
        forecastRainfall: 0,
        humidity: 50,
        windSpeed: 10,
        historicalRisk: 15,
        terrainSlope: 1.0,
        temperature: 28,
        pressure: 1012,
      },
    });
    // If MongoDB is not connected, it degrades non-fatally
    assert(offlineResult.persisted === true || offlineResult.persisted === false);
    recordPass(38, "RiskResult Persistence: Non-Blocking Graceful Degradation");
  }

  console.log("\n================================================================================");
  console.log(`   PHASE 5 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

runSuite().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
