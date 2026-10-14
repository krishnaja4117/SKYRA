# SKYRA Comprehensive Offline-First Disaster Resilience Architecture Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-10-14  
**Author:** Antigravity Senior Offline-First Architect  
**Status:** Pre-Implementation Baseline Audit  

---

## 1. Executive Summary & Purpose
This audit analyzes the existing SKYRA disaster-awareness platform to guide its transformation into a high-reliability offline-first system capable of functioning during internet blackouts, grid failures, and severe weather crises without degrading existing online functionality, UI aesthetics, or Render deployment configurations.

---

## 2. Architecture & Service Breakdown

### 2.1 Technology Stack
- **Frontend:** React 19.2.8 + Vite 8.3.0 (SPA, client-side routing, vanilla CSS design tokens).
- **Mapping:** Leaflet 1.9.4 + `react-leaflet` 5.0.0 (dynamic tile layer switching, custom HTML marker overlays).
- **Backend Service:** Node.js + Express 4.x (REST API, orchestrator, rate-limiting, rate limiters, SSE alerts).
- **Machine Learning Service:** Python 3.13 + FastAPI 0.115 + Uvicorn + Scikit-Learn 1.6 + XGBoost 3.4.1.
- **Database:** MongoDB (Alert storage, historical reanalysis records, vector knowledge store).
- **Deployment:** Render cloud services (Web services + static frontend CDN).

### 2.2 Network Topology & Dependency Flow
```
[User Browser (Mobile/Desktop)]
   │
   ├─► [Render Static CDN: Frontend]
   │
   ├─► [Render Node.js Backend: :5000] ──► [MongoDB Database]
   │       │
   │       └─► [Render Python FastAPI: :8000] (ML Risk Models)
   │
   ├─► [External: Open-Meteo API] (Fallback weather & NWP telemetry)
   └─► [External: OpenStreetMap / OpenTopoMap Tile Servers] (Basemap tiles)
```

---

## 3. Detailed Component Audit

### 3.1 Frontend App Shell & Reopening (`frontend/`)
- **Current State:**
  - Standard Vite SPA bundle with `index.html`, `/assets/index-[hash].js`, and `/assets/index-[hash].css`.
  - Client-side navigation handled via `window.history.pushState` and popstate listeners (`Dashboard`, `WeatherGPT`, `Forecast & History`, `Alerts & Advisories`, `Emergency Response`, `Settings`).
- **Deficiencies When Disconnected:**
  - Without an installed Service Worker, opening the browser tab or refreshing when offline displays a browser network error (`ERR_INTERNET_DISCONNECTED`).
- **Phase 1 Strategy:**
  - Integrate a PWA Web App Manifest (`manifest.webmanifest`) declaring standalone display, offline branding, and theme color `#0ea5e9`.
  - Implement a Workbox-compatible Service Worker (`sw.js`) that precaches the core application shell (`/`, `/index.html`, `/favicon.svg`, `/manifest.webmanifest`), applies Stale-While-Revalidate for bundled assets, and provides a Network-First navigation handler with seamless cached `/index.html` fallback.

### 3.2 Geospatial Mapping (`RiskMap.jsx` & Leaflet)
- **Current State:**
  - `RiskMap.jsx` displays an interactive map with LayersControl toggling between Standard OpenStreetMap and OpenTopoMap contours.
  - Places precise focal point markers, IMD Doppler Weather Radar surveillance boundaries (250 km radius), and nearby healthcare facilities from the Overpass API.
- **Deficiencies When Disconnected:**
  - Leaflet fetches XYZ raster tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) on-demand. When disconnected, any pan or zoom outside browser memory renders blank tiles.
- **Offline Map Strategy (Phase 3):**
  - Implement a bounded regional tile pack generator and storage manager using IndexedDB (`map_tiles` store) and CacheStorage (`skyra-tiles-v1`).
  - Restrict pre-downloads to localized bounding boxes at zoom levels 10–13 (~150–250 tiles per district, 2.5–4.5 MB), adhering strictly to OpenStreetMap tile usage policies.
  - Surface an explicit offline disclaimer: *"Cached maps provide static geographic basemaps and cannot display live road closures or active hazard perimeters."*

### 3.3 Meteorological Machine Learning Models (`ml/`)
- **Current State:**
  - Primary Production Model: `risk_model.pkl` — `CalibratedClassifierCV(RandomForestClassifier, n_estimators=200, max_depth=10, class_weight='balanced')` calibrated via Platt Sigmoid (5-fold CV). File size: 18.8 MB.
  - Calibrated XGBoost Model: `calibrated_xgboost_model.pkl` (6.2 MB).
  - Standalone XGBoost Classifier: `xgboost_model.pkl` — 200 boosting rounds across 4 classes (`Low`, `Moderate`, `High`, `Severe`), totaling 800 binary decision trees. File size: 1.06 MB.
  - Input Features (8 strict numerical variables): `rainfall`, `forecastRainfall`, `humidity`, `windSpeed`, `historicalRisk`, `terrainSlope`, `temperature`, `pressure`.
- **Offline ML Strategy (Phase 4):**
  - The 18.8 MB Random Forest pickle is oversized for low-bandwidth mobile cache.
  - Conversely, `xgboost_model.pkl` exports into a 312.5 KB zero-dependency JSON tree bundle (`frontend/public/models/xgboost_risk_model.json`).
  - Evaluating these 800 trees in JavaScript replicates the Python XGBoost runtime with mathematical probability parity ($< 10^{-5}$ difference across 50 test scenarios) and zero score discrepancies.
  - Predictions must be clearly labeled as **"Offline Estimate"** with model version and data source provenance.

### 3.4 WeatherGPT & Conversational Guidance (`WeatherGpt.jsx`)
- **Current State:**
  - Primary flow calls `POST /api/chat` on the backend, generating contextualized weather advice and RAG citations.
  - A fallback exists in `WeatherGpt.jsx` with localized templates across 6 languages (en-IN, hi-IN, ml-IN, ta-IN, te-IN, kn-IN).
- **Deficiencies When Disconnected:**
  - Questions regarding flood evacuation, landslide warning signs, cyclones, 72-hour survival kits, or emergency helplines returned an uninformative "unsupported" message when offline.
- **Offline WeatherGPT Strategy (Phase 5):**
  - Introduce `safetyKnowledgeBase.js`: a curated, verified NDMA/IMD offline disaster corpus covering floods, landslides, cyclones, heatwaves, survival kits, and official helplines (112, 1078, 1070).
  - Introduce `offlineChatEngine.js` to match user intents and return authoritative guidance with official citations.
  - Ensure consecutive questions never hang on "Thinking..." by wrapping execution in a guaranteed top-level `finally`.

### 3.5 Emergency Mode & Status Synchronization (`EmergencyResponse.jsx`)
- **Current State:**
  - Supports triggering SOS, declaring "I am Safe" or "I Need Help", and saving emergency contacts.
  - Relied on synchronous `localStorage` (`skyra_emergency_queue`).
- **Offline Sync Strategy (Phase 6):**
  - Upgrade queue persistence to IndexedDB (`STORES.EMERGENCY_QUEUE`).
  - Track structured states: `PENDING` $\rightarrow$ `SYNCED` or `FAILED` with retry counts and error logs.
  - Idempotent synchronization on network restoration, app startup, or manual "Sync Now" button click.
  - Truthful UI guarantee: Never indicate that an emergency report or SOS was delivered when it is only queued locally.

---

## 4. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Storage Eviction** | Browser deletes offline cache under storage pressure. | Request `navigator.storage.persist()`; monitor quotas via `storage.estimate()`. |
| **Tile Server Overload** | Mass downloading violates OSM fair use. | Bound radius to 25–30 km, zoom 10–13; enforce 40ms throttling delay. |
| **Model Parity Drift** | Client-side predictions diverge from server. | Run automated 50-scenario mathematical parity verification (`test_offline_ml_parity.py`). |
| **Stale Weather Decisions** | User acts on outdated storm forecasts. | Display prominent freshness badges (`FRESH`, `CACHED`, `EXPIRED`) with exact timestamp age. |

---

## 5. Phase 1 Implementation Plan

1. **PWA Manifest (`manifest.webmanifest`):**
   - Configure standalone display, theme color, icons, and disaster resilience app metadata.
2. **Workbox-Compatible Service Worker (`sw.js`):**
   - Precache app shell: `/`, `/index.html`, `/favicon.svg`, `/icons.svg`, `/manifest.webmanifest`.
   - Stale-While-Revalidate for bundled scripts, styles, SVGs, and fonts.
   - Network-First with cached `/index.html` fallback for navigation requests (`request.mode === 'navigate'`).
   - Clean obsolete caches on `activate` event.
   - Ignore non-GET requests (bypassing mutation calls).
3. **HTML & Component Integration:**
   - Register `/sw.js` in `index.html`.
   - Mount non-intrusive `OfflineStatusIndicator.jsx` in `App.jsx`.
4. **Verification:**
   - Execute production build (`npm run build`).
   - Run backend test suite.
   - Verify offline reopening behavior.
