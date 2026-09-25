const mongoose = require("mongoose");
const { calculateRisk } = require("./riskEngine");
const { fetchWeather } = require("./weatherService");
const Alert = require("../models/Alert");

const MONITOR_INTERVAL = 60 * 1000;

let monitorTimer = null;
let lastRiskScore = null;
let lastRiskLevel = null;

let alertHistory = [];
let activeAlert = null;

// Configurable monitored coordinates (default to Bhubaneswar baseline)
let monitoredLocation = {
  latitude: 20.2961,
  longitude: 85.8245,
  name: "Bhubaneswar",
};

/* ================================
   RISK LEVEL (Unified Scale)
================================ */

function getRiskLevel(score) {
  const s = Number(score || 0);
  if (s >= 80) return "Severe";
  if (s >= 70) return "High";
  if (s >= 40) return "Moderate";
  return "Low";
}

/* ================================
   RISK RANK
================================ */

function getRiskRank(level) {
  const ranks = {
    Low: 1,
    Moderate: 2,
    High: 3,
    Severe: 4,
  };

  return ranks[level] || 0;
}

/* ================================
   ADVISORY
================================ */

function getAdvisory(inputs, riskLevel) {
  if (inputs.rainfall >= 50 || riskLevel === "Severe") {
    return "Severe weather hazard detected. Avoid all flooded corridors and evacuate to higher ground if instructed.";
  }

  if (inputs.rainfall >= 30) {
    return "Heavy rainfall detected. Avoid flooded roads and move to safer elevated areas if water levels rise.";
  }

  if (inputs.windSpeed >= 50) {
    return "Severe winds detected. Stay indoors, secure loose objects, and avoid unnecessary travel.";
  }

  if (riskLevel === "High") {
    return "High weather risk detected. Follow official emergency instructions and move to a safe location if advised.";
  }

  if (riskLevel === "Moderate") {
    return "Stay alert, monitor changing weather conditions, and avoid unnecessary travel during severe weather.";
  }

  return "Weather conditions are currently low risk. Continue normal monitoring.";
}

/* ================================
   LOAD ALERTS FROM MONGODB
================================ */

async function initializeAlerts() {
  if (mongoose.connection.readyState !== 1) {
    console.log("ℹ️ MongoDB not connected; using in-memory alert store");
    return;
  }

  try {
    const alerts = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    alertHistory = alerts || [];

    activeAlert =
      alertHistory.find(
        (alert) => alert.status === "Active"
      ) || null;

    console.log(`📂 Loaded ${alertHistory.length} alerts from MongoDB`);

    if (activeAlert) {
      console.log(`🚨 Active alert restored: ${activeAlert.id}`);
    } else {
      console.log("ℹ️ No active SKYRA alerts found in DB");
    }
  } catch (error) {
    console.error("❌ Failed to load alerts from MongoDB:", error.message);
    alertHistory = [];
    activeAlert = null;
  }
}

/* ================================
   CREATE ALERT
================================ */

async function createAlert(riskData, inputs, reason) {
  const riskScore = Number(riskData.riskScore || 0);
  const riskLevel = getRiskLevel(riskScore);
  const advisory = getAdvisory(inputs, riskLevel);

  const alert = {
    id: `SKYRA-${Date.now()}`,
    location: inputs.location || monitoredLocation.name,
    riskLevel,
    riskScore,
    confidence: Number(riskData.confidence || 0),
    hazard:
      riskLevel === "Severe"
        ? "Severe Disaster Warning"
        : riskLevel === "High"
        ? "Severe Weather Risk"
        : riskLevel === "Moderate"
        ? "Weather Risk"
        : "Weather Conditions",
    title: `SKYRA ${riskLevel} Risk Alert`,
    message: advisory,
    recommendedAction: advisory,
    reason,
    status: "Active",
    createdAt: new Date(),
  };

  activeAlert = alert;
  alertHistory.unshift(alert);

  if (alertHistory.length > 20) {
    alertHistory = alertHistory.slice(0, 20);
  }

  // Save to MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await Alert.create(alert);
      console.log("💾 SKYRA alert saved to MongoDB");
    } catch (error) {
      console.error("❌ Failed to save alert to MongoDB:", error.message);
    }
  }

  console.log(`🚨 SKYRA ALERT [${alert.riskLevel} - ${alert.riskScore}%] at ${alert.location}: ${alert.reason}`);
  return alert;
}

/* ================================
   MONITORING CYCLE
================================ */

async function runMonitoringCycle() {
  try {
    const weatherData = await fetchWeather(monitoredLocation.latitude, monitoredLocation.longitude);
    const current = weatherData?.current || {};

    const inputs = {
      rainfall: Number(current.rain ?? 0),
      forecastRainfall: Number(weatherData.hourly?.precipitation?.[1] ?? 0),
      humidity: Number(current.relative_humidity_2m ?? 0),
      windSpeed: Number(current.wind_speed_10m ?? 0),
      terrainSlope: 15,
      historicalRisk: 60,
      temperature: Number(current.temperature_2m ?? 0),
      pressure: Number(current.surface_pressure ?? 1013),
      location: monitoredLocation.name,
    };

    const riskData = await calculateRisk(inputs);
    const riskScore = Number(riskData.riskScore);
    const riskLevel = getRiskLevel(riskScore);

    const isHighOrSevere = riskLevel === "High" || riskLevel === "Severe";
    const hasEquivalentActiveAlert =
      activeAlert &&
      activeAlert.status === "Active" &&
      activeAlert.riskLevel === riskLevel &&
      activeAlert.location === inputs.location;

    if (isHighOrSevere && !hasEquivalentActiveAlert) {
      await createAlert(
        { ...riskData, riskLevel, riskScore },
        inputs,
        `${riskLevel} risk detected at ${inputs.location}`
      );
    }

    if (lastRiskScore !== null) {
      const scoreIncrease = riskScore - lastRiskScore;
      if (!isHighOrSevere && getRiskRank(riskLevel) > getRiskRank(lastRiskLevel)) {
        await createAlert(
          { ...riskData, riskLevel, riskScore },
          inputs,
          `Risk level increased from ${lastRiskLevel} to ${riskLevel}`
        );
      } else if (!isHighOrSevere && scoreIncrease >= 15) {
        await createAlert(
          { ...riskData, riskLevel, riskScore },
          inputs,
          `Risk score increased by ${scoreIncrease} points`
        );
      }
    }

    lastRiskScore = riskScore;
    lastRiskLevel = riskLevel;

    global.skyraLatestRisk = {
      ...riskData,
      riskLevel,
      riskScore,
      inputs,
      savedAt: new Date().toISOString(),
    };
    global.skyraActiveAlert = activeAlert;
    global.skyraAlertHistory = alertHistory;
  } catch (error) {
    console.error("❌ SKYRA monitoring error:", error.message);
  }
}

/* ================================
   CONTROLS
================================ */

function startMonitoring() {
  if (monitorTimer) return;
  console.log("🚀 SKYRA continuous monitoring started");
  runMonitoringCycle();
  monitorTimer = setInterval(runMonitoringCycle, MONITOR_INTERVAL);
}

function stopMonitoring() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

function setMonitoredLocation(latitude, longitude, name) {
  monitoredLocation = { latitude, longitude, name };
  runMonitoringCycle();
}

function getActiveAlert() {
  return activeAlert;
}

function getAlertHistory() {
  return alertHistory;
}

module.exports = {
  initializeAlerts,
  startMonitoring,
  stopMonitoring,
  runMonitoringCycle,
  setMonitoredLocation,
  getActiveAlert,
  getAlertHistory,
  getRiskLevel,
};
