const mongoose = require("mongoose");
const env = require("../config/env");

function getHealth(_req, res) {
  const mongoStatusMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const dbState = mongoose.connection.readyState;
  const mongoStatus = mongoStatusMap[dbState] || "unknown";

  res.json({
    status: "ok",
    service: "skyra-backend",
    version: "1.0.0",
    environment: env.nodeEnv,
    port: env.port,
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

module.exports = {
  getHealth,
};
