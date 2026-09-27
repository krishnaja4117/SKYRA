# SKYRA – System Architecture & PPT Alignment Specification
**Smart India Hackathon 2026 | Problem Statement 26068**
*Hyperlocal Weather Intelligence & Predictive Disaster Risk Platform*

---

## 1. Architectural Overview & Target Data Flow

The SKYRA platform implements an end-to-end, multi-tier intelligence pipeline designed according to the official presentation specification:

```
[ REAL WEATHER + LOCATION + HISTORICAL + TERRAIN + IMD + SATELLITE / RADAR ]
                                 │
                                 ▼
                     [ 1. DATA INGESTION LAYER ]
   (PipelineRunner: Cache Lookup ➔ Fetch/Retry ➔ Validate ➔ Normalize ➔ Store)
                                 │
                                 ▼
                    [ 2. AI & ANALYTICS LAYER ]
   (Pure Feature Extraction: Strict 8-Feature Vector Order ➔ Calibrated ML Models)
                                 │
                                 ▼
                    [ 3. RISK + IMPACT ENGINE ]
    (Impact Assessment: Flood, Wind, Heat, Infrastructure, Community, Cascading)
                                 │
                                 ▼
                   [ 4. EXPLAINABLE AI (XAI) ]
   (Rule-Based Physical Attribution ➔ Environmental Impact Reasoning ➔ Evidence)
                                 │
                                 ▼
                 [ 5. RAG + KNOWLEDGE BASE LAYER ]
     (Authoritative Disaster Corpus: NDMA/IMD/SDMA ➔ FAISS / Pinecone Vectors)
                                 │
                                 ▼
       [ 6. SKYRA: ASK ➔ WATCH ➔ WARN ➔ ADVISE ➔ RESPOND ]
 (Unified Intelligence Payload: Canonical SkyraIntelligenceResult Data Contract)
                                 │
                                 ▼
           [ 7. MULTI-MODAL CLIENT PRESENTATION SUITE ]
        (Dashboard • RiskMap • WeatherGPT • Alerts • Emergency Response)
```

---

## 2. Telemetry Ingestion Streams (Phase 2 & Phase 3)

SKYRA integrates seven authoritative environmental telemetry streams with explicit source attribution and cryptographic integrity:

| # | Data Stream | Provider / Authority | Endpoint / Protocol | Refresh / Window | Implementation File |
|---|---|---|---|---|---|
| **1** | **Live Current Weather** | Open-Meteo NWP | `https://api.open-meteo.com/v1/forecast` | Real-time (15 min cache) | `backend/src/services/weatherService.js` |
| **2** | **Hourly & Daily Forecast** | Open-Meteo Best-Match NWP | `https://api.open-meteo.com/v1/forecast` | 7-day hourly / daily | `backend/src/services/weatherService.js` |
| **3** | **Historical ERA5 Reanalysis** | ECMWF / Copernicus ERA5 Archive | `https://archive-api.open-meteo.com/v1/archive` | 30-day antecedent baseline | `backend/src/services/ingestion/era5Service.js` |
| **4** | **Topographic Terrain Inclination** | Copernicus / SRTM 90m DEM | `https://api.open-meteo.com/v1/elevation` | Static DEM grid (9-point) | `backend/src/services/ingestion/terrainService.js` |
| **5** | **IMD Bulletins & Warnings** | India Meteorological Department (IMD / MoES) | `https://api.imd.gov.in/api/v1` & `https://mausam.imd.gov.in` | 30 min cache (60 km radius) | `backend/src/services/ingestion/imdService.js` |
| **6** | **Satellite Remote Sensing** | ISRO / SAC MOSDAC (INSAT-3D/3DR) | `https://www.mosdac.gov.in/data/satellite` | 15 min orbital cycle | `backend/src/services/ingestion/satelliteService.js` |
| **7** | **Doppler Weather Radar (DWR)** | IMD National DWR Network (S/C Band) | `https://mausam.imd.gov.in/radar` | 10 min volume scan (250 km) | `backend/src/services/ingestion/radarService.js` |

### Ingestion Lifecycle Guarantees (`pipelineRunner.js`)
1. **Cache Lookup**: In-memory TTL cache eliminates redundant upstream network calls.
2. **Fetch with Bounded Exponential Backoff**: Retries transient 5xx network drops; never retries client 4xx validation errors.
3. **Strict Validation**: Explicit coordinate verification (`WGS-84`) and structural schema checks.
4. **Normalization & Provenance**: Normalizes every payload into standard units and attaches a canonical provenance descriptor (`provenanceService.js`).
5. **Persistence**: Non-blocking asynchronous snapshot archival to MongoDB (`WeatherSnapshot`) and cloud storage (`s3Service.js`).
6. **Zero Silent Fallback**: Strictly rejects invalid coordinates. Never falls back to Bhubaneswar (20.2961, 85.8245) or any other default location.

---

## 3. Provenance & Source Authority Model (`provenanceService.js`)

Every data point entering SKYRA is bound to an immutable provenance object containing:
- `provider`: Authority name (e.g., `"India Meteorological Department (IMD)"`, `"Open-Meteo"`, `"ISRO / MOSDAC Space Applications Centre"`).
- `dataset`: Exact product classification (e.g., `"City Weather Warnings & Advisories"`, `"ERA5 Reanalysis Archive"`, `"INSAT-3D Multispectral Imager"`).
- `sourceUrl`: Authoritative URL identifier.
- `retrievalTime`: ISO-8601 UTC timestamp of platform retrieval.
- `observationTime`: ISO-8601 UTC physical sensing or measurement timestamp.
- `geographicScope`: Geographic metadata (`Point`, `Station`, or `BBox` with latitude, longitude, station ID, station name, coverage radius).
- `freshness`: Currency category (`"live"`, `"recent"`, `"cached"`, `"historical"`, `"stale"`).
- `status`: Provider availability flag (`"ok"`, `"cached"`, `"partial"`, `"mock"`, `"blocked"`, `"error"`).
- `diagnosticMessage`: Truthful explanation if live data is unreachable or requires institutional clearance.

---

## 4. AI & Analytics Core (Phase 5)

The AI layer maintains strict feature discipline and calibrated inference:
- **Canonical 8-Feature Vector Order**:
  `[rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]`
- **Feature Extractor** (`backend/src/services/features/featureExtractor.js`): Pure, deterministic mapping ensuring physical bounds clamping and NaN safety.
- **Trained Model Architecture**: Random Forest & Calibrated XGBoost classifiers trained on ERA5 multi-city climatological reanalysis.
- **Confidence Calibration**: Platt Sigmoid scaling via 5-fold cross-validation providing mathematically reliable probabilities rather than raw tree votes.
- **Fail-Safe Heuristic Engine** (`backend/src/services/riskEngine.js`): Physics-grounded meteorological heuristic fallback activated if the Python ML microservice is unreachable.

---

## 5. Impact Assessment Engine (Phase 6)

Authoritative backend impact engine (`backend/src/services/impactAssessmentService.js`) deriving physical consequences from environmental conditions:
- **Hazard Domains**: Urban Flood, Waterlogging, Heavy Rain, Strong Wind / Squall, Heat Stress / Extreme Temperature.
- **Infrastructure Impact**: Roads & Transportation, Stormwater Drainage, Electrical Grid, Water Supply, Building Integrity.
- **Community Impact**: Public Mobility, Vulnerable Populations (children, elderly, outdoor laborers), Healthcare Facilities Access.
- **Predictive Impact Network**: Causal dependency chaining (Cause ➔ Environmental Effect ➔ Infrastructure Impact ➔ Community Consequence ➔ Recommended Action).
- **Location-Specific Amplification**: Flat terrain slope accumulation factor, historical antecedent vulnerability weighting, seasonal climate context.

---

## 6. Knowledge Corpus & Vector Database (Phase 4)

Prepared foundation for future Phase 7+ RAG and LLM conversational advisories:
- **Production Knowledge Corpus** (`backend/src/knowledge/productionCorpus.js`): Verified, non-fabricated documents from official disaster management authorities:
  - NDMA National Guidelines on Management of Urban Flooding (2020)
  - IMD Standard Operating Procedure for Cyclone Warning Services (2021)
  - Tamil Nadu SDMA Coastal Flooding & Cyclone SOP (2023)
  - Municipal Corporation of Greater Mumbai Monsoon Disaster Contingency Plan (2023)
  - NDMA Guidelines for Preparation of Action Plan for Prevention of Heat Wave (2019)
  - NDMA Guidelines for Landslide Risk Management (2019)
  - Central Water Commission (CWC) Guidelines on Flood Forecasting (2021)
- **Vector Search Abstraction** (`backend/src/knowledge/vectorStore.js`):
  - 128-dimensional dense semantic embeddings (`generateEmbedding`).
  - Sentence-level chunking with SHA-256 content deduplication and metadata preservation.
  - Local FAISS vector index adapter (`backend/src/knowledge/adapters/faissAdapter.js`) using cosine similarity.
  - Pinecone cloud vector database adapter (`backend/src/knowledge/adapters/pineconeAdapter.js`) with server-side environment variables and graceful offline fallback.
  - Metadata filtering by geographic scope (`National`, `Regional`, `City`), target region, freshness, and issuing agency.

---

## 7. Cloud Storage & Archival (`s3Service.js`)

AWS S3 cloud storage abstraction supporting 7 logical data domains:
- Allowed Prefixes: `weather/`, `forecast/`, `historical/`, `terrain/`, `imd/`, `satellite/`, `radar/`.
- Idempotent object keys: `<prefix><lat>_<lon>_<timestamp>.json`.
- SHA-256 payload integrity checksums attached to every upload receipt.
- Server-side environment credentials only (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`).
- Graceful offline development buffer (`_localMockS3Store`) reporting `liveUploadStatus: "BLOCKED"` when credentials are unconfigured without runtime errors.

---

## 8. Scheduled Orchestration (`airflow/dags/skyra_ingestion_dag.py`)

Apache Airflow DAG orchestrating multi-source batch and streaming telemetry:
- Task dependencies: Parallel ingestion of all 7 streams ➔ AI Risk Evaluation ➔ S3 Cloud Archival.
- Configured with `default_args`: 3 retries, exponential backoff, non-blocking failure alerts.
- Validated via standalone runner `airflow/test_dag_execution.py` ensuring zero local daemon requirement for frontend/backend runtime.

---

## 9. Client Contract & Presentation Suite

All client consumers (Dashboard, RiskMap, WeatherGPT, Alerts, Emergency Response) interact with a single canonical data contract:
- `createSkyraIntelligenceResult` (`backend/src/utils/dataContract.js`)
- `normalizeIntelligenceResult` (`frontend/src/services/dataContract.js`)

Guarantees complete UI compatibility, type safety, and zero location hardcoding across all components.

---

## 10. FastAPI ML Microservice (`ml/predict_api.py`)

Migrated from legacy Flask to high-performance **FastAPI** + **Uvicorn** with strict **Pydantic** request/response data contracts:
- **Endpoints**:
  - `GET /health`: Service health, uptime, active model provenance, model readiness.
  - `POST /predict`: Pydantic validated 8-feature payload + model selector (`random_forest`, `xgboost`, `ensemble`). Returns calibrated risk score, 4-tier risk level, confidence, and provenance.
  - `POST /explain`: Decision-path tree feature attribution and physical reasoning.
- **Model Selector**: Exposes `"random_forest"` (default production model) and `"xgboost"` (calibrated secondary model).

---

## 11. Multi-Channel Alert Architecture (`backend/src/services/alertDispatchService.js`)

Extends Phase 12 alerts into a modular multi-channel dispatch architecture:
- **Supported Channels**:
  - `IN_APP` / `BROWSER_NOTIFICATION` (WebSocket / Local notifications)
  - `WARNING_AUDIO` (Web Audio API sound cues)
  - `WEBHOOK` (Automated HTTP POST to emergency response Webhook URLs configured via `ALERT_WEBHOOK_URL`)
  - `CAP_XML` (Common Alerting Protocol OASIS CAP v1.2 XML generator for NDMA / SDMA feeds)
  - `SMS` (Pluggable adapter reporting truthful `CONFIG_PENDING` when no SMS gateway credentials exist)

---

## 12. LangChain Architectural Alignment

SKYRA implements a lightweight, zero-overhead **LangChain-compatible retrieval and execution pipeline** ([`backend/src/services/langchainRAGService.js`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/backend/src/services/langchainRAGService.js)):
- Employs canonical LangChain abstraction patterns: `Document`, `SkyraRetriever`, `PromptTemplate`, and `RunnableSequence`.
- Fully decoupled from external package version locks, preventing heavy runtime bloat while maintaining 100% architectural fidelity and testability.
- Multi-factor retrieval scoring ($0.50 \text{ Sim} + 0.30 \text{ Authority} + 0.20 \text{ Freshness}$) combined with strict epistemic abstention to eliminate hallucination.

---

## 13. Docker Containerization & Multi-Service Deployment

Standardized container infrastructure orchestrated via root `docker-compose.yml`:
- `skyra-backend`: Node.js 20 Express gateway on Port 5000.
- `skyra-ml`: Python 3.11/3.13 FastAPI + Uvicorn microservice on Port 8000.
- `skyra-frontend`: Multi-stage Vite build served via Nginx on Port 3000.
- `skyra-mongo`: MongoDB 7.0 database on Port 27017.
- Inter-service networking uses Docker DNS service names (`http://ml:8000`, `http://backend:5000`).
