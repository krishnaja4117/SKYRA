const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const env = require("./config/env");

const { getHealth } = require("./controllers/healthController");
const { postRisk } = require("./controllers/riskController");
const {
  getAlerts,
  getActiveAlertsOnly,
  postMonitoredLocation,
  postAcknowledgeAlert,
  postResolveAlert,
} = require("./controllers/alertController");
const { getWeather, getHistoricalWeather, getTerrain } = require("./controllers/weatherController");
const {
  postIntelligence,
  getIntelligence,
} = require("./controllers/intelligenceController");

const {
  initializeAlerts,
  startMonitoring,
} = require("./services/monitorService");

const {
  postRagAsk,
  postRagEvidence,
} = require("./controllers/ragController");

const { postChat } = require("./controllers/chatController");
const {
  postTranscribe,
  postTranslate,
  postSynthesize,
  getLanguages,
  getVoiceStatus,
} = require("./controllers/voiceController");
const { getGeospatialContext } = require("./controllers/geospatialController");

const app = express();

app.use(
  cors({
    origin: "*", // Allow frontend development on any local port
  })
);
app.use(express.json());

/* ================================
   HEALTH CHECK
================================ */
app.get("/api/health", getHealth);

/* ================================
   HISTORICAL, LIVE & TERRAIN INGESTION (Phase 3)
================================ */
app.get("/api/weather/historical", getHistoricalWeather);
app.get("/api/weather", getWeather);
app.get("/api/terrain", getTerrain);

/* ================================
   RISK API (Backward-Compatible)
================================ */
app.post("/api/risk", postRisk);

/* ================================
   ALERT & MONITORING API (Phase 12)
================================ */
app.get("/api/alerts", getAlerts);
app.get("/api/alerts/active", getActiveAlertsOnly);
app.post("/api/alerts/monitor", postMonitoredLocation);
app.post("/api/monitor", postMonitoredLocation);
app.post("/api/alerts/:id/acknowledge", postAcknowledgeAlert);
app.post("/api/alerts/:id/resolve", postResolveAlert);

/* ================================
   UNIFIED INTELLIGENCE API
================================ */
app.post("/api/intelligence", postIntelligence);
app.get("/api/intelligence", getIntelligence);

/* ================================
   RAG & DISASTER INTELLIGENCE API (Phase 8)
================================ */
app.post("/api/rag/ask", postRagAsk);
app.post("/api/rag/evidence", postRagEvidence);

/* ================================
   CONVERSATIONAL SKYRA API (Phase 9)
================================ */
app.post("/api/chat", postChat);

/* ================================
   MULTILINGUAL VOICE & BHASHINI API (Phase 10)
================================ */
app.post("/api/voice/transcribe", postTranscribe);
app.post("/api/voice/translate", postTranslate);
app.post("/api/voice/synthesize", postSynthesize);
app.get("/api/voice/languages", getLanguages);
app.get("/api/voice/status", getVoiceStatus);

/* ================================
   GEOSPATIAL & RISK MAP CONTEXT API (Phase 11)
================================ */
app.get("/api/geospatial/context", getGeospatialContext);

/* ================================
   ERROR HANDLER
================================ */
app.use((err, _req, res, _next) => {
  console.error("SKYRA API Error:", err.message);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
    status,
  });
});

/* ================================
   START SERVER
================================ */
async function startServer() {
  // Connect to MongoDB if URI is configured (non-fatal if unavailable)
  if (env.mongodbUri) {
    try {
      await mongoose.connect(env.mongodbUri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log("✅ MongoDB connected successfully");
      await initializeAlerts();
    } catch (error) {
      console.warn("⚠️ MongoDB connection failed:", error.message);
      console.log("ℹ️ SKYRA backend continuing in in-memory alert mode");
    }
  } else {
    console.log("ℹ️ No MONGODB_URI provided. Running in in-memory alert mode.");
  }

  // Start HTTP Listener regardless of MongoDB state
  app.listen(env.port, () => {
    console.log(`🚀 SKYRA backend running on port ${env.port}`);
    startMonitoring();
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;