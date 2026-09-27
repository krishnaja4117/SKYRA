/**
 * SKYRA – Global Alert Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the live risk pipeline AND demo scenarios.
 * Consumed by Dashboard, AlertsAdvisories, and RiskMap via useGlobalAlert().
 *
 * Architecture (Phase 6):
 *   GPS → Live Weather → ML /api/intelligence → Backend Impact Assessment → generateAdvice
 *                              ↓
 *                     module-level cache
 *                       ↙           ↘
 *                Dashboard     AlertsAdvisories
 *
 *   Live Mode: Impact assessment is authoritative from backend impactAssessmentService.
 *              Client-side predictImpacts() is NOT called in live mode (Phase 6).
 *              generateAdvice() continues to run for the advice card (complementary).
 *
 * Demo Mode:
 *   One of five named scenarios can be selected.  The selected scenario is
 *   pre-computed at module load (pure functions, no network) so Demo Mode
 *   works fully offline.  predictImpacts() is used only in demo mode.
 *   Switching scenario or turning Demo off notifies all subscribed components.
 */

import { useEffect, useState } from "react";
import { getIMDAdvisories } from "../imdAdvisories";
import { getCurrentLocationOrUnavailable } from "./locationService";
import { predictImpacts }            from "./predictiveImpact";
import { generateAdvice }            from "./actionableAdvice";
import { analyzeHistoricalPatterns } from "./historicalIntelligence";
import { getShelterHospitalByLocation } from "./shelterHospitalService";
import { getNearestHospitalName, getNearestShelterName } from "./dynamicFacilityFinder";
import { normalizeIntelligenceResult } from "./dataContract";
import { fetchSkyraIntelligence, updateMonitoredLocation, fetchBackendAlerts } from "./intelligenceService";

// ─── Shared helpers ───────────────────────────────────────────────────────────
export function getRiskLevel(score) {
  if (score >= 80) return "Severe";
  if (score >= 70) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}
export function getRiskClass(level) { return String(level || "Low").toLowerCase(); }
export function formatTs(ts) { return ts ? new Date(ts).toLocaleString() : "Unavailable"; }

// ─── Demo scenario definitions ────────────────────────────────────────────────
// Each entry: weather inputs → passed to predictImpacts + generateAdvice.
// No hardcoded pred/advice — they are derived from these inputs so the
// displayed data is consistent with what the real pipeline would produce.
//
// "key" is stable and used as the selected-scenario identifier.
// Each scenario includes hardcoded Chittur-based shelter/hospital for offline use.
// Demo weather data is designed to produce realistic severe weather scenarios
// with risk scores that correspond to real hazard conditions.
const _SCENARIO_INPUTS = {
  flooding: {
    key:          "flooding",
    label:        "🌊 Urban Flooding",
    location:     "Chittur (DEMO – Urban Flooding)",
    mapCenter:    [10.7089, 76.7479],
    // Demo GPS: simulated location with ±10m accuracy
    demoGpsLatitude: 10.7089,
    demoGpsLongitude: 76.7479,
    demoGpsCity: "Chittur",
    demoGpsRegion: "Palakkad, Kerala",
    // Heavy rainfall + high humidity + moderate temperature = severe flooding risk
    rainfall:     65,      // mm — extreme rainfall (training data: 45-80mm → Severe)
    humidity:     98,      // % — very high (training data: 90-99% → Severe)
    temperature:  26,      // °C — cooler due to monsoon circulation
    wind:         72,      // km/h — strong winds from circulation
    month:        7,
    mlRiskLevel:  "Severe",
    mlRiskScore:  95,      // Based on training: [65mm, 60forecast, 98%, 72km/h, 40hist, 2slope, 26°C, 1010hPa] → Severe
    mlConfidence: 92,
    historicalRisk: "Severe",
    patternMatch:   88,
    commonImpact:   "Localized Flooding",
    reason: "DEMO: Simulated extreme rainfall with cyclonic circulation causing severe urban flooding.",
    alertTitle: "🌊 Severe Urban Flooding Warning",
    alertMessage: "Severe flooding is simulated in low-lying areas. Evacuate to higher ground immediately. Avoid flooded roads and follow emergency guidance.",
    nearestShelter: "Chittur School Building (Reinforced), Main Street",
    nearestHospital: "Chittur District Hospital, Civil Station Road",
  },
  heavyRain: {
    key:          "heavyRain",
    label:        "🌧️ Heavy Rainfall",
    location:     "Chittur (DEMO – Heavy Rainfall)",
    mapCenter:    [10.7089, 76.7479],
    // Demo GPS: simulated location with ±10m accuracy
    demoGpsLatitude: 10.7089,
    demoGpsLongitude: 76.7479,
    demoGpsCity: "Chittur",
    demoGpsRegion: "Palakkad, Kerala",
    // Heavy rain + high humidity = high risk, not severe
    rainfall:     35,      // mm — heavy (training data: 25-40mm → High)
    humidity:     94,      // % — very high
    temperature:  28,      // °C
    wind:         45,      // km/h — moderate
    month:        7,
    mlRiskLevel:  "High",
    mlRiskScore:  78,      // Based on training: [35mm, 45forecast, 94%, 45km/h, 40hist, 2slope, 28°C, 1010hPa] → High
    mlConfidence: 85,
    historicalRisk: "High",
    patternMatch:   70,
    commonImpact:   "Waterlogging",
    reason: "DEMO: Simulated heavy monsoon rainfall with waterlogging risk.",
    alertTitle: "🌧️ Heavy Rainfall Warning",
    alertMessage: "Heavy monsoon rainfall is simulated. Avoid waterlogged routes and monitor local conditions.",
    nearestShelter: "Chittur Community Hall, Panchayat Road",
    nearestHospital: "Chittur Medical Center, NH44 Junction",
  },
  cyclone: {
    key:          "cyclone",
    label:        "🌪️ Cyclone / Strong Wind",
    location:     "Chittur (DEMO – Cyclone)",
    mapCenter:    [10.7089, 76.7479],
    // Demo GPS: simulated location with ±10m accuracy
    demoGpsLatitude: 10.7089,
    demoGpsLongitude: 76.7479,
    demoGpsCity: "Chittur",
    demoGpsRegion: "Palakkad, Kerala",
    // Cyclone-class winds + moderate rain + high humidity = severe risk
    rainfall:     15,      // mm — light to moderate rain (cyclones have less rain but extreme wind)
    humidity:     91,      // % — high from circulation
    temperature:  29,      // °C
    wind:         95,      // km/h — cyclone-class winds (training data: 80-90km/h, 110km/h → Severe)
    month:        10,
    mlRiskLevel:  "Severe",
    mlRiskScore:  86,      // Based on training: [15mm, 25forecast, 91%, 95km/h, 40hist, 3slope, 29°C, 1008hPa] → Severe
    mlConfidence: 90,
    historicalRisk: "Severe",
    patternMatch:   82,
    commonImpact:   "Tree Falls & Structural Damage",
    reason: "DEMO: Simulated cyclone-class winds causing severe structural and windthrow risk.",
    alertTitle: "🌪️ Cyclone / Strong Wind Warning",
    alertMessage: "Cyclone-class winds are simulated. Stay indoors and keep clear of trees, poles, and loose structures.",
    nearestShelter: "Chittur School Building (Reinforced), Main Street",
    nearestHospital: "Chittur District Hospital, Civil Station Road",
  },
  extremeHeat: {
    key:          "extremeHeat",
    label:        "🌡️ Extreme Heat",
    location:     "Chittur (DEMO – Extreme Heat)",
    mapCenter:    [10.7089, 76.7479],
    // Demo GPS: simulated location with ±10m accuracy
    demoGpsLatitude: 10.7089,
    demoGpsLongitude: 76.7479,
    demoGpsCity: "Chittur",
    demoGpsRegion: "Palakkad, Kerala",
    // Very high temperature + low humidity = high heat stress risk (not severe by flood/wind standards)
    rainfall:     0,       // mm — no rain in extreme heat
    humidity:     42,      // % — low (dry conditions)
    temperature:  44,      // °C — extreme heat
    wind:         14,      // km/h — light wind
    month:        5,
    mlRiskLevel:  "High",
    mlRiskScore:  72,      // Extreme heat is "High" in this model (temperature-only hazard)
    mlConfidence: 82,
    historicalRisk: "Moderate",
    patternMatch:   55,
    commonImpact:   "Heat Stress",
    reason: "DEMO: Simulated extreme heat event with heat stress risk.",
    alertTitle: "🌡️ Extreme Heat Warning",
    alertMessage: "Extreme heat is simulated. Limit outdoor activity, hydrate often, and check vulnerable people.",
    nearestShelter: "Chittur Air-Conditioned Community Center, Market Road",
    nearestHospital: "Chittur Medical Center, NH44 Junction",
  },
  severe: {
    key:          "severe",
    label:        "⛈️ Severe Weather",
    location:     "Chittur (DEMO – Severe Weather)",
    mapCenter:    [10.7089, 76.7479],
    // Multi-hazard: extreme rainfall + cyclonic winds + high humidity = most severe
    rainfall:     72,      // mm — extreme rainfall (training data peak: 70mm)
    humidity:     98,      // % — maximum humidity
    temperature:  25,      // °C — very cool (monsoon/cyclone circulation)
    wind:         88,      // km/h — strong cyclonic winds
    month:        8,
    mlRiskLevel:  "Severe",
    mlRiskScore:  97,      // Highest training value is 98 for [80mm, 100forecast, 99%, 90km/h, 98hist, 30slope, 22°C, 990hPa]
    mlConfidence: 95,      // Very high confidence in severe conditions
    historicalRisk: "Severe",
    patternMatch:   92,
    commonImpact:   "Localized Flooding",
    reason: "DEMO: Simulated multi-hazard severe weather emergency (extreme rainfall + cyclonic winds + high humidity).",
    alertTitle: "⛈️ CRITICAL Severe Weather Alert",
    alertMessage: "CRITICAL: Severe multi-hazard weather is simulated. Seek immediate shelter. Follow official emergency guidance. Evacuate if instructed.",
    nearestShelter: "Chittur School Building (Reinforced), Main Street",
    nearestHospital: "Chittur District Hospital, Civil Station Road",
  },
};

// Ordered list for the UI picker
export const DEMO_SCENARIOS = [
  _SCENARIO_INPUTS.flooding,
  _SCENARIO_INPUTS.heavyRain,
  _SCENARIO_INPUTS.cyclone,
  _SCENARIO_INPUTS.extremeHeat,
  _SCENARIO_INPUTS.severe,
];

// ─── Demo historical intelligence (pure, offline) ────────────────────────────
// Returns a realistic historical pattern result for demo scenarios.
// Uses the same historical dataset as live mode, but returns pre-computed
// similarity analysis so demo is instant and fully offline.
function _buildDemoHistoricalResult(rainfall, humidity, temperature, wind, month, location, historicalRisk, commonImpact, patternMatch) {
  return {
    location,
    analysisTime: new Date().toISOString(),
    status: "complete",
    patternMatch,              // 0–100 (pre-computed from scenario)
    similarityLevel: 
      patternMatch >= 80  ? "Very High" :
      patternMatch >= 60  ? "High" :
      patternMatch >= 40  ? "Moderate" :
      "Low",
    similarEventCount: patternMatch >= 80 ? 6 : patternMatch >= 60 ? 4 : patternMatch >= 40 ? 3 : 2,
    historicalRisk,            // "Low" | "Moderate" | "High" | "Severe"
    commonImpact,              // e.g. "Localized Flooding", "Tree Falls & Structural Damage"
    impactLikelihood: patternMatch >= 60 ? 75 : 55,
    historicalTrend: "Stable", // In demo, always stable (not trending up/down)
    explanation: `Historical analysis found ${patternMatch >= 80 ? "strong" : patternMatch >= 60 ? "moderate" : "limited"} similarity between current conditions and past events. Most common past impact: ${commonImpact}.`,
    dataCoverage: `${patternMatch >= 80 ? "6" : patternMatch >= 60 ? "4" : patternMatch >= 40 ? "3" : "2"} historical records (demo dataset: 2012–2023)`,
    dataSource: "SKYRA demo dataset (Bhubaneswar)",
    dataReliability: "Demo — Simulated Data",
  };
}

// ─── Pre-compute each scenario's pred + advice (pure, instant, offline) ───────
function _buildScenarioResult(s) {
  const pred = predictImpacts({
    rainfall:      s.rainfall,
    humidity:      s.humidity,
    temperature:   s.temperature,
    wind:          s.wind,
    month:         s.month,
    mlRiskLevel:   s.mlRiskLevel,
    mlRiskScore:   s.mlRiskScore,
    historicalRisk: s.historicalRisk,
    commonImpact:  s.commonImpact,
    patternMatch:  s.patternMatch,
    location:      s.location,
  });
  const advice = generateAdvice({
    rainfall:        s.rainfall,
    humidity:        s.humidity,
    temperature:     s.temperature,
    wind:            s.wind,
    month:           s.month,
    mlRiskLevel:     s.mlRiskLevel,
    mlRiskScore:     s.mlRiskScore,
    historicalRisk:  s.historicalRisk,
    patternMatch:    s.patternMatch,
    predictedHazard: pred.hazard,
    impactLevel:     pred.impactLevel,
    location:        s.location,
  });
  const hist = _buildDemoHistoricalResult(
    s.rainfall, s.humidity, s.temperature, s.wind, s.month, s.location,
    s.historicalRisk, s.commonImpact, s.patternMatch
  );

  const forecastHourly = [
    {
      time: "+1h",
      temperature: s.temperature,
      precipitation: Math.round(s.rainfall * 0.9),
      rainProbability: Math.min(100, Math.round(s.humidity * 0.95)),
      windSpeed: s.wind,
      condition: s.rainfall > 25 ? "Heavy rainfall" : s.rainfall > 5 ? "Rain" : "Partly cloudy",
    },
    {
      time: "+3h",
      temperature: Math.max(18, s.temperature - 1),
      precipitation: Math.round(s.rainfall * 1.1),
      rainProbability: Math.min(100, Math.round(s.humidity)),
      windSpeed: Math.round(s.wind * 1.05),
      condition: s.rainfall > 25 ? "Heavy rainfall" : s.rainfall > 5 ? "Rain" : "Cloudy",
    },
    {
      time: "+6h",
      temperature: Math.max(18, s.temperature - 2),
      precipitation: Math.round(s.rainfall * 0.75),
      rainProbability: Math.min(100, Math.round(s.humidity * 0.85)),
      windSpeed: Math.round(s.wind * 0.95),
      condition: s.rainfall > 10 ? "Rain" : "Overcast",
    },
    {
      time: "+12h",
      temperature: s.temperature,
      precipitation: Math.round(s.rainfall * 0.3),
      rainProbability: Math.max(10, Math.round(s.humidity * 0.6)),
      windSpeed: Math.max(10, Math.round(s.wind * 0.8)),
      condition: "Partly cloudy",
    },
  ];

  const xaiFactors = [
    s.rainfall > 25 ? `Heavy Rainfall: ${s.rainfall} mm (exceeds 25mm hazard threshold)` : null,
    s.wind > 50 ? `Extreme Wind: ${s.wind} km/h (cyclonic threshold)` : null,
    s.humidity > 85 ? `Atmospheric Humidity: ${s.humidity}% (saturated air mass)` : null,
    s.temperature > 40 ? `Extreme Thermal Index: ${s.temperature}°C (severe heat stress)` : null,
    `Historical Pattern Similarity: ${s.patternMatch}% match with historical ${s.historicalRisk} events`,
  ].filter(Boolean);

  return normalizeIntelligenceResult({
    // GPS-like fields
    gpsSource:    "demo_scenario",
    locationName: s.location,
    gpsAccuracy:  null,
    mapCenter:    s.mapCenter,
    gpsCity:      null,
    gpsRegion:    null,
    // Weather
    temperature:  s.temperature,
    humidity:     s.humidity,
    wind:         s.wind,
    rainfall:     s.rainfall,
    pressure:     1010,
    // ML
    mlRiskLevel:  getRiskLevel(s.mlRiskScore),
    mlRiskScore:  s.mlRiskScore,
    mlConfidence: s.mlConfidence,
    // Downstream
    hist,
    pred,
    advice,
    forecast: {
      hourly: forecastHourly,
      precipitationExpected: s.rainfall,
      maxRainProbability: Math.min(100, s.humidity),
    },
    xai: {
      available: true,
      whyThisRisk: s.reason,
      summary: s.reason,
      explanation: s.reason,
      factors: xaiFactors,
      explanationMethod: "Tree-Path Feature Attribution",
      modelMethod: "Calibrated RandomForest (Port 8000)",
      confidenceExplanation: {
        value: s.mlConfidence,
        confidenceType: "CALIBRATED",
        calibrationMethod: "Platt Sigmoid (5-fold Cross-Validation)",
        isCalibrated: true,
      },
    },
    // Meta
    createdAt: new Date().toISOString(),
    reason:    s.reason,
    isDemo:    true,
    demoKey:   s.key,
    demoLabel: s.label,
    demoAlert: {
      title: s.alertTitle,
      message: s.alertMessage,
    },
    // Emergency response readiness (scenario-specific for demo, location-based for online)
    nearestShelter: s.nearestShelter,
    nearestHospital: s.nearestHospital,
  });
}

// Eagerly compute all five scenarios once at module load.
// This is ~5 pure function calls — fast, no I/O, works offline.
const _SCENARIO_RESULTS = Object.fromEntries(
  DEMO_SCENARIOS.map((s) => [s.key, _buildScenarioResult(s)])
);

// For backward compatibility — default demo scenario is Urban Flooding.
export const DEMO_SCENARIO  = _SCENARIO_INPUTS.flooding;
export const DEMO_ADVICE    = _SCENARIO_RESULTS.flooding.advice;
export const DEMO_PRED      = _SCENARIO_RESULTS.flooding.pred;

// ─── Module-level shared state ────────────────────────────────────────────────
let _cache        = null;           // live pipeline result
let _cacheTime    = 0;              // epoch ms of last successful live fetch
let _loading      = false;          // pipeline in-flight
let _error        = "";             // last pipeline error
let _demoMode     = false;          // demo on/off
let _demoScenario = "flooding";     // active scenario key
const STALE_MS    = 60_000;

const _listeners  = new Set();
function _notify() { for (const fn of _listeners) fn({}); }

// ─── Manual location override ─────────────────────────────────────────────────
// Set by city search. When set, the pipeline uses these coords instead of GPS.
let _manualLocation = null;  // { latitude, longitude, displayName } | null

export function setManualLocation(latitude, longitude, displayName) {
  _manualLocation = { latitude, longitude, displayName };
  // Invalidate cache so the next runPipeline() re-fetches for the new location.
  _cache     = null;
  _cacheTime = 0;
  // Don't run in demo mode — demo is fully offline and ignores location.
  if (!_demoMode) runPipeline();
  else _notify();
}

export function clearManualLocation() {
  _manualLocation = null;
  _cache          = null;
  _cacheTime      = 0;
  if (!_demoMode) runPipeline();
  else _notify();
}

// ─── Live pipeline ────────────────────────────────────────────────────────────
export async function runPipeline() {
  // Demo scenarios are complete local snapshots. Never start a live request
  // while Demo Mode is active.
  if (_demoMode || _loading) return;
  _loading = true;
  _error   = "";
  _notify();

  try {
    // Use manual location override (city search) if set; otherwise GPS.
    let loc;
    if (_manualLocation) {
      loc = {
        latitude:    _manualLocation.latitude,
        longitude:   _manualLocation.longitude,
        source:      "manual",
        city:        _manualLocation.displayName,
        displayName: _manualLocation.displayName,
        region:      null,
        accuracy:    null,
      };
    } else {
      loc = await getCurrentLocationOrUnavailable();
    }

    // Explicit Location Unavailable handling
    if (loc.source === "unavailable" || loc.latitude === null || loc.longitude === null) {
      _cache = normalizeIntelligenceResult({
        gpsSource:    "unavailable",
        locationName: "Location Unavailable",
        gpsAccuracy:  null,
        gpsCity:      null,
        gpsRegion:    "Enable GPS or search city",
        latitude:     null,
        longitude:    null,
        mapCenter:    null,
        temperature:  null,
        humidity:     null,
        wind:         null,
        rainfall:     null,
        pressure:     null,
        mlRiskLevel:  "Low",
        mlRiskScore:  0,
        mlConfidence: null,
        pred: {
          hazard:                 "Location Unavailable",
          impactLevel:            "Advisory",
          confidence:             0,
          confidenceLabel:        "N/A",
          affectedAreas:          [],
          affectedInfrastructure: [],
          possibleDisruptions:    ["Allow GPS permissions in your browser or search a city above."],
          vulnerableGroups:       [],
          affectedFacilities:     [],
          emergencyServices:      ["Standard emergency readiness: Call 112"],
          recommendedActions:     ["Search or select a city above to activate live predictive analysis."],
          allDetectedHazards:     [],
          explanation:            loc.error || "Location access is unavailable or denied. Search a city using the bar above to view live risk analysis.",
          dataSource:             "Awaiting Location",
        },
        advice: {
          priority:           "Routine",
          title:              "Location Required",
          context:            "Live disaster monitoring requires a geographic location.",
          immediateActions:   ["Allow location access or search your city in the search bar."],
          avoidActions:       [],
          preparationActions: [],
          emergencyGuidance:  ["National Emergency Helpline: Call 112"],
        },
        hist: null,
        nearestShelter:  "Search a city to view nearby emergency shelters",
        nearestHospital: "Search a city to view nearby emergency hospitals",
        dataSource:      "Awaiting Location",
        imdAdvisories:   null,
        createdAt:       new Date().toISOString(),
        reason:          "Browser location unavailable. Please enable GPS permissions or search for a city above.",
        alerts: {
          activeAlert: null,
          status:      "Normal",
          message:     "Location unavailable. Search a city above to activate live monitoring.",
          severity:    "Low",
        },
      });
      _cacheTime = Date.now();
      _error     = "";
      return;
    }

    const locationName = loc.displayName || loc.city || "Current location";

    // 1. Sync monitored location with backend continuous monitoring service
    // Respect user location consent (loc.source !== "unavailable" and not demo)
    if (loc.source !== "unavailable" && loc.latitude != null && loc.longitude != null) {
      updateMonitoredLocation({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName,
        consent: true,
      }).catch((err) => {
        console.warn("[SKYRA] Backend monitor location update warning:", err.message);
      });
    }

    // 2. Query unified backend intelligence pipeline (GET /api/intelligence)
    // Send validated user coordinates and location name
    // No artificial slope (15), no hardcoded historicalRisk (60), no silent 58/87 fallbacks!
    let intelResult = null;
    let backendFetchError = null;

    try {
      intelResult = await fetchSkyraIntelligence({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationName,
      });
    } catch (err) {
      console.warn("[SKYRA] Unified backend intelligence fetch failed:", err.message);
      backendFetchError = err;
    }

    if (!intelResult) {
      // Backend is unavailable: DO NOT invent fake 58 risk score or 87% confidence!
      _cache = null;
      _cacheTime = Date.now();
      _error = `Backend intelligence service is currently unavailable (${backendFetchError?.message || "Connection failed"}).`;
      _loading = false;
      _notify();
      return;
    }

    // 3. Query IMD advisories and real backend alerts in parallel
    const [imdData, alertData] = await Promise.all([
      getIMDAdvisories(loc.latitude, loc.longitude, locationName).catch(() => null),
      fetchBackendAlerts({ locationName }).catch(() => null),
    ]);

    const backendActiveAlert = alertData?.activeAlert || null;
    const alertHistory = alertData?.history || [];

    // 4. Obtain shelter/hospital facility names
    let nearestShelter = "Check local civic authority or municipality office";
    let nearestHospital = "Check local hospital directory or emergency services";

    try {
      const hospitalName = await getNearestHospitalName(
        loc.latitude,
        loc.longitude,
        locationName,
        getShelterHospitalByLocation
      );
      nearestHospital = hospitalName;

      const shelterName = await getNearestShelterName(
        loc.latitude,
        loc.longitude,
        locationName,
        getShelterHospitalByLocation
      );
      nearestShelter = shelterName;
    } catch (err) {
      console.warn("[SKYRA] Dynamic facility lookup warning:", err.message);
      const shelterHospital = getShelterHospitalByLocation(
        locationName,
        loc.latitude,
        loc.longitude
      );
      nearestShelter = shelterHospital.nearestShelter;
      nearestHospital = shelterHospital.nearestHospital;
    }

    // 5. Complementary historical pattern analysis
    const currentMonth = new Date().getMonth() + 1;
    const hist = await analyzeHistoricalPatterns({
      rainfall: intelResult.currentWeather.rainfall,
      humidity: intelResult.currentWeather.humidity,
      temperature: intelResult.currentWeather.temperature,
      wind: intelResult.currentWeather.windSpeed,
      month: currentMonth,
      location: locationName,
      latitude: loc.latitude,
      longitude: loc.longitude,
    }).catch(() => null);

    // 6. Phase 6: Backend impact assessment is now authoritative for live mode.
    // intelResult.impactAssessment is the full Phase 6 result from the backend.
    // The client-side predictImpacts() is no longer called in live mode —
    // this eliminates duplicate client-side hazard logic that conflicted with backend.
    // For the legacy advice card, we still derive advice from real backend values.
    const backendImpact = intelResult.impactAssessment ?? null;

    // Use backend hazard/impact-level from impactAssessment if available
    const resolvedHazard = backendImpact?.hazard
      ?? intelResult.hazards?.[0]?.hazard
      ?? "No Significant Hazard";

    const resolvedImpactLevel = backendImpact?.severity?.label
      ? (backendImpact.severity.label === "Critical" || backendImpact.severity.label === "Severe" ? "Severe"
         : backendImpact.severity.label === "Significant" ? "Warning"
         : backendImpact.severity.label === "Moderate" ? "Watch"
         : "Advisory")
      : (intelResult.hazards?.[0]?.impactLevel ?? "Advisory");

    const advice = generateAdvice({
      rainfall: intelResult.currentWeather.rainfall,
      humidity: intelResult.currentWeather.humidity,
      temperature: intelResult.currentWeather.temperature,
      wind: intelResult.currentWeather.windSpeed,
      month: currentMonth,
      mlRiskLevel: intelResult.riskLevel,
      mlRiskScore: intelResult.riskScore,
      historicalRisk: hist?.historicalRisk || "Moderate",
      patternMatch: hist?.patternMatch || 0,
      predictedHazard: resolvedHazard,
      impactLevel: resolvedImpactLevel,
      location: locationName,
    });

    // Assemble canonical cache from real backend intelligence payload
    // pred is now fully driven by the backend impactAssessment — no client-side override
    _cache = normalizeIntelligenceResult({
      ...intelResult,
      gpsSource: loc.source,
      gpsAccuracy: loc.accuracy ?? null,
      gpsCity: loc.city ?? null,
      gpsRegion: loc.region ?? null,
      mapCenter: [loc.latitude, loc.longitude],
      nearestShelter,
      nearestHospital,
      hist,
      // Phase 6: Do NOT set raw.pred — let normalizeIntelligenceResult build it
      // from impactAssessment (passed through intelResult.impactAssessment)
      advice: {
        ...advice,
        context: intelResult.xai?.explanation || advice.context,
      },
      imdAdvisories: imdData ?? null,
      createdAt: intelResult.timestamp || new Date().toISOString(),
      reason: intelResult.xai?.explanation || `Classified as ${intelResult.riskLevel} risk (${intelResult.riskScore}%).`,
      alerts: {
        activeAlert: backendActiveAlert,
        history: alertHistory,
        status: backendActiveAlert?.status || (intelResult.riskLevel === "High" || intelResult.riskLevel === "Severe" ? "Active" : "Normal"),
        message: backendActiveAlert?.message || resolvedHazard || `${intelResult.riskLevel} weather conditions monitored.`,
        severity: backendActiveAlert?.riskLevel || intelResult.riskLevel,
      },
    });

    _cacheTime = Date.now();
    _error = "";
  } catch (err) {
    console.error("[SKYRA] globalAlertService pipeline error:", err);
    _error = "Unable to load live risk data. Check backend connection.";
  } finally {
    _loading = false;
    _notify();
  }
}

// ─── Demo controls ────────────────────────────────────────────────────────────
/** Toggle demo mode on/off — notifies all subscribed components. */
export function setDemoMode(value) {
  _demoMode = !!value;
  _notify();
}

/** Switch the active demo scenario by key — also enables demo mode. */
export function setDemoScenario(key) {
  if (!_SCENARIO_RESULTS[key]) return;   // ignore unknown keys
  _demoScenario = key;
  _demoMode     = true;
  _notify();
}

export function getDemoMode()     { return _demoMode; }
export function getDemoScenario() { return _demoScenario; }

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * useGlobalAlert()
 *
 * Returns:
 *   cache          — live GlobalAlertResult (null while loading)
 *   loading        — pipeline in-flight
 *   error          — last pipeline error string
 *   demo           — boolean, demo mode active
 *   demoScenario   — active scenario key (e.g. "flooding")
 *   setDemo(bool)  — toggle demo mode globally
 *   setScenario(key) — switch scenario + enable demo
 */
export function useGlobalAlert() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _listeners.add(listener);

    const stale = !_cache || (Date.now() - _cacheTime > STALE_MS);
    if (!_demoMode && stale && !_loading) runPipeline();

    return () => { _listeners.delete(listener); };
  }, []);

  return {
    cache:           _cache,
    loading:         _loading,
    error:           _error,
    demo:            _demoMode,
    demoScenario:    _demoScenario,
    manualLocation:  _manualLocation,
    setDemo:         setDemoMode,
    setScenario:     setDemoScenario,
    setManualLoc:    setManualLocation,
    clearManualLoc:  clearManualLocation,
  };
}

// ─── Resolve canonical display values ────────────────────────────────────────
/**
 * resolveDisplayValues(cache, demo, demoScenario)
 *
 * Returns one consistent set of values for both Dashboard and Alerts.
 * In demo mode: returns the pre-computed scenario result.
 * In live mode: returns the live cache (or safe nulls while loading).
 */
export function resolveDisplayValues(cache, demo, demoScenario) {
  if (demo) {
    const key    = demoScenario ?? "flooding";
    const result = _SCENARIO_RESULTS[key] ?? _SCENARIO_RESULTS.flooding;
    return result;
  }
  if (!cache) {
    return normalizeIntelligenceResult({
      locationName: null, mlRiskLevel: "Low", mlRiskScore: 0, mlConfidence: null,
      temperature: null, humidity: null, wind: null, rainfall: null,
      latitude: null, longitude: null, mapCenter: null,
      pred: null, advice: null, hist: null, reason: "", createdAt: null,
      gpsSource: null, gpsAccuracy: null, isDemo: false, dataSource: "Open-Meteo (API)",
      imdAdvisories: null,
    });
  }
  return { ...cache, isDemo: false };
}
