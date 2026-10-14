/**
 * SKYRA – Unified Intelligence Aggregator Service (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates centralized live weather ingestion from weatherService,
 * ML risk inference, and data assembly into the canonical SkyraIntelligenceResult.
 *
 * Guarantees:
 *   • Real weather and forecast ingestion via weatherService
 *   • Strict coordinate validation (no silent fallback to Bhubaneswar)
 *   • Complete sourceMetadata preservation
 *   • Unified API contract for all current and future clients
 */

const { fetchWeather, validateCoordinates } = require("./weatherService");
const { fetchTerrainData } = require("./ingestion/terrainService");
const { fetchHistoricalRisk } = require("./analytics/historicalRiskService");
const { fetchIMDAdvisories } = require("./ingestion/imdService");
const { fetchSatelliteData } = require("./ingestion/satelliteService");
const { fetchRadarData } = require("./ingestion/radarService");
const { calculateRisk } = require("./riskEngine");
const { extractFeatures } = require("./features/featureExtractor");
const { persistRiskResult } = require("./riskPersistenceService");
const { createSkyraIntelligenceResult, getRiskLevelFromScore } = require("../utils/dataContract");
const { assessImpact } = require("./impactAssessmentService");

async function getIntelligenceForLocation({
  latitude,
  longitude,
  locationName = "Active Location",
  region = "",
  source = "request",
  customInputs = null,
} = {}) {
  // Validate coordinates strictly - no silent fallback
  const coords = validateCoordinates(latitude, longitude);

  let weatherData = null;
  let cur = {};
  let hourly = [];
  let forecastData = null;
  let sourceMetadata = null;

  if (customInputs && typeof customInputs === "object") {
    // Custom inputs provided (e.g. simulation or test override)
    cur = {
      temperature: customInputs.temperature ?? 28,
      humidity: customInputs.humidity ?? 65,
      windSpeed: customInputs.windSpeed ?? 14,
      windDirection: customInputs.windDirection ?? 0,
      rainfall: customInputs.rainfall ?? 0,
      pressure: customInputs.pressure ?? 1013,
      condition: customInputs.condition || "Monitoring",
    };
    if (customInputs.forecastRainfall != null) {
      forecastData = {
        precipitationExpected: Number(customInputs.forecastRainfall),
        hourly: [],
      };
    }
    sourceMetadata = {
      provider: "Custom / Simulation",
      model: "Manual Input",
      sourceStatus: "custom",
      dataFreshness: "simulated",
      timestamp: new Date().toISOString(),
    };
  } else {
    // Ingest live weather from centralized backend weatherService (via pipelineRunner)
    weatherData = await fetchWeather(coords.latitude, coords.longitude, locationName);
    cur = weatherData.current || {};
    forecastData = weatherData.forecast || {};
    hourly = Array.isArray(forecastData.hourly) ? forecastData.hourly : [];
    sourceMetadata = weatherData.sourceMetadata || {
      provider: "Open-Meteo",
      model: "Best-Match NWP",
      sourceStatus: "ok",
      dataFreshness: "live",
      timestamp: new Date().toISOString(),
    };
  }

  // Ingest real topographic terrain slope from Open-Meteo DEM (no hardcoded 15)
  let terrainSlope = customInputs?.terrainSlope;
  let terrainData = null;

  if (terrainSlope == null) {
    try {
      terrainData = await fetchTerrainData(coords.latitude, coords.longitude);
      terrainSlope = terrainData.slope;
    } catch (err) {
      console.warn(`[intelligenceService] Terrain ingestion warning for (${coords.latitude}, ${coords.longitude}): ${err.message}`);
      terrainSlope = 0; // Natural flat ground baseline (0 degrees), never fabricate hardcoded 15
    }
  }

  // Ingest genuine historical risk index from ERA5 historical reanalysis data (no hardcoded 60)
  let historicalRisk = customInputs?.historicalRisk;
  let historicalRiskData = null;

  if (historicalRisk == null) {
    try {
      historicalRiskData = await fetchHistoricalRisk(coords.latitude, coords.longitude);
      historicalRisk = historicalRiskData.historicalRisk;
    } catch (err) {
      console.warn(`[intelligenceService] Historical risk derivation warning for (${coords.latitude}, ${coords.longitude}): ${err.message}`);
      historicalRisk = 20; // Natural baseline climate risk index, never fabricate hardcoded 60
    }
  }

  // Phase 2 Ingestion: Authoritative IMD bulletins, Satellite remote sensing, and Doppler Weather Radar
  let imdData = null;
  let satelliteData = null;
  let radarData = null;

  try {
    imdData = await fetchIMDAdvisories(coords.latitude, coords.longitude);
  } catch (err) {
    console.warn(`[intelligenceService] IMD advisory ingestion warning for (${coords.latitude}, ${coords.longitude}): ${err.message}`);
    imdData = { available: false, reason: "FETCH_ERROR", diagnosticMessage: err.message };
  }

  try {
    satelliteData = await fetchSatelliteData(coords.latitude, coords.longitude, { locationName });
  } catch (err) {
    console.warn(`[intelligenceService] Satellite ingestion warning for (${coords.latitude}, ${coords.longitude}): ${err.message}`);
    satelliteData = { available: false, reason: "FETCH_ERROR", diagnosticMessage: err.message };
  }

  try {
    radarData = await fetchRadarData(coords.latitude, coords.longitude);
  } catch (err) {
    console.warn(`[intelligenceService] Radar ingestion warning for (${coords.latitude}, ${coords.longitude}): ${err.message}`);
    radarData = { available: false, reason: "FETCH_ERROR", diagnosticMessage: err.message };
  }

  // Feature extraction through centralized pure featureExtractor
  // Strict 8-feature order: [rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]
  const rawFeatureInput = {
    rainfall: cur.rainfall ?? cur.rain ?? cur.precipitation ?? 0,
    forecastRainfall: customInputs?.forecastRainfall != null
      ? Number(customInputs.forecastRainfall)
      : (forecastData?.precipitationExpected ?? hourly[0]?.precipitation ?? hourly[1]?.precipitation ?? 0),
    humidity: cur.humidity ?? cur.relative_humidity_2m ?? 65,
    windSpeed: cur.windSpeed ?? cur.wind_speed_10m ?? 14,
    historicalRisk,
    terrainSlope,
    temperature: cur.temperature ?? cur.temperature_2m ?? 28,
    pressure: cur.pressure ?? cur.surface_pressure ?? 1013,
  };

  const extracted = extractFeatures(rawFeatureInput);
  const { featureObject, featureVector } = extracted;

  const temperature = featureObject.temperature;
  const feelsLike = cur.feelsLike != null ? Number(cur.feelsLike) : null;
  const humidity = featureObject.humidity;
  const windSpeed = featureObject.windSpeed;
  const windDirection = Number(cur.windDirection ?? cur.wind_direction_10m ?? 0);
  const rainfall = featureObject.rainfall;
  const pressure = featureObject.pressure;
  const condition = cur.condition || "Clear sky";
  const forecastRainfall = featureObject.forecastRainfall;

  // Risk Inputs passed to ML model / heuristic risk engine
  const riskInputs = {
    ...featureObject,
    featureVector,
    location: locationName,
    satelliteRainfallRate: satelliteData?.products?.rainfallRateEstimateMmH ?? 0,
    satelliteCloudTopTemp: satelliteData?.products?.cloudTopTemperatureK ?? null,
    satelliteCloudCover: satelliteData?.products?.cloudCoverPercent ?? null,
  };

  // Inference from ML model / fallback
  const riskData = await calculateRisk(riskInputs);

  const riskScore = Number(riskData.riskScore ?? 0);
  const riskLevel = riskData.riskLevel || getRiskLevelFromScore(riskScore);
  const confidence = Number(riskData.confidence ?? 85);

  // Phase 6: Run authoritative backend impact assessment
  // Uses real featureObject, riskData, terrainData, historicalRiskData, and location.
  // When customInputs provides slope/historicalRisk, build synthetic data objects so
  // the impact service receives real values rather than seeing null (which adds limitation).
  const terrainDataForImpact = terrainData
    || (customInputs?.terrainSlope != null
      ? { slope: customInputs.terrainSlope, source: "Custom / Simulation Input" }
      : null);

  const historicalRiskDataForImpact = historicalRiskData
    || (customInputs?.historicalRisk != null
      ? { historicalRisk: customInputs.historicalRisk, source: "Custom / Simulation Input", timeWindow: null }
      : null);

  const impactResult = assessImpact({
    featureObject,
    riskData,
    terrainData: terrainDataForImpact,
    historicalRiskData: historicalRiskDataForImpact,
    location: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      city: locationName,
      region,
      displayName: region ? `${locationName}, ${region}` : locationName,
    },
    forecastData: forecastData || null,
    satelliteData: satelliteData?.available ? satelliteData : null,
  });

  // Derive hazard and impact level from impact assessment result
  const hazardName = impactResult.hazard;
  let impactLevel = "Advisory";
  if (impactResult.severity?.label === "Critical" || impactResult.severity?.label === "Severe") {
    impactLevel = "Severe";
  } else if (impactResult.severity?.label === "Significant") {
    impactLevel = "Warning";
  } else if (impactResult.severity?.label === "Moderate") {
    impactLevel = "Watch";
  }

  // Non-fatal background risk persistence (Phase 4 traceability)
  persistRiskResult({
    location: {
      displayName: region ? `${locationName}, ${region}` : locationName,
      city: locationName,
      region,
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
    riskLevel,
    riskScore,
    confidence,
    hazard: hazardName,
    model: riskData.model || "Calibrated RandomForestClassifier (Port 8000)",
    modelVersion: riskData.modelVersion || "2.0.0",
    datasetVersion: riskData.datasetVersion || "ERA5-MultiCity-2021-2023",
    confidenceType: riskData.confidenceType || "CALIBRATED",
    calibrationMethod: riskData.calibrationMethod || "Platt Sigmoid (5-fold Cross-Validation)",
    isFallback: Boolean(riskData.isFallback),
    inputs: featureObject,
    featureVector,
    factors: riskData.factors || [],
    explanation: riskData.explanation || `Classified as ${riskLevel} risk with score of ${riskScore}%.`,
    sourceInformation: {
      weatherSource: `${sourceMetadata.provider} (${sourceMetadata.model || "NWP Ingestion"})`,
    },
  }).catch((err) => {
    console.warn(`[intelligenceService] Background risk persistence warning: ${err.message}`);
  });

  return createSkyraIntelligenceResult({
    location: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      city: locationName,
      region,
      displayName: region ? `${locationName}, ${region}` : locationName,
      source,
    },
    currentWeather: {
      temperature,
      feelsLike,
      humidity,
      windSpeed,
      windDirection,
      rainfall,
      surfacePressure: pressure,
      condition: condition !== "Clear sky" ? condition : (hazardName !== "No Significant Hazard" ? hazardName : "Clear sky"),
      lastUpdated: cur.observedAt || new Date().toISOString(),
    },
    forecast: {
      hourly: forecastData?.hourly || hourly,
      daily: forecastData?.daily || [],
      precipitationExpected: forecastRainfall,
      maxRainProbability: forecastData?.maxRainProbability ?? (hourly.length > 0 ? Math.max(...hourly.map((h) => h.rainProbability || 0), 0) : 0),
    },
    hazard: hazardName,
    impactLevel,
    riskScore,
    riskLevel,
    confidence,
    confidenceType: riskData.confidenceType || "CALIBRATED",
    calibrationMethod: riskData.calibrationMethod || "Platt Sigmoid (5-fold Cross-Validation)",
    factors: riskData.factors || [],
    explanation: riskData.explanation || `Classified as ${riskLevel} risk with score of ${riskScore}%.`,
    xai: riskData.xai,
    // Phase 6: Full impact assessment result embedded in intelligence response
    impactAssessment: impactResult,
    observationalData: {
      imd: imdData,
      satellite: satelliteData,
      radar: radarData,
    },
    sourceInformation: {
      weatherSource: `${sourceMetadata.provider} (${sourceMetadata.model || "NWP Ingestion"})`,
      mlModel: "Calibrated RandomForestClassifier (Port 8000)",
      riskEngine: "SKYRA Core Engine",
      historicalSource: "ERA5 / Historical Records",
      impactEngine: "SKYRA Impact Assessment Service (Phase 6)",
      imdSource: imdData?.provenance?.provider || "India Meteorological Department (IMD)",
      satelliteSource: satelliteData?.provenance?.provider || "ISRO / MOSDAC INSAT-3D",
      radarSource: radarData?.provenance?.provider || "IMD Doppler Weather Radar Network",
    },
    sourceMetadata,
    isFallback: Boolean(riskData?.isFallback),
  });
}

module.exports = {
  getIntelligenceForLocation,
};
