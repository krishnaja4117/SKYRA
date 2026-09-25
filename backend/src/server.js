const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const env = require("./config/env");

const { getHealth } = require("./controllers/healthController");
const { postRisk } = require("./controllers/riskController");
const { getAlerts } = require("./controllers/alertController");
const {
  postIntelligence,
  getIntelligence,
} = require("./controllers/intelligenceController");

const {
  initializeAlerts,
  startMonitoring,
} = require("./services/monitorService");

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
   RISK API (Backward-Compatible)
================================ */
app.post("/api/risk", postRisk);

/* ================================
   ALERT API
================================ */
app.get("/api/alerts", getAlerts);

/* ================================
   UNIFIED INTELLIGENCE API
================================ */
app.post("/api/intelligence", postIntelligence);
app.get("/api/intelligence", getIntelligence);

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

startServer();