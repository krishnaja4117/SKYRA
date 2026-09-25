/**
 * SKYRA – Client Unified Intelligence Data Contract
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side schema definition and validator for the standard SKYRA
 * intelligence structure. Matches backend/src/utils/dataContract.js.
 */

export function getRiskLevelFromScore(score) {
  const s = Number(score || 0);
  if (s >= 80) return "Severe";
  if (s >= 70) return "High";
  if (s >= 40) return "Moderate";
  return "Low";
}

/**
 * Standardizes an incoming result into the canonical SkyraIntelligenceResult shape.
 * Guarantees all consumers receive a consistent, non-null data contract.
 */
export function normalizeIntelligenceResult(raw = {}) {
  const now = new Date().toISOString();

  const rawLat = raw.location?.latitude ?? raw.latitude;
  const rawLon = raw.location?.longitude ?? raw.longitude;
  const latitude = (rawLat !== null && rawLat !== undefined && !Number.isNaN(Number(rawLat))) ? Number(rawLat) : null;
  const longitude = (rawLon !== null && rawLon !== undefined && !Number.isNaN(Number(rawLon))) ? Number(rawLon) : null;
  const source = raw.location?.source ?? raw.gpsSource ?? (latitude !== null && longitude !== null ? "detected" : "unavailable");

  const location = {
    latitude,
    longitude,
    city: raw.location?.city ?? raw.gpsCity ?? null,
    region: raw.location?.region ?? raw.gpsRegion ?? null,
    country: raw.location?.country ?? (latitude !== null ? "India" : null),
    displayName: raw.location?.displayName ?? raw.locationName ?? (source === "unavailable" ? "Location Unavailable" : "Current location"),
    source,
  };

  const currentWeather = {
    temperature: Number(raw.currentWeather?.temperature ?? raw.temperature ?? 28),
    humidity: Number(raw.currentWeather?.humidity ?? raw.humidity ?? 65),
    windSpeed: Number(raw.currentWeather?.windSpeed ?? raw.wind ?? 14),
    rainfall: Number(raw.currentWeather?.rainfall ?? raw.rainfall ?? 0),
    surfacePressure: Number(raw.currentWeather?.surfacePressure ?? raw.pressure ?? 1013),
    condition: raw.currentWeather?.condition ?? (raw.pred?.hazard || "Normal"),
    lastUpdated: raw.currentWeather?.lastUpdated ?? raw.createdAt ?? now,
  };

  const forecast = {
    hourly: Array.isArray(raw.forecast?.hourly) ? raw.forecast.hourly : [],
    daily: Array.isArray(raw.forecast?.daily) ? raw.forecast.daily : [],
    precipitationExpected: Number(raw.forecast?.precipitationExpected ?? 0),
    maxRainProbability: Number(raw.forecast?.maxRainProbability ?? 0),
  };

  const riskScore = Number(raw.riskScore ?? raw.mlRiskScore ?? 0);
  const riskLevel = raw.riskLevel || raw.mlRiskLevel || getRiskLevelFromScore(riskScore);
  const confidence = Number(raw.confidence ?? raw.mlConfidence ?? 85);

  const hazards = Array.isArray(raw.hazards) && raw.hazards.length > 0
    ? raw.hazards
    : [
        {
          hazard: raw.pred?.hazard || raw.hazard || "No Significant Hazard",
          impactLevel: raw.pred?.impactLevel || raw.impactLevel || "Advisory",
          confidence,
          details: raw.pred?.explanation || raw.reason || "Normal baseline weather.",
        },
      ];

  const historicalIntelligence = raw.historicalIntelligence || raw.hist || {
    patternMatch: Number(raw.hist?.patternMatch ?? 0),
    similarityLevel: raw.hist?.similarityLevel ?? "Low",
    historicalRisk: raw.hist?.historicalRisk ?? "Low",
    commonImpact: raw.hist?.commonImpact ?? "None recorded",
    similarEventsCount: Number(raw.hist?.similarEventCount ?? 0),
    trend: raw.hist?.historicalTrend ?? "Stable",
    dataCoverage: raw.hist?.dataCoverage ?? "Historical dataset",
    dataSource: raw.hist?.dataSource ?? "SKYRA Historical Intelligence",
  };

  const impacts = raw.impacts || {
    affectedAreas: raw.pred?.affectedAreas || ["General urban area"],
    affectedInfrastructure: raw.pred?.affectedInfrastructure || ["None expected"],
    possibleDisruptions: raw.pred?.possibleDisruptions || ["Minimal disruption expected."],
    vulnerableGroups: raw.pred?.vulnerableGroups || ["General public"],
    criticalFacilities: raw.pred?.affectedFacilities || [],
  };

  const xai = raw.xai || {
    explanation: raw.xai?.explanation || raw.pred?.explanation || raw.reason || `Risk assessed as ${riskLevel} (${riskScore}%).`,
    factors: Array.isArray(raw.xai?.factors) ? raw.xai.factors : (raw.factors || []),
  };

  const actionableAdvice = raw.actionableAdvice || raw.advice || {
    priority: riskLevel === "Severe" ? "Emergency" : riskLevel === "High" ? "Action" : riskLevel === "Moderate" ? "Caution" : "Routine",
    title: `${riskLevel} Risk Guidance`,
    context: raw.reason || "Current weather conditions analysis.",
    immediateActions: ["Continue regular monitoring."],
    avoidActions: ["Avoid low-lying areas during heavy rain."],
    preparationActions: ["Keep emergency kit ready."],
    emergencyGuidance: ["Call 112 for emergency assistance."],
  };

  const alerts = raw.alerts || {
    activeAlert: raw.demoAlert || null,
    status: riskLevel === "High" || riskLevel === "Severe" ? "Active" : "Normal",
    message: raw.reason || `${riskLevel} weather conditions monitored.`,
    issuedAt: now,
    severity: riskLevel,
  };

  const emergencyState = raw.emergencyState || {
    safetyStatus: "Normal",
    nearestShelter: raw.nearestShelter || "Local community relief center",
    nearestHospital: raw.nearestHospital || "District Hospital",
    hotlineNumbers: {
      allEmergencies: "112",
      ambulance: "108",
      disasterHelpline: "1070",
      districtHelpline: "1077",
    },
  };

  const sourceInformation = raw.sourceInformation || {
    weatherSource: raw.dataSource || "Open-Meteo Ingestion",
    mlModel: "RandomForest ML Service (Port 8000)",
    riskEngine: "SKYRA Core Engine",
    historicalSource: "ERA5 Archive / Historical Intelligence",
  };

  const sourceMetadata = raw.sourceMetadata || {
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
    timestamp: raw.timestamp || raw.createdAt || now,

    // Legacy convenience properties (preserving 100% backward compatibility for existing components)
    locationName: location.displayName,
    temperature: currentWeather.temperature,
    humidity: currentWeather.humidity,
    wind: currentWeather.windSpeed,
    rainfall: currentWeather.rainfall,
    pressure: currentWeather.surfacePressure,
    mapCenter: (location.latitude !== null && location.longitude !== null)
      ? [location.latitude, location.longitude]
      : (Array.isArray(raw.mapCenter) ? raw.mapCenter : null),
    mlRiskLevel: riskLevel,
    mlRiskScore: riskScore,
    mlConfidence: confidence,
    pred: raw.pred || {
      hazard: hazards[0]?.hazard,
      impactLevel: hazards[0]?.impactLevel,
      confidence,
      affectedAreas: impacts.affectedAreas,
      affectedInfrastructure: impacts.affectedInfrastructure,
      possibleDisruptions: impacts.possibleDisruptions,
      vulnerableGroups: impacts.vulnerableGroups,
      emergencyServices: ["Standard readiness."],
      explanation: xai.explanation,
      dataSource: sourceInformation.weatherSource,
      allDetectedHazards: hazards,
    },
    advice: actionableAdvice,
    hist: historicalIntelligence,
    nearestShelter: emergencyState.nearestShelter,
    nearestHospital: emergencyState.nearestHospital,
    dataSource: sourceInformation.weatherSource,
    reason: raw.reason || xai.explanation,
    createdAt: raw.createdAt || now,
    gpsSource: location.source,
    gpsAccuracy: raw.gpsAccuracy ?? null,
    gpsCity: location.city,
    gpsRegion: location.region,
    isDemo: !!raw.isDemo,
    demoKey: raw.demoKey ?? null,
    demoLabel: raw.demoLabel ?? null,
    demoAlert: raw.demoAlert ?? null,
  };
}
