/**
 * SKYRA – Unified Intelligence Aggregator Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates live weather ingestion, ML risk inference, and data assembly
 * into the canonical SkyraIntelligenceResult.
 *
 * Provides a single unified API for all current and future frontends/clients.
 */

const { fetchWeather } = require("./weatherService");
const { calculateRisk } = require("./riskEngine");
const { createSkyraIntelligenceResult, getRiskLevelFromScore } = require("../utils/dataContract");

async function getIntelligenceForLocation({
  latitude = 20.2961,
  longitude = 85.8245,
  locationName = "Current Location",
  region = "",
  source = "gps",
  customInputs = null,
} = {}) {
  let weatherData;
  let cur = {};
  let hourly = [];

  if (customInputs && typeof customInputs === "object") {
    // Custom inputs provided (e.g. simulation or test override)
    cur = {
      temperature_2m: customInputs.temperature ?? 28,
      relative_humidity_2m: customInputs.humidity ?? 65,
      wind_speed_10m: customInputs.windSpeed ?? 14,
      rain: customInputs.rainfall ?? 0,
      surface_pressure: customInputs.pressure ?? 1013,
    };
  } else {
    // Ingest live weather from Open-Meteo
    weatherData = await fetchWeather(latitude, longitude);
    cur = weatherData?.current ?? {};
    if (weatherData?.hourly?.time) {
      hourly = weatherData.hourly.time.slice(0, 12).map((time, idx) => ({
        time,
        temperature: weatherData.hourly.temperature_2m?.[idx] ?? 0,
        rainProbability: weatherData.hourly.precipitation_probability?.[idx] ?? 0,
        precipitation: weatherData.hourly.precipitation?.[idx] ?? 0,
        windSpeed: weatherData.hourly.wind_speed_10m?.[idx] ?? 0,
      }));
    }
  }

  const rainfall = Number(cur.rain ?? 0);
  const forecastRainfall = Number(hourly[1]?.precipitation ?? 0);
  const humidity = Number(cur.relative_humidity_2m ?? 65);
  const windSpeed = Number(cur.wind_speed_10m ?? 14);
  const temperature = Number(cur.temperature_2m ?? 28);
  const pressure = Number(cur.surface_pressure ?? 1013);

  // Risk Inputs passed to ML model
  const riskInputs = {
    rainfall,
    forecastRainfall,
    humidity,
    windSpeed,
    terrainSlope: 15, // Baseline default, will be connected to DEM in later phases
    historicalRisk: 60, // Baseline index
    temperature,
    pressure,
    location: locationName,
  };

  // Inference from ML model / fallback
  const riskData = await calculateRisk(riskInputs);

  const riskScore = Number(riskData.riskScore ?? 0);
  const riskLevel = riskData.riskLevel || getRiskLevelFromScore(riskScore);
  const confidence = Number(riskData.confidence ?? 85);

  // Formulate hazard classification from risk
  let hazardName = "No Significant Hazard";
  let impactLevel = "Advisory";

  if (rainfall >= 40 || riskLevel === "Severe") {
    hazardName = "Urban Flooding Risk";
    impactLevel = "Severe";
  } else if (windSpeed >= 50) {
    hazardName = "High Wind / Storm Risk";
    impactLevel = "Warning";
  } else if (rainfall >= 15 || riskLevel === "High") {
    hazardName = "Heavy Rain / Waterlogging";
    impactLevel = "Warning";
  } else if (riskLevel === "Moderate") {
    hazardName = "Elevated Weather Conditions";
    impactLevel = "Watch";
  }

  return createSkyraIntelligenceResult({
    location: {
      latitude: Number(latitude),
      longitude: Number(longitude),
      city: locationName,
      region,
      displayName: region ? `${locationName}, ${region}` : locationName,
      source,
    },
    currentWeather: {
      temperature,
      humidity,
      windSpeed,
      rainfall,
      surfacePressure: pressure,
      condition: hazardName !== "No Significant Hazard" ? hazardName : "Normal",
      lastUpdated: new Date().toISOString(),
    },
    forecast: {
      hourly,
      precipitationExpected: forecastRainfall,
      maxRainProbability: Math.max(...hourly.map((h) => h.rainProbability), 0),
    },
    hazard: hazardName,
    impactLevel,
    riskScore,
    riskLevel,
    confidence,
    factors: riskData.factors || [],
    explanation: riskData.explanation || `Classified as ${riskLevel} risk with score of ${riskScore}%.`,
    sourceInformation: {
      weatherSource: "Open-Meteo Ingestion",
      mlModel: "RandomForest ML Service (Port 8000)",
      riskEngine: "SKYRA Core Engine",
      historicalSource: "ERA5 / Historical Records",
    },
  });
}

module.exports = {
  getIntelligenceForLocation,
};
