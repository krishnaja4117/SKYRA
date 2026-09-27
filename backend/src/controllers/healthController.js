const mongoose = require("mongoose");
const env = require("../config/env");
const { hasAwsCredentials } = require("../services/storage/s3Service");
const { getVectorStore } = require("../knowledge/vectorStore");
const { getMonitoredLocation, getActiveAlert } = require("../services/monitorService");
const { EMERGENCY_STATES } = require("../services/emergencyService");

async function getHealth(req, res) {
  const isDeep = req.query.deep === "true" || req.query.deep === "1";

  const mongoStatusMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const dbState = mongoose.connection.readyState;
  const mongoStatus = mongoStatusMap[dbState] || "unknown";

  // Vector store status
  let vectorStoreStatus = { status: "unknown", activeBackend: "FAISS" };
  try {
    const vs = getVectorStore();
    vectorStoreStatus = vs.getStatus();
  } catch (_) {
    vectorStoreStatus = { status: "fallback_memory", activeBackend: "FAISS" };
  }

  // Cloud storage status
  const cloudStorageStatus = hasAwsCredentials() ? "configured" : "offline_mock";

  // Alert monitoring status
  const monitoredLoc = getMonitoredLocation();
  const activeAlert = getActiveAlert();
  const alertEngineStatus = {
    monitoringActive: true,
    monitoredLocation: monitoredLoc ? monitoredLoc.name : "None",
    activeAlertPriority: activeAlert ? activeAlert.priority : "NONE",
  };

  // Emergency subsystem readiness
  const emergencySystemStatus = {
    ready: true,
    supportedStates: Object.keys(EMERGENCY_STATES),
  };

  // Optional deep probe for ML microservice
  let mlServiceStatus = "unverified";
  if (isDeep) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const mlHealthUrl = `${env.mlServiceUrl}/health`;
      const mlRes = await fetch(mlHealthUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      mlServiceStatus = mlRes.ok ? "online" : `degraded_${mlRes.status}`;
    } catch (_) {
      mlServiceStatus = "offline_heuristic_active";
    }
  }

  res.json({
    status: "ok",
    service: "skyra-backend",
    version: "2.0.0",
    architecturePhase: "Phase 15 - Consolidated Backend Architecture",
    problemStatement: "SIH-2026-PS-26068",
    environment: env.nodeEnv,
    port: env.port,
    subsystems: {
      database: {
        status: mongoStatus,
        connected: dbState === 1,
        mode: dbState === 1 ? "MONGODB_CLUSTER" : "IN_MEMORY_FALLBACK",
      },
      mlMicroservice: {
        url: env.mlServiceUrl,
        probe: mlServiceStatus,
        heuristicFallbackReady: true,
      },
      vectorKnowledgeStore: {
        activeBackend: vectorStoreStatus.activeBackend,
        pineconeStatus: vectorStoreStatus.pinecone?.status || "DISABLED",
        faissStatus: vectorStoreStatus.faiss ? "ACTIVE" : "READY",
      },
      cloudStorage: {
        provider: "AWS S3 / Local Buffer",
        status: cloudStorageStatus,
      },
      alertEngine: alertEngineStatus,
      emergencySystem: emergencySystemStatus,
    },
    // Backward compatibility fields expected by legacy tests
    database: {
      status: mongoStatus,
      connected: dbState === 1,
    },
    services: {
      mlServiceUrl: env.mlServiceUrl,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Machine-readable API Service Catalog (Phase 15 Architecture)
 */
function getApiCatalog(_req, res) {
  res.json({
    platform: "SKYRA Hyperlocal Disaster Intelligence",
    version: "2.0.0",
    dataContractVersion: "2.0",
    problemStatement: "Smart India Hackathon 2026 | PS 26068",
    architecture: "Consolidated Modular Service Architecture (Phase 15)",
    domains: [
      {
        domain: "Health & Metadata",
        endpoints: [
          { path: "/api/health", method: "GET", description: "Subsystem readiness & health probe (supports ?deep=true)" },
          { path: "/api/meta", method: "GET", description: "API Service Catalog and schema discovery" },
        ],
      },
      {
        domain: "Weather Ingestion",
        endpoints: [
          { path: "/api/weather", method: "GET", description: "Current live weather from Open-Meteo" },
          { path: "/api/weather/historical", method: "GET", description: "Antecedent ERA5 historical weather reanalysis" },
          { path: "/api/weather/imd", method: "GET", description: "Official IMD weather warnings and advisories" },
          { path: "/api/terrain", method: "GET", description: "DEM elevation grid and finite-difference slope" },
        ],
      },
      {
        domain: "Unified Intelligence",
        endpoints: [
          { path: "/api/intelligence", method: "GET", rateLimited: "expensive", description: "Unified canonical intelligence payload by query coordinates" },
          { path: "/api/intelligence", method: "POST", rateLimited: "expensive", description: "Unified canonical intelligence payload with optional simulation inputs" },
        ],
      },
      {
        domain: "Legacy Risk",
        endpoints: [
          { path: "/api/risk", method: "POST", description: "Point-level risk score prediction (backward compatible)" },
        ],
      },
      {
        domain: "Smart Alerts",
        endpoints: [
          { path: "/api/alerts", method: "GET", description: "List all active alerts and historical feed" },
          { path: "/api/alerts/active", method: "GET", description: "Filter for currently active priority alerts" },
          { path: "/api/alerts/monitor", method: "POST", description: "Register coordinate for continuous monitoring cycle" },
          { path: "/api/alerts/:id/acknowledge", method: "POST", description: "Acknowledge active alert" },
          { path: "/api/alerts/:id/resolve", method: "POST", description: "Mark active alert resolved" },
          { path: "/api/alerts/cap", method: "GET", description: "Export alert feed in OASIS CAP v1.2 XML format" },
        ],
      },
      {
        domain: "Emergency Mode",
        endpoints: [
          { path: "/api/emergency/activate", method: "POST", description: "Activate emergency state and trigger response" },
          { path: "/api/emergency/sos", method: "POST", description: "Dispatch SOS alert to contacts and emergency system" },
          { path: "/api/emergency/status", method: "POST", description: "Check in with SAFE or HELP_NEEDED safety status" },
          { path: "/api/emergency/status/:eventId", method: "GET", description: "Query current emergency state and audit history" },
          { path: "/api/emergency/deactivate", method: "POST", description: "Deactivate emergency and return to normal mode" },
        ],
      },
      {
        domain: "Facilities Proxy",
        endpoints: [
          { path: "/api/facilities/nearby", method: "GET", description: "Nearby hospitals and shelters via Overpass proxy" },
        ],
      },
      {
        domain: "RAG & Knowledge",
        endpoints: [
          { path: "/api/rag/ask", method: "POST", rateLimited: "expensive", description: "Official disaster guideline Q&A with traceable citations" },
          { path: "/api/rag/evidence", method: "POST", rateLimited: "expensive", description: "Evidence pack retrieval from vector store" },
        ],
      },
      {
        domain: "Conversational Chat",
        endpoints: [
          { path: "/api/chat", method: "POST", rateLimited: "expensive", description: "Natural language weather & disaster guidance" },
        ],
      },
      {
        domain: "Multilingual Voice",
        endpoints: [
          { path: "/api/voice/transcribe", method: "POST", rateLimited: "expensive", description: "Speech-to-text via Bhashini" },
          { path: "/api/voice/translate", method: "POST", rateLimited: "expensive", description: "Cross-lingual translation between 6 languages" },
          { path: "/api/voice/synthesize", method: "POST", rateLimited: "expensive", description: "Text-to-speech voice generation" },
          { path: "/api/voice/languages", method: "GET", description: "Supported official Indian languages" },
          { path: "/api/voice/status", method: "GET", description: "Bhashini gateway connectivity status" },
        ],
      },
      {
        domain: "Geospatial & Map Context",
        endpoints: [
          { path: "/api/geospatial/context", method: "GET", description: "Aggregated terrain slope, radar stations, and nearby facilities" },
        ],
      },
    ],
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealth,
  getApiCatalog,
};
