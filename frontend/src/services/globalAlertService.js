/**
 * SKYRA – Global Alert Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the live risk pipeline AND demo scenarios.
 * Consumed by Dashboard, AlertsAdvisories, and RiskMap via useGlobalAlert().
 *
 * Architecture:
 *   GPS → Live Weather → ML /api/risk → predictImpacts → generateAdvice
 *                              ↓
 *                     module-level cache
 *                       ↙           ↘
 *                Dashboard     AlertsAdvisories
 *
 * Demo Mode:
 *   One of five named scenarios can be selected.  The selected scenario is
 *   pre-computed at module load (pure functions, no network) so Demo Mode
 *   works fully offline.  Switching scenario or turning Demo off notifies
 *   all subscribed components simultaneously.
 */

import { useEffect, useState } from "react";
import { getLiveWeather }            from "../weatherApi";
import { getNWPForecast, mergeForecasts, getDataSourceLabel } from "../nwpForecast";
import { getIMDAdvisories } from "../imdAdvisories";
import { getCurrentLocationOrFallback } from "./locationService";
import { predictImpacts }            from "./predictiveImpact";
import { generateAdvice }            from "./actionableAdvice";
import { analyzeHistoricalPatterns } from "./historicalIntelligence";
import { getShelterHospitalByLocation } from "./shelterHospitalService";
import { getNearestHospitalName, getNearestShelterName } from "./dynamicFacilityFinder";
import { normalizeIntelligenceResult } from "./dataContract";

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
      loc = await getCurrentLocationOrFallback();
    }
    const locationName =
      loc.source === "demo_fallback"
        ? `${loc.city ?? "Bhubaneswar"} (DEMO fallback)`
        : (loc.city ?? loc.displayName ?? "Your location");

    // Fetch Open-Meteo, NWP, and IMD data in parallel (fail-fast: NWP/IMD have 5s timeout)
    const [openMeteoForecast, nwpData, imdData] = await Promise.all([
      getLiveWeather(loc.latitude, loc.longitude),
      getNWPForecast(loc.latitude, loc.longitude),
      getIMDAdvisories(loc.latitude, loc.longitude, locationName),
    ]);

    // Merge NWP (if available) with Open-Meteo; if NWP fails, Open-Meteo is used as-is
    const forecast     = mergeForecasts(openMeteoForecast, nwpData);
    const dataSource   = getDataSourceLabel(forecast);

    const cur          = forecast?.current ?? {};
    const temperature  = Number(cur.temperature_2m       ?? 28);
    const humidity     = Number(cur.relative_humidity_2m ?? 68);
    const wind         = Number(cur.wind_speed_10m       ?? 14);
    const rainfall     = Number(cur.rain                 ?? 2);
    const pressure     = Number(cur.surface_pressure     ?? 1013);
    const currentMonth = new Date().getMonth() + 1;

    let mlRiskLevel = "Moderate", mlRiskScore = 58, mlConfidence = 87;
    try {
      const riskRes = await fetch("http://localhost:5000/api/risk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rainfall,
          forecastRainfall: Number(forecast?.hourly?.precipitation?.[0] ?? 3),
          humidity, windSpeed: wind, terrainSlope: 15, historicalRisk: 60,
          temperature, pressure, location: locationName,
        }),
      });
      if (riskRes.ok) {
        const rd    = await riskRes.json();
        mlRiskScore  = Number(rd.riskScore  ?? 58);
        mlRiskLevel  = getRiskLevel(mlRiskScore);
        mlConfidence = Number(rd.confidence ?? 87);
        console.log("[SKYRA] ML Risk API response:", { riskScore: mlRiskScore, riskLevel: mlRiskLevel, confidence: mlConfidence, location: locationName, weather: { rainfall, humidity, windSpeed: wind, temperature } });
      } else {
        const errText = await riskRes.text();
        console.warn("[SKYRA] ML Risk API error response:", riskRes.status, errText);
      }
    } catch (err) {
      console.warn("[SKYRA] ML Risk API fetch failed (backend offline?):", err.message);
      console.log("[SKYRA] Using fallback risk score:", mlRiskScore);
    }

    const hist = await analyzeHistoricalPatterns({
      rainfall, humidity, temperature, wind, month: currentMonth, location: locationName,
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    const pred = predictImpacts({
      rainfall, humidity, temperature, wind, month: currentMonth,
      mlRiskLevel, mlRiskScore,
      historicalRisk: hist.historicalRisk,
      commonImpact:   hist.commonImpact,
      patternMatch:   hist.patternMatch,
      location:       locationName,
    });
    const advice = generateAdvice({
      rainfall, humidity, temperature, wind, month: currentMonth,
      mlRiskLevel, mlRiskScore,
      historicalRisk:  hist.historicalRisk,
      patternMatch:    hist.patternMatch,
      predictedHazard: pred.hazard,
      impactLevel:     pred.impactLevel,
      location:        locationName,
    });

    // Online Mode: Fetch location-specific shelter/hospital data
    // Try dynamic facility lookup first; fall back to database if it fails
    let nearestShelter = "Check local civic authority or municipality office";
    let nearestHospital = "Check local hospital directory or emergency services";
    
    try {
      // Attempt dynamic facility lookup using Overpass API
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
      console.warn("[SKYRA] Dynamic facility lookup failed, using database fallback:", err.message);
      // Fall back to database lookup
      const shelterHospital = getShelterHospitalByLocation(
        locationName,
        loc.latitude,
        loc.longitude
      );
      nearestShelter = shelterHospital.nearestShelter;
      nearestHospital = shelterHospital.nearestHospital;
    }

    let backendActiveAlert = null;
    try {
      const alertRes = await fetch("http://localhost:5000/api/alerts", {
        signal: AbortSignal.timeout(2500),
      });
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        backendActiveAlert = alertData.activeAlert;
      }
    } catch {
      // Backend offline or unreachable - non-blocking
    }

    _cache = normalizeIntelligenceResult({
      gpsSource: loc.source,
      locationName,
      gpsAccuracy: loc.accuracy ?? null,
      gpsCity:     loc.city     ?? null,
      gpsRegion:   loc.region   ?? null,
      latitude:    loc.latitude,
      longitude:   loc.longitude,
      mapCenter:   [loc.latitude, loc.longitude],
      temperature, humidity, wind, rainfall, pressure,
      mlRiskLevel, mlRiskScore, mlConfidence,
      hist, pred, advice,
      nearestShelter,
      nearestHospital,
      dataSource,
      imdAdvisories: imdData ?? null,
      createdAt: new Date().toISOString(),
      reason: pred.hazard !== "No Significant Hazard"
        ? `Live assessment: ${pred.hazard}.`
        : "Conditions within normal monitoring range.",
      alerts: {
        activeAlert: backendActiveAlert,
        status: mlRiskLevel === "High" || mlRiskLevel === "Severe" ? "Active" : "Normal",
        message: pred.hazard,
        severity: mlRiskLevel,
      },
    });
    _cacheTime = Date.now();
    _error     = "";
  } catch (err) {
    console.error("[SKYRA] globalAlertService pipeline error:", err);
    _error = "Unable to load live risk data. Check connection and try again.";
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
