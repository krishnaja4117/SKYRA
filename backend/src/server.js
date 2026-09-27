const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const env = require("./config/env");

const { apiLimiter } = require("./middleware/rateLimiters");
const apiRouter = require("./routes");
const {
  initializeAlerts,
  startMonitoring,
} = require("./services/monitorService");

const app = express();

// Environment-controlled CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : [env.frontendOrigin, "http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.nodeEnv !== "production" || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: Origin not allowed"), false);
    },
    credentials: true,
  })
);

app.use(express.json());

// API Rate Limiting for security & cost control
app.use("/api", apiLimiter);

/* =========================================================================
   CONSOLIDATED MODULAR API ROUTER (Phase 15 Architecture)
   Mounts all 11 domain route groups under /api with preserved URL paths
========================================================================= */
app.use("/api", apiRouter);

/* =========================================================================
   STRUCTURED JSON 404 HANDLER FOR UNMATCHED /api ROUTES
========================================================================= */
app.use("/api", (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    status: 404,
    path: req.originalUrl,
  });
});

/* =========================================================================
   GLOBAL ERROR HANDLER
========================================================================= */
app.use((err, _req, res, _next) => {
  console.error("SKYRA API Error:", err.message);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
    status,
  });
});

/* =========================================================================
   START SERVER
========================================================================= */
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
  return app.listen(env.port, "0.0.0.0", () => {
    console.log(`🚀 SKYRA backend running on port ${env.port}`);
    startMonitoring();
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;