/**
 * SKYRA – Unified Intelligence Data Contract
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the complete SKYRA intelligence payload.
 *
 * Flow:
 *   Raw Data (Weather/Geo) -> Ingestion -> ML/Risk -> Impact -> XAI ->
 *   RAG/Advice -> Intelligence Aggregator -> Unified SkyraIntelligenceResult
 *
 * This standard schema supports all current presentation consumers (Dashboard,
 * RiskMap, WeatherGPT, Alerts, Emergency Response) and future Phase modules.
 */

function getRiskLevelFromScore(score) {
  const s = Number(score || 0);
  if (s >= 80) return "Severe";
  if (s >= 70) return "High";
  if (s >= 40) return "Moderate";
  return "Low";
}

/**
 * Factory function creating a canonical SkyraIntelligenceResult.
 * Ensures every field is predictably shaped with safe defaults.
 */
function createSkyraIntelligenceResult(partial = {}) {
  const now = new Date().toISOString();

  const rawLat = partial.location?.latitude ?? partial.latitude;
  const rawLon = partial.location?.longitude ?? partial.longitude;
  const latitude = (rawLat !== null && rawLat !== undefined && !Number.isNaN(Number(rawLat))) ? Number(rawLat) : null;
  const longitude = (rawLon !== null && rawLon !== undefined && !Number.isNaN(Number(rawLon))) ? Number(rawLon) : null;

  const location = {
    latitude,
    longitude,
    city: partial.location?.city ?? null,
    region: partial.location?.region ?? null,
    country: partial.location?.country ?? (latitude !== null ? "India" : null),
    displayName: partial.location?.displayName ?? (partial.location?.city ? `${partial.location.city}, India` : "Monitored Location"),
    source: partial.location?.source ?? (latitude !== null ? "request" : "unspecified"),
  };

  const currentWeather = {
    temperature: Number(partial.currentWeather?.temperature ?? 28),
    humidity: Number(partial.currentWeather?.humidity ?? 65),
    windSpeed: Number(partial.currentWeather?.windSpeed ?? 14),
    rainfall: Number(partial.currentWeather?.rainfall ?? 0),
    surfacePressure: Number(partial.currentWeather?.surfacePressure ?? 1013),
    condition: partial.currentWeather?.condition ?? "Monitoring",
    lastUpdated: partial.currentWeather?.lastUpdated ?? now,
  };

  const forecast = {
    hourly: Array.isArray(partial.forecast?.hourly) ? partial.forecast.hourly : [],
    daily: Array.isArray(partial.forecast?.daily) ? partial.forecast.daily : [],
    precipitationExpected: Number(partial.forecast?.precipitationExpected ?? 0),
    maxRainProbability: Number(partial.forecast?.maxRainProbability ?? 0),
  };

  const riskScore = Number(partial.riskScore ?? 0);
  const riskLevel = partial.riskLevel || getRiskLevelFromScore(riskScore);
  const confidence = Number(partial.confidence ?? 85);

  const hazards = Array.isArray(partial.hazards) && partial.hazards.length > 0
    ? partial.hazards
    : [
        {
          hazard: partial.hazard ?? "No Significant Hazard",
          impactLevel: partial.impactLevel ?? "Advisory",
          confidence,
          details: partial.hazardDetails ?? "Current conditions within baseline monitoring thresholds.",
        },
      ];

  const historicalIntelligence = {
    patternMatch: Number(partial.historicalIntelligence?.patternMatch ?? 0),
    similarityLevel: partial.historicalIntelligence?.similarityLevel ?? "Low",
    historicalRisk: partial.historicalIntelligence?.historicalRisk ?? "Low",
    commonImpact: partial.historicalIntelligence?.commonImpact ?? "None recorded",
    similarEventsCount: Number(partial.historicalIntelligence?.similarEventsCount ?? 0),
    trend: partial.historicalIntelligence?.trend ?? "Stable",
    dataCoverage: partial.historicalIntelligence?.dataCoverage ?? "Historical dataset",
    dataSource: partial.historicalIntelligence?.dataSource ?? "Open-Meteo ERA5 / SKYRA",
  };

  const impacts = {
    affectedAreas: Array.isArray(partial.impacts?.affectedAreas) ? partial.impacts.affectedAreas : ["General urban area"],
    affectedInfrastructure: Array.isArray(partial.impacts?.affectedInfrastructure) ? partial.impacts.affectedInfrastructure : ["None expected"],
    possibleDisruptions: Array.isArray(partial.impacts?.possibleDisruptions) ? partial.impacts.possibleDisruptions : ["Minimal disruption expected."],
    vulnerableGroups: Array.isArray(partial.impacts?.vulnerableGroups) ? partial.impacts.vulnerableGroups : ["General public"],
    criticalFacilities: Array.isArray(partial.impacts?.criticalFacilities) ? partial.impacts.criticalFacilities : [],
  };

  const xai = {
    explanation: partial.xai?.explanation ?? partial.explanation ?? `Classified as ${riskLevel} risk with risk score of ${riskScore}% and confidence of ${confidence}%.`,
    factors: Array.isArray(partial.xai?.factors) ? partial.xai.factors : (partial.factors || []),
  };

  const actionableAdvice = {
    priority: partial.actionableAdvice?.priority ?? (riskLevel === "Severe" ? "Emergency" : riskLevel === "High" ? "Action" : riskLevel === "Moderate" ? "Caution" : "Routine"),
    title: partial.actionableAdvice?.title ?? `${riskLevel} Risk Guidance`,
    context: partial.actionableAdvice?.context ?? "Current weather conditions analysis.",
    immediateActions: Array.isArray(partial.actionableAdvice?.immediateActions) ? partial.actionableAdvice.immediateActions : ["Continue regular monitoring."],
    avoidActions: Array.isArray(partial.actionableAdvice?.avoidActions) ? partial.actionableAdvice.avoidActions : ["Avoid low-lying areas during heavy rain."],
    preparationActions: Array.isArray(partial.actionableAdvice?.preparationActions) ? partial.actionableAdvice.preparationActions : ["Keep emergency kit ready."],
    emergencyGuidance: Array.isArray(partial.actionableAdvice?.emergencyGuidance) ? partial.actionableAdvice.emergencyGuidance : ["Call 112 for emergency assistance."],
  };

  const alerts = {
    activeAlert: partial.alerts?.activeAlert ?? null,
    status: partial.alerts?.status ?? (riskLevel === "High" || riskLevel === "Severe" ? "Active" : "Normal"),
    message: partial.alerts?.message ?? `${riskLevel} weather risk monitored for ${location.displayName}.`,
    issuedAt: partial.alerts?.issuedAt ?? now,
    severity: riskLevel,
  };

  const emergencyState = {
    safetyStatus: partial.emergencyState?.safetyStatus ?? "Normal",
    nearestShelter: partial.emergencyState?.nearestShelter ?? "Local community relief center",
    nearestHospital: partial.emergencyState?.nearestHospital ?? "District Hospital",
    hotlineNumbers: partial.emergencyState?.hotlineNumbers ?? {
      allEmergencies: "112",
      ambulance: "108",
      disasterHelpline: "1070",
      districtHelpline: "1077",
    },
  };

  const sourceInformation = {
    weatherSource: partial.sourceInformation?.weatherSource ?? "Open-Meteo API",
    mlModel: partial.sourceInformation?.mlModel ?? "RandomForest (v1.0)",
    riskEngine: partial.sourceInformation?.riskEngine ?? "SKYRA Risk Engine",
    historicalSource: partial.sourceInformation?.historicalSource ?? "Open-Meteo ERA5 Archive",
  };

  const sourceMetadata = partial.sourceMetadata ?? {
    provider: "Open-Meteo",
    model: "Best-Match NWP",
    sourceStatus: "ok",
    dataFreshness: "live",
    timestamp: now,
  };

  return {
    location,
    currentWeather,
    forecast,
    hazards,
    riskLevel,
    riskScore,
    confidence,
    historicalIntelligence,
    impacts,
    xai,
    actionableAdvice,
    alerts,
    emergencyState,
    sourceInformation,
    sourceMetadata,
    timestamp: now,
  };
}

module.exports = {
  createSkyraIntelligenceResult,
  getRiskLevelFromScore,
};
