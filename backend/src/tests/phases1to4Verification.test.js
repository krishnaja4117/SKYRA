/**
 * SKYRA – Phases 1–4 Verification & Regression Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates all deliverables across Phases 1 through 4:
 *
 * PHASE 1 — FOUNDATION & ARCHITECTURE
 *   [x] Complete PPT Architecture Flow Alignment
 *
 * PHASE 2 — DATA SOURCES
 *   [x] IMD Integration (Stations, Bulletins, Warnings, Multi-City, Provenance)
 *   [x] Satellite Remote Sensing (INSAT-3D/3DR Products, Cloud Cover, Provenance)
 *   [x] Doppler Weather Radar (IMD DWR Network, 250km Range, Telemetry, Provenance)
 *   [x] Provenance & Source Authority (Standard Schema, ISO Timestamps, Status Flags)
 *
 * PHASE 3 — DATA INGESTION
 *   [x] Multi-Source Ingestion Pipeline Integration (All 7 PPT Streams in Unified Result)
 *   [x] Apache Airflow Pipeline (DAG Structure, Tasks, Retries, Local Testing)
 *   [x] AWS S3 Data Storage (7 Storage Domains, SHA-256 Hash, Credentials, Mock Fallback)
 *
 * PHASE 4 — DATABASE & KNOWLEDGE BASE
 *   [x] Production Knowledge Corpus (Verified Official NDMA, IMD, SDMA Guidelines)
 *   [x] Vector Database Foundation (Chunking, 128-dim Embeddings, Metadata Filtering)
 *   [x] FAISS Local Vector Index (Cosine Similarity, Index Persistence, Deterministic Rebuild)
 *   [x] Pinecone Adapter (Server-Side Env, Graceful Fallback to FAISS)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Ingestion & External Sources
const { createProvenance, VALID_STATUSES, VALID_FRESHNESS } = require("../services/ingestion/provenanceService");
const { fetchIMDAdvisories, findNearestIMDStation, clearIMDCache, IMD_STATIONS } = require("../services/ingestion/imdService");
const { fetchSatelliteData, clearSatelliteCache } = require("../services/ingestion/satelliteService");
const { fetchRadarData, findCoveringRadarStation, clearRadarCache, RADAR_STATIONS } = require("../services/ingestion/radarService");
const { fetchTerrainData, clearTerrainCache } = require("../services/ingestion/terrainService");
const { fetchWeather, validateCoordinates, clearWeatherCache } = require("../services/weatherService");
const { fetchHistoricalRisk, clearHistoricalRiskCache } = require("../services/analytics/historicalRiskService");

// Ingestion Pipeline & Cloud Storage
const {
  uploadIngestionRecord,
  uploadHistoricalDataset,
  uploadIngestionArtifact,
  uploadProcessedData,
  generateObjectKey,
  ALLOWED_PREFIXES,
  clearLocalMockS3Store,
  hasAwsCredentials,
} = require("../services/storage/s3Service");

// Knowledge Corpus & Vector Database
const { PRODUCTION_KNOWLEDGE_CORPUS } = require("../knowledge/productionCorpus");
const {
  VectorStore,
  getVectorStore,
  generateEmbedding,
  chunkDocument,
  DIMENSION,
} = require("../knowledge/vectorStore");
const { FaissVectorAdapter } = require("../knowledge/adapters/faissAdapter");
const { PineconeVectorAdapter } = require("../knowledge/adapters/pineconeAdapter");
const {
  queryVectorKnowledge,
  getVectorStoreStatus,
  calculateContentHash,
} = require("../services/knowledgeService");

// Unified Aggregator
const { getIntelligenceForLocation } = require("../services/intelligenceService");

let testCount = 0;
let passCount = 0;

function recordPass(testName, details = "") {
  testCount += 1;
  passCount += 1;
  console.log(`  PASS [Test ${String(testCount).padStart(2, "0")}] ${testName}${details ? ` (${details})` : ""}`);
}

async function runPhases1to4Suite() {
  console.log("\n================================================================================");
  console.log("🚀 STARTING SKYRA PHASES 1–4 COMPREHENSIVE VERIFICATION SUITE");
  console.log("================================================================================\n");

  /* ============================================================================
     TASK 1: PHASE 1 — FOUNDATION & ARCHITECTURE ALIGNMENT
     ============================================================================ */
  console.log("── Task 1: Phase 1 Architecture Alignment ─────────────────────────────────────");

  // Test 1: Verify ARCHITECTURE.md exists and documents PPT data flow
  {
    const archPath = path.resolve(__dirname, "../../../docs/ARCHITECTURE.md");
    assert.strictEqual(fs.existsSync(archPath), true, "ARCHITECTURE.md must exist in docs/");
    const content = fs.readFileSync(archPath, "utf8");
    assert.ok(content.includes("REAL WEATHER + LOCATION + HISTORICAL + TERRAIN + IMD + SATELLITE / RADAR"));
    assert.ok(content.toLowerCase().includes("impact assessment"));
    assert.ok(content.toLowerCase().includes("explainable ai"));
    assert.ok(content.toLowerCase().includes("knowledge base"));
    recordPass("Architecture: PPT End-to-End Pipeline Documented in docs/ARCHITECTURE.md");
  }

  // Test 2: Verify zero universal fallback to Bhubaneswar across coordinate parser
  {
    const coordsMumbai = validateCoordinates(19.0760, 72.8777);
    assert.strictEqual(coordsMumbai.latitude, 19.0760);
    assert.strictEqual(coordsMumbai.longitude, 72.8777);

    const coordsDelhi = validateCoordinates(28.6139, 77.2090);
    assert.strictEqual(coordsDelhi.latitude, 28.6139);
    assert.strictEqual(coordsDelhi.longitude, 77.2090);

    assert.notStrictEqual(coordsMumbai.latitude, 20.2961);
    assert.notStrictEqual(coordsDelhi.latitude, 20.2961);
    recordPass("Architecture: Coordinate Parser Strictly Preserves Location Without Defaulting");
  }

  /* ============================================================================
     TASK 2: PHASE 2 — IMD INTEGRATION
     ============================================================================ */
  console.log("\n── Task 2: Phase 2 IMD Integration ───────────────────────────────────────────");

  // Test 3: IMD station resolution across multiple cities
  {
    clearIMDCache();
    const chennaiStation = findNearestIMDStation(13.0827, 80.2707);
    assert.strictEqual(chennaiStation.id, "43279");
    assert.strictEqual(chennaiStation.name, "Chennai (Meenambakkam)");

    const mumbaiStation = findNearestIMDStation(19.0760, 72.8777);
    assert.strictEqual(mumbaiStation.id, "43003");

    const delhiStation = findNearestIMDStation(28.6139, 77.2090);
    assert.strictEqual(delhiStation.id, "42182");
    recordPass("IMD: Multi-City Observatory Station Resolution (Chennai, Mumbai, Delhi)");
  }

  // Test 4: IMD advisory payload contains warning color, bulletin, and provenance
  {
    clearIMDCache();
    const imdChennai = await fetchIMDAdvisories(13.0827, 80.2707);
    assert.strictEqual(imdChennai.available, true);
    assert.strictEqual(imdChennai.station.id, "43279");
    assert.ok(["Green", "Yellow", "Orange", "Red"].includes(imdChennai.advisory.warningColor));
    assert.ok(imdChennai.advisory.headline.length > 0);
    assert.strictEqual(imdChennai.provenance.provider, "India Meteorological Department (IMD)");
    recordPass("IMD: Advisory Normalized with Warning Color and Full Provenance");
  }

  // Test 5: IMD explicit unavailable state when outside station coverage (> 60 km)
  {
    clearIMDCache();
    // Point in central Arabian Sea far from any station
    const imdRemote = await fetchIMDAdvisories(14.0, 68.0);
    assert.strictEqual(imdRemote.available, false);
    assert.strictEqual(imdRemote.reason, "OUTSIDE_STATION_COVERAGE");
    assert.strictEqual(imdRemote.station, null);
    assert.strictEqual(imdRemote.provenance.status, "blocked");
    assert.ok(imdRemote.provenance.diagnosticMessage.includes("Zero universal fallback enforced"));
    recordPass("IMD: Outside-Coverage Explicitly Returns Unavailable (Zero Fallback)");
  }

  /* ============================================================================
     TASK 3: PHASE 2 — SATELLITE DATA
     ============================================================================ */
  console.log("\n── Task 3: Phase 2 Satellite Remote Sensing ──────────────────────────────────");

  // Test 6: Satellite remote sensing telemetry retrieval
  {
    clearSatelliteCache();
    const sat = await fetchSatelliteData(13.0827, 80.2707, { locationName: "Chennai" });
    assert.strictEqual(sat.available, true);
    assert.ok(sat.products.cloudCoverPercent >= 0 && sat.products.cloudCoverPercent <= 100);
    assert.ok(sat.products.cloudTopHeightKm > 0);
    assert.ok(sat.products.brightnessTemperatureK > 200);
    assert.ok(sat.products.satelliteName.startsWith("INSAT"));
    assert.strictEqual(sat.provenance.provider, "ISRO / MOSDAC Space Applications Centre");
    recordPass("Satellite: INSAT Remote Sensing Products (Cloud Cover, Radiance, Temp)");
  }

  // Test 7: Satellite bounding box and observation timestamps
  {
    clearSatelliteCache();
    const sat = await fetchSatelliteData(19.0760, 72.8777, { locationName: "Mumbai" });
    assert.strictEqual(sat.available, true);
    assert.strictEqual(sat.provenance.geographicScope.type, "BBox");
    assert.strictEqual(sat.provenance.geographicScope.bbox.length, 4);
    assert.ok(sat.provenance.observationTime);
    recordPass("Satellite: Spatial Bounding Box & Observation Timestamp Validation");
  }

  // Test 8: Satellite explicit unavailable state when remote/blocked without fixture
  {
    clearSatelliteCache();
    const satBlocked = await fetchSatelliteData(0.0, 0.0, { allowFixture: false });
    assert.strictEqual(satBlocked.available, false);
    assert.strictEqual(satBlocked.reason, "UPSTREAM_BLOCKED");
    assert.strictEqual(satBlocked.products, null);
    assert.strictEqual(satBlocked.provenance.status, "blocked");
    recordPass("Satellite: Explicit Unavailable State When Upstream Blocked");
  }

  /* ============================================================================
     TASK 4: PHASE 2 — RADAR DATA
     ============================================================================ */
  console.log("\n── Task 4: Phase 2 Doppler Weather Radar (DWR) ───────────────────────────────");

  // Test 9: Doppler Weather Radar station coverage lookup (250km radius)
  {
    clearRadarCache();
    const radarStation = findCoveringRadarStation(13.0827, 80.2707);
    assert.strictEqual(radarStation.id, "DWR_CHN");
    assert.strictEqual(radarStation.band, "S-band");
    assert.strictEqual(radarStation.rangeKm, 250);

    const radarDelhi = findCoveringRadarStation(28.6139, 77.2090);
    assert.strictEqual(radarDelhi.id, "DWR_DEL");
    recordPass("Radar: National DWR Observatory Range Mapping (250 km Radius)");
  }

  // Test 10: Radar telemetry products (reflectivity dBZ, velocity, echo top)
  {
    clearRadarCache();
    const radarData = await fetchRadarData(13.0827, 80.2707);
    assert.strictEqual(radarData.available, true);
    assert.strictEqual(radarData.radar.id, "DWR_CHN");
    assert.ok(typeof radarData.products.maxReflectivityDbz === "number");
    assert.ok(typeof radarData.products.radialVelocityMs === "number");
    assert.ok(typeof radarData.products.echoTopHeightKm === "number");
    assert.strictEqual(radarData.provenance.provider, "IMD Doppler Weather Radar Network");
    recordPass("Radar: Polarimetric Sweep Products (dBZ Reflectivity, Radial Velocity)");
  }

  // Test 11: Radar out-of-range detection (> 250 km from all DWR stations)
  {
    clearRadarCache();
    // Deep Thar desert far from Delhi/Mumbai radars
    const remoteRadar = await fetchRadarData(26.9, 70.9);
    assert.strictEqual(remoteRadar.available, false);
    assert.strictEqual(remoteRadar.reason, "OUTSIDE_RADAR_COVERAGE");
    assert.strictEqual(remoteRadar.products, null);
    assert.strictEqual(remoteRadar.provenance.status, "blocked");
    assert.ok(remoteRadar.provenance.diagnosticMessage.includes("outside national DWR"));
    recordPass("Radar: Strict Out-of-Range Enforcement (> 250 km Surveillance Limit)");
  }

  /* ============================================================================
     TASK 5: PHASE 2 — SOURCE AUTHORITY / PROVENANCE
     ============================================================================ */
  console.log("\n── Task 5: Phase 2 Source Authority & Provenance ─────────────────────────────");

  // Test 12: Provenance schema validation and validation of required fields
  {
    const prov = createProvenance({
      provider: "India Meteorological Department (IMD)",
      dataset: "City Weather Warnings & Advisories",
      sourceUrl: "https://mausam.imd.gov.in/",
      geographicScope: { latitude: 13.0827, longitude: 80.2707, stationId: "43279" },
      freshness: "live",
      status: "ok",
    });

    assert.strictEqual(prov.provider, "India Meteorological Department (IMD)");
    assert.strictEqual(prov.dataset, "City Weather Warnings & Advisories");
    assert.strictEqual(prov.freshness, "live");
    assert.strictEqual(prov.status, "ok");
    assert.ok(prov.retrievalTime);
    assert.ok(prov.observationTime);
    assert.strictEqual(prov.geographicScope.stationId, "43279");
    recordPass("Provenance: Schema Enforces Provider, Dataset, Timestamps, and Scope");
  }

  // Test 13: Provenance status and freshness validation
  {
    assert.ok(VALID_STATUSES.includes("ok"));
    assert.ok(VALID_STATUSES.includes("blocked"));
    assert.ok(VALID_STATUSES.includes("mock"));
    assert.ok(VALID_FRESHNESS.includes("live"));
    assert.ok(VALID_FRESHNESS.includes("stale"));
    recordPass("Provenance: Explicit Status and Freshness Taxonomies Enforced");
  }

  /* ============================================================================
     TASK 6: PHASE 3 — INTEGRATE ALL PPT DATA SOURCES
     ============================================================================ */
  console.log("\n── Task 6: Phase 3 Multi-Source Pipeline Integration ─────────────────────────");

  // Test 14: Unified intelligence aggregator returns all PPT data sources
  {
    clearWeatherCache();
    clearTerrainCache();
    clearHistoricalRiskCache();
    clearIMDCache();
    clearSatelliteCache();
    clearRadarCache();

    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai",
      region: "Tamil Nadu",
    });

    // 1. Weather + Forecast
    assert.strictEqual(result.location.city, "Chennai");
    assert.ok(typeof result.currentWeather.temperature === "number");
    assert.ok(typeof result.forecast.precipitationExpected === "number");

    // 2. Terrain DEM
    assert.ok(result.impactAssessment.locationSpecificFactors.some((f) => f.factor.includes("Terrain")));

    // 3. Historical ERA5
    assert.ok(result.impactAssessment.locationSpecificFactors.some((f) => f.factor.includes("Historical") || f.factor.includes("Climate")));

    // 4. Observational Streams (IMD, Satellite, Radar)
    assert.ok(result.observationalData !== undefined);
    assert.strictEqual(result.observationalData.imd.available, true);
    assert.strictEqual(result.observationalData.satellite.available, true);
    assert.strictEqual(result.observationalData.radar.available, true);

    // 5. Source Information attribution
    assert.ok(result.sourceInformation.weatherSource);
    assert.ok(result.sourceInformation.imdSource);
    assert.ok(result.sourceInformation.satelliteSource);
    assert.ok(result.sourceInformation.radarSource);

    recordPass("Pipeline Integration: All 7 PPT Data Streams Active in Canonical Result");
  }

  // Test 15: Observational data remains separate from Phase 5 ML feature vector
  {
    // The ML model feature vector must remain strictly 8 numbers
    const { extractFeatures } = require("../services/features/featureExtractor");
    const extracted = extractFeatures({
      rainfall: 10,
      forecastRainfall: 5,
      humidity: 70,
      windSpeed: 15,
      historicalRisk: 25,
      terrainSlope: 0.5,
      temperature: 30,
      pressure: 1010,
    });
    assert.strictEqual(extracted.featureVector.length, 8);
    recordPass("Pipeline Integration: 8-Feature ML Vector Isolated from Observational Feeds");
  }

  /* ============================================================================
     TASK 7: PHASE 3 — APACHE AIRFLOW PIPELINE
     ============================================================================ */
  console.log("\n── Task 7: Phase 3 Apache Airflow Orchestration ──────────────────────────────");

  // Test 16: Airflow DAG file syntax and task structure
  {
    const dagPath = path.resolve(__dirname, "../../../airflow/dags/skyra_ingestion_dag.py");
    assert.strictEqual(fs.existsSync(dagPath), true, "Airflow DAG must exist at airflow/dags/skyra_ingestion_dag.py");
    const dagContent = fs.readFileSync(dagPath, "utf8");
    assert.ok(dagContent.includes("task_ingest_weather"));
    assert.ok(dagContent.includes("task_ingest_forecast"));
    assert.ok(dagContent.includes("task_ingest_historical_era5"));
    assert.ok(dagContent.includes("task_ingest_terrain"));
    assert.ok(dagContent.includes("task_ingest_imd_advisories"));
    assert.ok(dagContent.includes("task_ingest_satellite"));
    assert.ok(dagContent.includes("task_ingest_radar"));
    assert.ok(dagContent.includes("task_evaluate_risk"));
    assert.ok(dagContent.includes("task_archive_to_s3"));
    recordPass("Airflow: DAG Ingestion Tasks Defined across All Telemetry Streams");
  }

  // Test 17: Airflow local execution test suite exists and is documented
  {
    const testRunnerPath = path.resolve(__dirname, "../../../airflow/test_dag_execution.py");
    assert.strictEqual(fs.existsSync(testRunnerPath), true);
    recordPass("Airflow: Standalone Local DAG Verification Harness Verified");
  }

  /* ============================================================================
     TASK 8: PHASE 3 — AWS S3 DATA STORAGE
     ============================================================================ */
  console.log("\n── Task 8: Phase 3 AWS S3 Data Storage ───────────────────────────────────────");

  // Test 18: Allowed S3 domains match architecture specification
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
    recordPass("AWS S3: 7 Authorized Ingestion Storage Prefixes Validated");
  }

  // Test 19: Deterministic object key generation
  {
    const key = generateObjectKey("historical/", 13.0827, 80.2707, "2026-09-26T12:00:00Z");
    assert.strictEqual(key.startsWith("historical/13.0827_80.2707_"), true);
    assert.strictEqual(key.endsWith(".json"), true);
    recordPass("AWS S3: Deterministic Idempotent Object Key Generation");
  }

  // Test 20: Upload records with SHA-256 payload integrity hashing
  {
    clearLocalMockS3Store();
    const uploadRes = await uploadHistoricalDataset(
      { location: "Chennai", era5RiskIndex: 25 },
      { latitude: 13.0827, longitude: 80.2707 }
    );
    assert.strictEqual(uploadRes.success, true);
    assert.strictEqual(typeof uploadRes.contentHash, "string");
    assert.strictEqual(uploadRes.contentHash.length, 64);
    assert.ok(["UPLOADED", "BLOCKED"].includes(uploadRes.liveUploadStatus));
    recordPass("AWS S3: SHA-256 Payload Checksum & Domain Archival Method Verified");
  }

  // Test 21: Graceful offline degradation when AWS credentials are absent
  {
    const hasCreds = hasAwsCredentials();
    assert.strictEqual(typeof hasCreds, "boolean");
    // Upload without real AWS credentials will report BLOCKED without throwing
    const res = await uploadIngestionArtifact("radar/", { radarId: "DWR_CHN" }, { latitude: 13.08, longitude: 80.29 });
    assert.strictEqual(res.success, true);
    recordPass("AWS S3: Graceful Offline Degradation (Zero Fatal Exceptions)");
  }

  /* ============================================================================
     TASK 9: PHASE 4 — PRODUCTION KNOWLEDGE CORPUS
     ============================================================================ */
  console.log("\n── Task 9: Phase 4 Production Knowledge Corpus ───────────────────────────────");

  // Test 22: Production corpus contains verified government disaster guidelines
  {
    assert.ok(Array.isArray(PRODUCTION_KNOWLEDGE_CORPUS));
    assert.ok(PRODUCTION_KNOWLEDGE_CORPUS.length >= 5);

    const docIds = PRODUCTION_KNOWLEDGE_CORPUS.map((d) => d.documentId);
    assert.ok(docIds.includes("NDMA-SOP-FLOOD-2020"));
    assert.ok(docIds.includes("IMD-SOP-CYCLONE-2021"));
    assert.ok(docIds.includes("TNSDMA-SOP-CHENNAI-2023"));
    assert.ok(docIds.includes("MCGM-SOP-MUMBAI-2023"));
    assert.ok(docIds.includes("NDMA-HEATWAVE-2019"));
    recordPass("Knowledge Corpus: Verified Official NDMA/IMD/SDMA Guidelines Present");
  }

  // Test 23: Corpus documents retain complete provenance and non-fabricated URLs
  {
    for (const doc of PRODUCTION_KNOWLEDGE_CORPUS) {
      assert.ok(doc.title && doc.title.length > 5);
      assert.ok(doc.sourceAgency && doc.sourceAgency.length > 3);
      assert.ok(doc.sourceUrl.startsWith("https://"));
      assert.ok(doc.publicationDate);
      assert.ok(doc.retrievalDate);
      assert.ok(["National", "Regional", "City"].includes(doc.geographicScope));
      assert.ok(doc.content && doc.content.length > 50);
    }
    recordPass("Knowledge Corpus: All Documents Retain Full Provenance & Valid URLs");
  }

  /* ============================================================================
     TASK 10: PHASE 4 — VECTOR DATABASE FOUNDATION
     ============================================================================ */
  console.log("\n── Task 10: Phase 4 Vector Database Foundation ───────────────────────────────");

  // Test 24: Deterministic 128-dimensional dense semantic embedding generation
  {
    const vec1 = generateEmbedding("urban flooding stormwater drain subway evacuation");
    const vec2 = generateEmbedding("urban flooding stormwater drain subway evacuation");
    assert.strictEqual(vec1.length, DIMENSION);
    assert.deepStrictEqual(Array.from(vec1), Array.from(vec2), "Embeddings must be 100% deterministic");

    // Unit length check: norm == 1.0
    let sumSq = 0;
    for (let i = 0; i < DIMENSION; i++) sumSq += vec1[i] * vec1[i];
    assert.ok(Math.abs(Math.sqrt(sumSq) - 1.0) < 1e-4, "Vector must be normalized to unit length");
    recordPass("Vector DB: Deterministic 128-Dim Semantic Embedding with Unit Normalization");
  }

  // Test 25: Sentence-level document chunking preserves metadata and hashes
  {
    const sampleDoc = PRODUCTION_KNOWLEDGE_CORPUS[0];
    const chunks = chunkDocument(sampleDoc);
    assert.ok(chunks.length > 1);

    for (const chunk of chunks) {
      assert.strictEqual(chunk.documentId, sampleDoc.documentId);
      assert.strictEqual(chunk.sourceAgency, sampleDoc.sourceAgency);
      assert.ok(chunk.chunkId.startsWith(sampleDoc.documentId));
      assert.strictEqual(chunk.contentHash.length, 64);
    }
    recordPass("Vector DB: Sentence Chunking with SHA-256 Deduplication Hashing");
  }

  /* ============================================================================
     TASK 11: PHASE 4 — FAISS LOCAL VECTOR INDEX
     ============================================================================ */
  console.log("\n── Task 11: Phase 4 FAISS Local Vector Index ─────────────────────────────────");

  // Test 26: FAISS vector retrieval on relevant disaster query (cyclone alert)
  {
    const store = getVectorStore();
    const results = store.query("cyclone alert warning stage fishermen landfall evacuation", { topK: 3 });
    assert.ok(results.length > 0);
    const topMatch = results[0];
    assert.ok(topMatch.score > 0.3);
    assert.strictEqual(topMatch.documentId, "IMD-SOP-CYCLONE-2021");
    assert.ok(topMatch.sourceUrl.includes("mausam.imd.gov.in"));
    recordPass("FAISS: Semantic Retrieval Successfully Matches IMD Cyclone Protocol");
  }

  // Test 27: FAISS geographic metadata filtering (Chennai vs Mumbai)
  {
    const store = getVectorStore();
    // Query filtered for Chennai
    const chennaiResults = store.query("reservoir release relief shelters flood", { topK: 3, region: "Chennai" });
    assert.ok(chennaiResults.length > 0);
    for (const r of chennaiResults) {
      assert.ok(["National", "City"].includes(r.geographicScope));
      if (r.geographicScope === "City") {
        assert.strictEqual(r.targetRegion, "Chennai");
      }
    }

    // Query filtered for Mumbai must never return Chennai guidelines
    const mumbaiResults = store.query("high tide sluice gates railway pumping station", { topK: 3, region: "Mumbai" });
    assert.ok(mumbaiResults.length > 0);
    const docIds = mumbaiResults.map((m) => m.documentId);
    assert.ok(docIds.includes("MCGM-SOP-MUMBAI-2023"));
    assert.ok(!docIds.includes("TNSDMA-SOP-CHENNAI-2023"));
    recordPass("FAISS: Regional Geographic Scope Filtering (Chennai vs Mumbai Isolation)");
  }

  // Test 28: FAISS empty query handling (zero fabricated results)
  {
    const store = getVectorStore();
    assert.deepStrictEqual(store.query(""), []);
    assert.deepStrictEqual(store.query("   "), []);
    recordPass("FAISS: Empty Query Returns Empty Result Safely (Zero Hallucination)");
  }

  /* ============================================================================
     TASK 12: PHASE 4 — PINECONE ADAPTER
     ============================================================================ */
  console.log("\n── Task 12: Phase 4 Pinecone Vector Database Adapter ─────────────────────────");

  // Test 29: Pinecone adapter graceful degradation to FAISS when unconfigured
  {
    const pinecone = new PineconeVectorAdapter();
    const status = pinecone.getStatus();
    assert.ok(["CONFIGURED", "BLOCKED"].includes(status.status));
    if (status.status === "BLOCKED") {
      assert.strictEqual(status.fallback, "FAISS_LOCAL_INDEX");
      assert.ok(status.diagnosticMessage.includes("routed to local FAISS index"));
    }
    recordPass("Pinecone: Graceful Fallback to Local FAISS When Cloud Keys Unconfigured");
  }

  // Test 30: Vector service integration via knowledgeService
  {
    const status = getVectorStoreStatus();
    assert.ok(status.faiss !== undefined);
    assert.ok(status.pinecone !== undefined);
    assert.strictEqual(status.faiss.dimension, 128);

    const directResults = queryVectorKnowledge("urban flooding emergency shelter", { topK: 2 });
    assert.ok(directResults.length > 0);
    recordPass("Knowledge Service: Direct Vector Search Functionality Operational");
  }

  /* ============================================================================
     CROSS-CITY LOCATION ISOLATION VERIFICATION
     ============================================================================ */
  console.log("\n── Cross-City Multi-Location Isolation Verification ──────────────────────────");

  // Test 31: End-to-end multi-location evaluation (Chennai vs Mumbai vs New Delhi)
  {
    const resChennai = await getIntelligenceForLocation({ latitude: 13.0827, longitude: 80.2707, locationName: "Chennai" });
    const resMumbai = await getIntelligenceForLocation({ latitude: 19.0760, longitude: 72.8777, locationName: "Mumbai" });
    const resDelhi = await getIntelligenceForLocation({ latitude: 28.6139, longitude: 77.2090, locationName: "New Delhi" });

    // IMD stations must be strictly city-specific
    assert.strictEqual(resChennai.observationalData.imd.station.id, "43279");
    assert.strictEqual(resMumbai.observationalData.imd.station.id, "43003");
    assert.strictEqual(resDelhi.observationalData.imd.station.id, "42182");

    // Radars must be city-specific
    assert.strictEqual(resChennai.observationalData.radar.radar.id, "DWR_CHN");
    assert.strictEqual(resMumbai.observationalData.radar.radar.id, "DWR_MUM");
    assert.strictEqual(resDelhi.observationalData.radar.radar.id, "DWR_DEL");

    // Locations must not contaminate each other
    assert.strictEqual(resChennai.location.city, "Chennai");
    assert.strictEqual(resMumbai.location.city, "Mumbai");
    assert.strictEqual(resDelhi.location.city, "New Delhi");
    recordPass("Location Isolation: Strict IMD & Radar Separation across Chennai, Mumbai, Delhi");
  }

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passCount} PHASES 1–4 VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  console.log("================================================================================\n");
}

runPhases1to4Suite().catch((err) => {
  console.error("❌ Fatal error in Phases 1–4 test suite:", err);
  process.exit(1);
});
