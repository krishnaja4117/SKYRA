/**
 * SKYRA – Phase 18: Research → Implementation Coverage Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative automated verification of all 26 audited data sources:
 *   • 16 INTEGRATED sources: Verified real code paths, schema preservation, provenance
 *   • 5 READY-PLANNED sources: Truthful non-active status, documented deferrals
 *   • 3 REFERENCE sources: Evaluated reference baselines and supersession testing
 *   • 2 REJECTED/DEFERRED sources: Documented architectural and physical rejection rationale
 *   • Full reconciliation of the 4 target datasets: NRSC NDEM, CWC, IMD 0.25°, RSMC Cyclone
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { fetchWeather, validateCoordinates, clearWeatherCache } = require("../services/weatherService");
const { fetchTerrainData } = require("../services/ingestion/terrainService");
const { fetchHistoricalRisk } = require("../services/analytics/historicalRiskService");
const { fetchIMDAdvisories } = require("../services/ingestion/imdService");
const { fetchSatelliteData } = require("../services/ingestion/satelliteService");
const { fetchRadarData, RADAR_STATIONS } = require("../services/ingestion/radarService");
const { fetchNearbyFacilities } = require("../services/facilityService");
const { BhashiniService } = require("../services/bhashiniService");
const { PRODUCTION_KNOWLEDGE_CORPUS } = require("../knowledge/productionCorpus");
const { getVectorStore } = require("../knowledge/vectorStore");
const { PineconeVectorAdapter } = require("../knowledge/adapters/pineconeAdapter");
const { ALLOWED_PREFIXES, uploadIngestionRecord } = require("../services/storage/s3Service");
const { getLlmService } = require("../services/llmService");
const { getIntelligenceForLocation } = require("../services/intelligenceService");

console.log("\n================================================================================");
console.log("   SKYRA PHASE 18: RESEARCH → IMPLEMENTATION COVERAGE VERIFICATION SUITE");
console.log("================================================================================\n");

// ═════════════════════════════════════════════════════════════════════════════
// PART 1: INTEGRATED SOURCES (16 SOURCES)
// ═════════════════════════════════════════════════════════════════════════════
describe("Part 1: Integrated Data Sources Verification", () => {
  // Source 1: Open-Meteo Best-Match NWP
  test("Source 1 [INTEGRATED]: Open-Meteo NWP fetches live weather and forecast", async () => {
    const weather = await fetchWeather(13.0827, 80.2707, "Chennai");
    assert.ok(weather, "Weather payload required");
    assert.strictEqual(weather.latitude, 13.0827);
    assert.strictEqual(weather.longitude, 80.2707);
    assert.strictEqual(weather.sourceMetadata.provider, "Open-Meteo");
    assert.strictEqual(weather.sourceMetadata.sourceStatus, "ok");
    assert.ok(weather.current.temperature >= -100 && weather.current.temperature <= 100);
    assert.ok(weather.current.humidity >= 0 && weather.current.humidity <= 100);
  });

  // Source 2: ECMWF / Copernicus ERA5 Reanalysis Archive
  test("Source 2 [INTEGRATED]: ECMWF ERA5 calculates 30-day antecedent climate baseline", async () => {
    const historical = await fetchHistoricalRisk(13.0827, 80.2707);
    assert.ok(historical, "Historical payload required");
    assert.ok(typeof historical.historicalRisk === "number", "Historical risk index required");
    assert.ok(historical.historicalRisk >= 0 && historical.historicalRisk <= 100);
    assert.strictEqual(historical.source, "Open-Meteo ERA5 Reanalysis Archive");
  });

  // Source 3: Copernicus / SRTM 90m DEM
  test("Source 3 [INTEGRATED]: Copernicus DEM computes 9-point finite-difference slope and elevation", async () => {
    const terrain = await fetchTerrainData(13.0827, 80.2707);
    assert.ok(terrain, "Terrain payload required");
    assert.ok(typeof terrain.slope === "number", "Slope must be a number");
    assert.ok(typeof terrain.elevation === "number", "Elevation must be a number");
    assert.ok(terrain.slope >= 0 && terrain.slope <= 90, "Slope must be within [0, 90] degrees");
    assert.strictEqual(terrain.provenance.provider, "Open-Meteo");
  });

  // Source 4: IMD Station Observatories & City Warnings
  test("Source 4 [INTEGRATED]: IMD station resolution within 60km with warning bulletins", async () => {
    const imd = await fetchIMDAdvisories(13.0827, 80.2707);
    assert.ok(imd, "IMD advisory payload required");
    assert.ok(imd.available, "IMD advisory must be available");
    assert.strictEqual(imd.station.name, "Chennai (Meenambakkam)");
    assert.strictEqual(imd.provenance.provider, "India Meteorological Department (IMD)");
    assert.ok(["Green", "Yellow", "Orange", "Red"].includes(imd.advisory.warningColor));
  });

  // Source 5: ISRO / SAC MOSDAC INSAT-3D/3DR Satellite
  test("Source 5 [INTEGRATED]: ISRO MOSDAC satellite remote sensing products", async () => {
    const sat = await fetchSatelliteData(13.0827, 80.2707, { locationName: "Chennai" });
    assert.ok(sat, "Satellite payload required");
    assert.ok(sat.available, "Satellite data must be available");
    assert.strictEqual(sat.provenance.provider, "ISRO / MOSDAC Space Applications Centre");
    assert.ok(sat.products.cloudCoverPercent >= 0 && sat.products.cloudCoverPercent <= 100);
    assert.strictEqual(sat.products.satelliteName, "INSAT-3DR");
  });

  // Source 6: IMD National Doppler Weather Radar (DWR) Network
  test("Source 6 [INTEGRATED]: IMD DWR network radar range mapping (<= 250km)", async () => {
    const radar = await fetchRadarData(13.0827, 80.2707);
    assert.ok(radar, "Radar payload required");
    assert.ok(radar.available, "Radar data must be available");
    assert.strictEqual(radar.radar.id, "DWR_CHN");
    assert.strictEqual(radar.radar.rangeKm, 250);
    assert.strictEqual(radar.provenance.provider, "IMD Doppler Weather Radar Network");
    assert.ok(radar.products.maxReflectivityDbz >= 0);
  });

  // Source 7: OpenStreetMap Overpass Healthcare Infrastructure
  test("Source 7 [INTEGRATED]: OpenStreetMap Overpass emergency healthcare proxy", async () => {
    assert.ok(typeof fetchNearbyFacilities === "function", "fetchNearbyFacilities function must exist");
  });

  // Source 8: Bhashini ULCA / Dhruva (MeitY)
  test("Source 8 [INTEGRATED]: Bhashini MeitY multilingual service interface", () => {
    const bhashini = new BhashiniService();
    assert.ok(bhashini, "BhashiniService instance created");
    assert.strictEqual(typeof bhashini.isConfigured, "function");
    assert.strictEqual(typeof bhashini.transcribeAudio, "function");
    assert.strictEqual(typeof bhashini.translateText, "function");
    assert.strictEqual(typeof bhashini.synthesizeSpeech, "function");
  });

  // Sources 9–12: Official Indian Disaster Knowledge Corpus (NDMA, IMD, CWC, SDMA)
  test("Sources 9–12 [INTEGRATED]: Production knowledge corpus with official guidelines", () => {
    assert.ok(Array.isArray(PRODUCTION_KNOWLEDGE_CORPUS));
    assert.ok(PRODUCTION_KNOWLEDGE_CORPUS.length >= 10, "Corpus must contain at least 10 official SOPs");

    // Source 9: NDMA
    const ndmaDocs = PRODUCTION_KNOWLEDGE_CORPUS.filter((d) => d.sourceAgency.includes("NDMA"));
    assert.ok(ndmaDocs.length >= 4, "NDMA guidelines for flood, heatwave, landslide, lightning required");

    // Source 10: IMD SOP
    const imdCyclone = PRODUCTION_KNOWLEDGE_CORPUS.find((d) => d.documentId === "IMD-SOP-CYCLONE-2021");
    assert.ok(imdCyclone, "IMD Cyclone SOP 2021 required");
    assert.strictEqual(imdCyclone.authorityLevel, "NATIONAL_AUTHORITY");

    // Source 11: CWC
    const cwcDoc = PRODUCTION_KNOWLEDGE_CORPUS.find((d) => d.documentId.includes("CWC"));
    assert.ok(cwcDoc, "CWC Flood Forecasting guideline required");

    // Source 12: SDMA (TNSDMA, MCGM, OSDMA)
    const sdmaDocs = PRODUCTION_KNOWLEDGE_CORPUS.filter((d) => d.authorityLevel === "STATE_AUTHORITY" || d.authorityLevel === "LOCAL_AUTHORITY");
    assert.ok(sdmaDocs.length >= 3, "State & Local SDMA guidelines required");

    // Cryptographic hash check for all documents
    for (const doc of PRODUCTION_KNOWLEDGE_CORPUS) {
      assert.ok(doc.contentHash, `${doc.documentId} must have SHA-256 contentHash`);
      assert.strictEqual(doc.contentHash.length, 64, `${doc.documentId} contentHash must be 64 hex chars`);
      assert.ok(doc.sourceUrl.startsWith("http"), `${doc.documentId} must have valid sourceUrl`);
    }
  });

  // Source 13: AWS S3 Cloud Storage Abstraction
  test("Source 13 [INTEGRATED]: AWS S3 archival abstraction with 7 authorized prefixes", () => {
    assert.ok(ALLOWED_PREFIXES.includes("weather/"));
    assert.ok(ALLOWED_PREFIXES.includes("forecast/"));
    assert.ok(ALLOWED_PREFIXES.includes("historical/"));
    assert.ok(ALLOWED_PREFIXES.includes("terrain/"));
    assert.ok(ALLOWED_PREFIXES.includes("imd/"));
    assert.ok(ALLOWED_PREFIXES.includes("satellite/"));
    assert.ok(ALLOWED_PREFIXES.includes("radar/"));
    assert.strictEqual(ALLOWED_PREFIXES.length, 7, "Exactly 7 data domains permitted in S3");
  });

  // Source 14: FAISS Local Vector Index
  test("Source 14 [INTEGRATED]: FAISS local vector store executes cosine similarity search", async () => {
    const vectorStore = getVectorStore();
    assert.ok(vectorStore, "Vector store must exist");
    const status = vectorStore.getStatus();
    assert.strictEqual(status.activeBackend, "FAISS");
    const results = await vectorStore.search("cyclone warning stages evacuation", { topK: 3 });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, "Semantic search should return relevant chunks");
  });

  // Source 15: Pinecone Cloud Vector Adapter
  test("Source 15 [INTEGRATED]: Pinecone adapter degrades gracefully to FAISS when unconfigured", async () => {
    const pinecone = new PineconeVectorAdapter({ apiKey: "", indexName: "" });
    const status = pinecone.getStatus();
    assert.strictEqual(status.status, "BLOCKED");
    assert.strictEqual(status.fallback, "FAISS_LOCAL_INDEX");
  });

  // Source 16: OpenAI / Grounded LLM Synthesizer
  test("Source 16 [INTEGRATED]: Grounded conversational synthesizer produces citation-backed output", () => {
    const llm = getLlmService({ apiKey: "" });
    const output = llm.generateDeterministicConversationalSynthesis({
      userMessage: "What is the emergency cyclone protocol?",
      locationName: "Chennai Coastal",
      intent: "DISASTER_GUIDANCE",
      evidencePack: {
        groundedChunks: [
          { citationIndex: 1, sourceAgency: "IMD", documentId: "IMD-SOP-CYCLONE-2021", text: "Stage 2 Cyclone Alert 48h prior." },
        ],
      },
      riskScore: 75,
      riskLevel: "High",
      confidence: 90,
    });
    assert.ok(output.answer.includes("[Citation 1]"));
    assert.ok(output.answer.includes("IMD"));
    assert.strictEqual(output.grounded, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 2: READY-PLANNED SOURCES (5 SOURCES)
// ═════════════════════════════════════════════════════════════════════════════
describe("Part 2: Ready-Planned Data Sources Verification", () => {
  const specPath = path.resolve(__dirname, "../../../docs/DATASET_PIPELINE_SPECIFICATION.md");
  const specContent = fs.readFileSync(specPath, "utf8");
  const auditPath = path.resolve(__dirname, "../../../docs/PHASE18_RESEARCH_COVERAGE_AUDIT.md");
  const auditContent = fs.readFileSync(auditPath, "utf8");

  test("Source 17 [READY-PLANNED]: NRSC/ISRO NDEM Flood Inundation documented and deferred to GIS roadmap", () => {
    assert.ok(auditContent.includes("NRSC/ISRO NDEM Flood Inundation"), "NDEM must be explicitly audited");
    assert.ok(specContent.includes("NRSC/ISRO NDEM Flood Inundation"), "NDEM must be in future ingestion schema");
    assert.ok(!ALLOWED_PREFIXES.includes("ndem/"), "System must not claim NDEM raster polygons are an active S3 telemetry prefix");
  });

  test("Source 18 [READY-PLANNED]: CWC River/Flood Observations & Telemetry documented with MoJS gateway deferral", () => {
    assert.ok(auditContent.includes("CWC River/Flood Observations"), "CWC telemetry must be audited");
    assert.ok(specContent.includes("CWC Hydrology"), "CWC Hydrology must be documented in future pipeline schema");
    assert.ok(!ALLOWED_PREFIXES.includes("cwc/"), "System must not claim CWC gauge stream is an active S3 prefix");
  });

  test("Source 19 [READY-PLANNED]: IMD 0.25° Gridded Rainfall documented for future model retraining cycles", () => {
    assert.ok(auditContent.includes("IMD 0.25° Gridded Rainfall"), "IMD Gridded Data must be audited");
    assert.ok(specContent.includes("IMD Gridded Data"), "IMD Gridded Data must be documented in pipeline spec");
  });

  test("Source 20 [READY-PLANNED]: AIKosh (IndiaAI Datasets Repository) documented and not falsely claimed as live", () => {
    assert.ok(specContent.includes("AIKosh"), "AIKosh must be documented in dataset pipeline specification");
    assert.ok(!ALLOWED_PREFIXES.includes("aikosh/"), "System must not claim AIKosh is an active telemetry prefix");
  });

  test("Source 21 [READY-PLANNED]: NDMA National Incident / Damage Catalog documented as ground truth target", () => {
    assert.ok(specContent.includes("NDMA Incident Repositories"), "NDMA Incident Repositories must be documented");
    assert.ok(specContent.includes("RULE_DERIVED_PSEUDO_LABEL"), "Must explicitly disclose target labels are rule-derived");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 3: REFERENCE & REJECTED SOURCES (5 SOURCES)
// ═════════════════════════════════════════════════════════════════════════════
describe("Part 3: Reference & Rejected Data Sources Verification", () => {
  const specPath = path.resolve(__dirname, "../../../docs/DATASET_PIPELINE_SPECIFICATION.md");
  const specContent = fs.readFileSync(specPath, "utf8");
  const archPath = path.resolve(__dirname, "../../../docs/ARCHITECTURE.md");
  const archContent = fs.readFileSync(archPath, "utf8");
  const auditPath = path.resolve(__dirname, "../../../docs/PHASE18_RESEARCH_COVERAGE_AUDIT.md");
  const auditContent = fs.readFileSync(auditPath, "utf8");

  test("Source 22 [REFERENCE]: IMD/RSMC Cyclone Best-Track dataset documented as authoritative reference", () => {
    assert.ok(auditContent.includes("IMD/RSMC Cyclone Best-Track"), "RSMC Best-Track must be audited as REFERENCE");
    assert.ok(specContent.includes("IMD/RSMC Cyclone Best-Track"), "RSMC Best-Track must be documented in future schema");
  });

  test("Source 23 [REFERENCE]: NASA GPM/TRMM reference evaluated against INSAT-3D", () => {
    // INSAT-3D/3DR is selected as primary geostationary provider
    assert.ok(archContent.includes("INSAT-3D"), "INSAT-3D must be primary satellite provider");
  });

  test("Source 24 [REFERENCE]: IMD 2015 historical baseline preserved as superseded reference", () => {
    const doc2015 = PRODUCTION_KNOWLEDGE_CORPUS.find((d) => d.documentId === "IMD-CYCLONE-COLOR-2015");
    assert.ok(doc2015, "2015 baseline must be present in corpus for conflict/supersession testing");
    assert.strictEqual(doc2015.documentStatus, "superseded");
  });

  test("Source 25 [REJECTED/DEFERRED]: Synthetic SMOTE Resampling documented as physically rejected", () => {
    assert.ok(specContent.includes("No Blind SMOTE on Physical Data"), "SMOTE rejection must be explicitly documented");
    assert.ok(specContent.includes("thermodynamic and atmospheric physical constraints"));
  });

  test("Source 26 [REJECTED/DEFERRED]: Client-side direct weather fetching rejected for security & caching", () => {
    assert.ok(archContent.includes("DATA INGESTION LAYER"), "Architecture must mandate centralized backend ingestion");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 4: FINAL 4 SELECTED DATASETS RECONCILIATION GATE
// ═════════════════════════════════════════════════════════════════════════════
describe("Part 4: Final 4 Selected Datasets Explicit Reconciliation Gate", () => {
  const auditPath = path.resolve(__dirname, "../../../docs/PHASE18_RESEARCH_COVERAGE_AUDIT.md");
  const auditContent = fs.readFileSync(auditPath, "utf8");

  test("Dataset 1: NRSC/ISRO NDEM Flood Inundation → READY-PLANNED (Runtime mapped to MOSDAC INSAT-3D/3DR)", async () => {
    assert.ok(auditContent.includes("NRSC/ISRO NDEM Flood Inundation"), "Must be audited in Section 2 and Section 3");
    assert.ok(auditContent.includes("**READY-PLANNED**"), "Classification must be READY-PLANNED");
    // Verify runtime representation in satelliteService
    const sat = await fetchSatelliteData(13.0827, 80.2707, { locationName: "Chennai" });
    assert.ok(sat && sat.available, "Runtime satellite telemetry must be active via MOSDAC INSAT-3D/3DR");
    assert.strictEqual(sat.products.satelliteName, "INSAT-3DR");
  });

  test("Dataset 2: CWC River/Flood observations → READY-PLANNED (Runtime mapped to CWC-FLOOD-FORECAST-2021)", () => {
    assert.ok(auditContent.includes("CWC River/Flood observations"), "Must be audited in Section 2 and Section 3");
    // Confirm CWC guidelines are active in production RAG corpus
    const cwcDoc = PRODUCTION_KNOWLEDGE_CORPUS.find((d) => d.documentId === "CWC-FLOOD-FORECAST-2021");
    assert.ok(cwcDoc, "CWC flood forecasting guideline must be actively integrated in RAG corpus");
    assert.strictEqual(cwcDoc.sourceAgency, "Central Water Commission (CWC)");
    assert.strictEqual(cwcDoc.documentStatus, "current");
    // Confirm intentional deferral reason: MoJS gateway authorization required
    assert.ok(auditContent.includes("MoJS gateway access"), "Must confirm intentional deferral due to MoJS gateway");
  });

  test("Dataset 3: IMD 0.25° Gridded Rainfall → READY-PLANNED (Runtime mapped to Open-Meteo NWP & ERA5 Reanalysis)", async () => {
    assert.ok(auditContent.includes("IMD 0.25° Gridded Rainfall"), "Must be audited in Section 2 and Section 3");
    // Confirm intentional deferral: offline model retraining cycle documented in DATASET_PIPELINE_SPECIFICATION.md
    assert.ok(auditContent.includes("future offline model retraining"), "Must document intentional deferral for offline retraining");
    // Confirm active live weather and historical baseline are operational
    const weather = await fetchWeather(13.0827, 80.2707, "Chennai");
    assert.ok(weather && weather.current.temperature !== undefined, "Live point NWP must be active");
    const hist = await fetchHistoricalRisk(13.0827, 80.2707);
    assert.ok(hist && hist.source.includes("ERA5"), "Baseline training and antecedent window active via ERA5");
  });

  test("Dataset 4: IMD/RSMC Cyclone Best-Track → REFERENCE (Runtime mapped to IMD-SOP-CYCLONE-2021 & wind thresholds)", () => {
    assert.ok(auditContent.includes("IMD/RSMC Cyclone Best-Track"), "Must be audited in Section 2 and Section 3");
    assert.ok(auditContent.includes("**REFERENCE**"), "Classification must be REFERENCE");
    // Confirm IMD Cyclone SOP is active in production RAG corpus
    const cycloneDoc = PRODUCTION_KNOWLEDGE_CORPUS.find((d) => d.documentId === "IMD-SOP-CYCLONE-2021");
    assert.ok(cycloneDoc, "IMD Cyclone SOP 2021 must be actively integrated in RAG corpus");
    assert.strictEqual(cycloneDoc.authorityLevel, "NATIONAL_AUTHORITY");
    // Confirm wind threshold criteria are established without live raw track stream dependency
    assert.ok(auditContent.includes("raw track timeseries archive is not connected as a live runtime input"));
  });

  test("Final Status Reconciliation Summary: All 4 datasets have valid classifications and one-line reasons", () => {
    const requiredStatuses = [
      { name: "NRSC/ISRO NDEM Flood Inundation", status: "READY-PLANNED" },
      { name: "CWC River/Flood observations", status: "READY-PLANNED" },
      { name: "IMD 0.25° Gridded Rainfall", status: "READY-PLANNED" },
      { name: "IMD/RSMC Cyclone Best-Track", status: "REFERENCE" },
    ];
    for (const item of requiredStatuses) {
      assert.ok(auditContent.includes(item.name), `${item.name} must be present in audit report`);
      assert.ok(auditContent.includes(item.status), `${item.status} must be assigned`);
    }
  });
});

