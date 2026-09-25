const { calculateRisk } = require("./riskEngine");
const Alert = require("../models/Alert");

const MONITOR_INTERVAL = 60 * 1000;

let monitorTimer = null;
let lastRiskScore = null;
let lastRiskLevel = null;

let alertHistory = [];
let activeAlert = null;


/* ================================
   RISK LEVEL
================================ */

function getRiskLevel(score) {
  if (score >= 70) return "High";
  if (score >= 40) return "Moderate";
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
  };

  return ranks[level] || 0;
}


/* ================================
   ADVISORY
================================ */

function getAdvisory(inputs, riskLevel) {
  if (inputs.rainfall >= 30) {
    return "Heavy rainfall detected. Avoid flooded roads and move to safer elevated areas if water levels rise.";
  }

  if (inputs.windSpeed >= 40) {
    return "Strong winds detected. Stay indoors, secure loose objects, and avoid unnecessary travel.";
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

    console.log(
      `📂 Loaded ${alertHistory.length} alerts from MongoDB`
    );

    if (activeAlert) {
      console.log(
        `🚨 Active alert restored: ${activeAlert.id}`
      );
    } else {
      console.log("ℹ️ No active SKYRA alerts found");
    }
  } catch (error) {
    console.error(
      "❌ Failed to load alerts from MongoDB:",
      error.message
    );

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
    location: inputs.location || "Current location",
    riskLevel,
    riskScore,
    confidence: Number(riskData.confidence || 0),

    hazard:
      riskLevel === "High"
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


  /* SAVE TO MONGODB */

  try {
    await Alert.create(alert);

    console.log("💾 SKYRA alert saved to MongoDB");
  } catch (error) {
    console.error(
      "❌ Failed to save alert to MongoDB:",
      error.message
    );
  }


  /* CONSOLE ALERT */

  console.log("");
  console.log("🚨 ===============================");
  console.log("🚨 SKYRA RISK ALERT");
  console.log("🚨 ===============================");
  console.log(`🚨 Alert ID: ${alert.id}`);
  console.log(`🚨 Location: ${alert.location}`);
  console.log(`🚨 Risk Level: ${alert.riskLevel}`);
  console.log(`🚨 Risk Score: ${alert.riskScore}%`);
  console.log(`🚨 Confidence: ${alert.confidence}%`);
  console.log(`🚨 Hazard: ${alert.hazard}`);
  console.log(`🚨 Reason: ${alert.reason}`);
  console.log(`🚨 Action: ${alert.recommendedAction}`);
  console.log(`🚨 Time: ${new Date().toLocaleString()}`);
  console.log("🚨 ===============================");
  console.log("");

  return alert;
}


/* ================================
   WEATHER API
================================ */

async function fetchWeather() {
  const latitude = 20.2961;
  const longitude = 85.8245;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,rain,surface_pressure` +
    `&hourly=precipitation_probability,precipitation,rain` +
    `&forecast_days=1` +
    `&timezone=auto`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Weather API request failed");
  }

  return response.json();
}


/* ================================
   MONITORING CYCLE
================================ */

async function runMonitoringCycle() {
  try {
    console.log("🔄 SKYRA monitoring cycle started");

    const weatherData = await fetchWeather();

    const current = weatherData.current;

    const inputs = {
      rainfall: Number(
        current.rain ?? 0
      ),

      forecastRainfall: Number(
        weatherData.hourly?.precipitation?.[1] ?? 0
      ),

      humidity: Number(
        current.relative_humidity_2m ?? 0
      ),

      windSpeed: Number(
        current.wind_speed_10m ?? 0
      ),

      terrainSlope: 15,

      historicalRisk: 70,

      temperature: Number(
        current.temperature_2m ?? 0
      ),

      pressure: Number(
        current.surface_pressure ?? 1013
      ),

      location: "Bhubaneswar",
    };


    /* CALL ML MODEL */

    const riskData = await calculateRisk(inputs);

    const riskScore = Number(
      riskData.riskScore
    );

    const riskLevel = getRiskLevel(
      riskScore
    );


    console.log(
      `🤖 SKYRA risk: ${riskLevel} (${riskScore}%)`
    );


    /* HIGH RISK ALERT */

    const hasEquivalentActiveHighAlert =
      activeAlert &&
      activeAlert.status === "Active" &&
      activeAlert.riskLevel === "High" &&
      activeAlert.location === inputs.location;

    if (riskLevel === "High" && !hasEquivalentActiveHighAlert) {
      await createAlert(
        {
          ...riskData,
          riskLevel,
          riskScore,
        },

        inputs,

        `High risk detected at ${inputs.location}`
      );
    }


    /* COMPARE WITH PREVIOUS RESULT */

    if (lastRiskScore !== null) {

      const scoreIncrease =
        riskScore - lastRiskScore;

      console.log(
        `📊 Previous: ${lastRiskScore}% ${lastRiskLevel} → Current: ${riskScore}% ${riskLevel}`
      );


      /* RISK LEVEL INCREASE */

      if (
        riskLevel !== "High" &&
        getRiskRank(riskLevel) >
        getRiskRank(lastRiskLevel)
      ) {

        await createAlert(
          {
            ...riskData,
            riskLevel,
            riskScore,
          },

          inputs,

          `Risk level increased from ${lastRiskLevel} to ${riskLevel}`
        );

      }


      /* SCORE INCREASE */

      else if (riskLevel !== "High" && scoreIncrease >= 10) {

        await createAlert(
          {
            ...riskData,
            riskLevel,
            riskScore,
          },

          inputs,

          `Risk score increased by ${scoreIncrease} points`
        );

      }
    }


    /* SAVE CURRENT RISK */

    lastRiskScore = riskScore;

    lastRiskLevel = riskLevel;


    global.skyraLatestRisk = {
      ...riskData,

      riskLevel,

      riskScore,

      inputs,

      savedAt:
        new Date().toISOString(),
    };


    global.skyraActiveAlert =
      activeAlert;

    global.skyraAlertHistory =
      alertHistory;


  } catch (error) {

    console.error(
      "❌ SKYRA monitoring error:",
      error.message
    );

  }
}


/* ================================
   START MONITORING
================================ */

function startMonitoring() {

  if (monitorTimer) {
    return;
  }

  console.log(
    "🚀 SKYRA continuous monitoring started"
  );


  /* RUN IMMEDIATELY */

  runMonitoringCycle();


  /* RUN EVERY 60 SECONDS */

  monitorTimer = setInterval(
    runMonitoringCycle,
    MONITOR_INTERVAL
  );
}


/* ================================
   GET ACTIVE ALERT
================================ */

function getActiveAlert() {
  return activeAlert;
}


/* ================================
   GET ALERT HISTORY
================================ */

function getAlertHistory() {
  return alertHistory;
}


/* ================================
   EXPORTS
================================ */

module.exports = {
  initializeAlerts,
  startMonitoring,
  runMonitoringCycle,
  getActiveAlert,
  getAlertHistory,
};
