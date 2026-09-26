/**
 * SKYRA – Proactive Meteorological Monitor Service (Phase 12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Continuous background evaluation service monitoring active user coordinates.
 *
 * Guarantees:
 *   • Proactive evaluation: Evaluates real weather, terrain slope, historical risk,
 *     IMD advisories, and impact assessments every 60 seconds.
 *   • Idle by default: When monitoredLocation is null, returns immediately with
 *     ZERO silent fallback to Bhubaneswar.
 *   • Concurrency mutex: Prevents overlapping cycle execution if upstream APIs lag.
 *   • Anti-Fabrication: Clearly labels source authority (OFFICIAL_ADVISORY vs MODEL_ESTIMATE).
 *   • SHA-256 Deduplication: Suppresses repetitive alert creation during cooldown.
 *   • Dynamic Expiry: Calculates expiresAt on creation and enforces application-level TTL.
 *   • Complete Lifecycle: Supports Active -> Acknowledged -> Resolved / Expired transitions.
 */

const mongoose = require("mongoose");
const { calculateRisk } = require("./riskEngine");
const { fetchWeather, validateCoordinates } = require("./weatherService");
const { fetchTerrainData } = require("./ingestion/terrainService");
const { fetchHistoricalRisk } = require("./analytics/historicalRiskService");
const { fetchIMDAdvisories } = require("./ingestion/imdService");
const { assessImpact } = require("./impactAssessmentService");
const { extractFeatures } = require("./features/featureExtractor");
const Alert = require("../models/Alert");
const {
  SOURCE_AUTHORITIES,
  PRIORITIES,
  LIFECYCLE_STATUS,
  DEFAULT_COOLDOWN_MS,
  generateAlertFingerprint,
  determinePriority,
  calculateExpiry,
  evaluateAlertLifecycleTransition,
  isAlertStale,
  isCooldownActive,
} = require("./alertEngine");

const MONITOR_INTERVAL = 60 * 1000;

let monitorTimer = null;
let isCycleRunning = false;
let lastRiskScore = null;
let lastRiskLevel = null;
let _weatherFetcherOverride = null;

let alertHistory = [];
let activeAlert = null;

// Configurable monitored coordinates (must be explicitly configured by user consent)
let monitoredLocation = null;

/* ================================
   RISK LEVEL (Unified Scale)
=============================== */
function getRiskLevel(score) {
  const s = Number(score || 0);
  if (s >= 80) return "Severe";
  if (s >= 70) return "High";
  if (s >= 40) return "Moderate";
  return "Low";
}

function getRiskRank(level) {
  const ranks = { Low: 1, Moderate: 2, High: 3, Severe: 4 };
  return ranks[level] || 0;
}

/* ================================
   ADVISORY BUILDER
=============================== */
function getAdvisory(inputs, riskLevel, hazardName = "") {
  if (inputs.rainfall >= 50 || riskLevel === "Severe") {
    return "Severe weather hazard detected. Avoid all flooded corridors, secure essential belongings, and evacuate to higher ground if instructed.";
  }
  if (inputs.rainfall >= 30) {
    return "Heavy rainfall detected. Avoid waterlogged arterial routes and move to elevated areas if water levels rise.";
  }
  if (inputs.windSpeed >= 50) {
    return "Severe wind speeds detected. Remain indoors away from loose roofing, unanchored structures, and power lines.";
  }
  if (riskLevel === "High") {
    return "High weather risk detected. Follow official emergency guidance and avoid non-essential travel.";
  }
  if (riskLevel === "Moderate") {
    return "Stay alert, monitor changing weather advisories, and plan travel with caution.";
  }
  return "Weather conditions are currently normal. Continue standard monitoring.";
}

/* ================================
   LOAD ALERTS FROM MONGODB
=============================== */
async function initializeAlerts() {
  if (mongoose.connection.readyState !== 1) {
    console.log("ℹ️ MongoDB not connected; using in-memory alert store");
    return;
  }

  try {
    const alerts = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    alertHistory = alerts || [];

    // Find first Active or Acknowledged alert
    const candidateActive = alertHistory.find(
      (a) => a.status === LIFECYCLE_STATUS.ACTIVE || a.status === LIFECYCLE_STATUS.ACKNOWLEDGED
    ) || null;

    if (candidateActive) {
      if (isAlertStale(candidateActive)) {
        console.log(`ℹ️ Restored alert ${candidateActive.id} has expired; transitioning to Expired.`);
        candidateActive.status = LIFECYCLE_STATUS.EXPIRED;
        activeAlert = null;
        try {
          await Alert.updateOne({ id: candidateActive.id }, { status: LIFECYCLE_STATUS.EXPIRED });
        } catch (_) {}
      } else {
        activeAlert = candidateActive;
        console.log(`🚨 Active alert restored: ${activeAlert.id} [${activeAlert.priority} - ${activeAlert.status}]`);
      }
    } else {
      activeAlert = null;
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
=============================== */
async function createAlert({
  sourceAuthority = SOURCE_AUTHORITIES.MODEL_ESTIMATE,
  priority = PRIORITIES.P3,
  severity = "Warning",
  hazard = "Weather Hazard",
  riskLevel = "Moderate",
  riskScore = 50,
  confidence = 0,
  calibratedConfidence = 0,
  impactSeverity = null,
  title,
  message,
  recommendedAction,
  recommendedActions = [],
  reason,
  location,
  latitude,
  longitude,
  imdStationId = null,
  triggerMetrics = {},
  expiresAt = null,
}) {
  const alertId = `SKYRA-${Date.now()}`;
  const actionsList = recommendedActions.length > 0
    ? recommendedActions
    : [recommendedAction];

  const calculatedExpiresAt = expiresAt || calculateExpiry({
    sourceAuthority,
    priority,
    referenceDate: new Date(),
  });

  const fingerprint = generateAlertFingerprint({
    alertType: hazard,
    sourceAuthority,
    hazard,
    severity,
    latitude,
    longitude,
    imdStationId,
  });

  const alertDoc = {
    id: alertId,
    alertType: hazard,
    sourceAuthority,
    source: sourceAuthority === SOURCE_AUTHORITIES.OFFICIAL_ADVISORY
      ? `India Meteorological Department (IMD Station ${imdStationId || "Regional"})`
      : "SKYRA Automated Monitor",
    priority,
    severity,
    hazard,
    riskLevel,
    riskScore: Number(riskScore || 0),
    confidence: Number(confidence || calibratedConfidence || 0),
    calibratedConfidence: Number(calibratedConfidence || confidence || 0),
    impactSeverity,
    title,
    message,
    recommendedAction: actionsList[0] || "Monitor local conditions.",
    recommendedActions: actionsList,
    reason,
    location: location || monitoredLocation?.name || "Monitored Location",
    latitude: latitude != null ? Number(latitude) : (monitoredLocation?.latitude ?? null),
    longitude: longitude != null ? Number(longitude) : (monitoredLocation?.longitude ?? null),
    coordinates: (latitude != null && longitude != null)
      ? { type: "Point", coordinates: [Number(longitude), Number(latitude)] }
      : (monitoredLocation?.latitude != null && monitoredLocation?.longitude != null)
        ? { type: "Point", coordinates: [Number(monitoredLocation.longitude), Number(monitoredLocation.latitude)] }
        : undefined,
    imdStationId,
    fingerprint,
    occurrenceCount: 1,
    firstObservedAt: new Date(),
    lastObservedAt: new Date(),
    triggerMetrics,
    status: LIFECYCLE_STATUS.ACTIVE,
    expiresAt: calculatedExpiresAt,
    createdAt: new Date(),
  };

  activeAlert = alertDoc;
  alertHistory.unshift(alertDoc);

  if (alertHistory.length > 50) {
    alertHistory = alertHistory.slice(0, 50);
  }

  // Persist to MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await Alert.create(alertDoc);
      console.log(`💾 SKYRA alert [${alertDoc.id}] saved to MongoDB (expires: ${alertDoc.expiresAt.toISOString()})`);
    } catch (error) {
      console.error("❌ Failed to save alert to MongoDB:", error.message);
    }
  }

  console.log(`🚨 SKYRA ALERT [${alertDoc.priority} | ${alertDoc.sourceAuthority}] ${alertDoc.title} at ${alertDoc.location}`);
  return alertDoc;
}

/* ================================
   MONITORING CYCLE
=============================== */
async function runMonitoringCycle() {
  if (isCycleRunning) {
    console.log("ℹ️ [monitorService] Skipping cycle: previous cycle still in progress.");
    return;
  }

  if (!monitoredLocation || monitoredLocation.latitude == null || monitoredLocation.longitude == null) {
    // Zero coordinates: monitor remains in idle state, strictly NO Bhubaneswar fallback
    return;
  }

  isCycleRunning = true;

  try {
    const lat = monitoredLocation.latitude;
    const lon = monitoredLocation.longitude;
    const locName = monitoredLocation.name;

    // 1. Check if existing active alert is stale/expired
    if (activeAlert && isAlertStale(activeAlert)) {
      console.log(`⏱️ Active alert ${activeAlert.id} reached expiry; resolving/expiring.`);
      activeAlert.status = LIFECYCLE_STATUS.EXPIRED;
      if (mongoose.connection.readyState === 1) {
        try {
          await Alert.updateOne({ id: activeAlert.id }, { status: LIFECYCLE_STATUS.EXPIRED });
        } catch (_) {}
      }
      activeAlert = null;
    }

    // 2. Ingest live weather from centralized weatherService (or test override if configured)
    const weatherData = typeof _weatherFetcherOverride === "function"
      ? await _weatherFetcherOverride(lat, lon, locName)
      : await fetchWeather(lat, lon, locName);
    const current = weatherData?.current || {};
    const forecastData = weatherData?.forecast || {};
    const hourly = Array.isArray(forecastData.hourly) ? forecastData.hourly : [];

    // 3. Ingest terrain elevation and slope
    let terrainSlope = 0;
    let terrainData = null;
    try {
      terrainData = await fetchTerrainData(lat, lon);
      terrainSlope = terrainData.slope || 0;
    } catch (err) {
      console.warn(`[monitorService] Terrain fetch warning: ${err.message}`);
    }

    // 4. Ingest historical climate risk
    let historicalRisk = 20;
    let historicalRiskData = null;
    try {
      historicalRiskData = await fetchHistoricalRisk(lat, lon);
      historicalRisk = historicalRiskData.historicalRisk || 20;
    } catch (err) {
      console.warn(`[monitorService] Historical risk derivation warning: ${err.message}`);
    }

    // 5. Ingest official IMD advisories
    let imdData = null;
    try {
      imdData = await fetchIMDAdvisories(lat, lon);
    } catch (err) {
      console.warn(`[monitorService] IMD advisory ingestion warning: ${err.message}`);
      imdData = { available: false, reason: "FETCH_ERROR" };
    }

    // 6. Feature extraction for ML model
    const curRain = current.rainfall ?? current.rain ?? current.precipitation ?? 0;
    const curWind = current.windSpeed ?? current.wind_speed_10m ?? 0;
    const curHumidity = current.humidity ?? current.relative_humidity_2m ?? 65;
    const curTemp = current.temperature ?? current.temperature_2m ?? 28;
    const curPressure = current.pressure ?? current.surface_pressure ?? 1013;
    const forecastRain = forecastData.precipitationExpected ?? hourly[0]?.precipitation ?? 0;

    const extracted = extractFeatures({
      rainfall: curRain,
      forecastRainfall: forecastRain,
      humidity: curHumidity,
      windSpeed: curWind,
      historicalRisk,
      terrainSlope,
      temperature: curTemp,
      pressure: curPressure,
    });

    const inputs = {
      ...extracted.featureObject,
      featureVector: extracted.featureVector,
      location: locName,
    };

    // 7. Calculate ML risk
    const riskData = await calculateRisk(inputs);
    const riskScore = Number(riskData.riskScore || 0);
    const riskLevel = getRiskLevel(riskScore);
    const calibratedConfidence = Number(riskData.confidence || 0);

    // 8. Run impact assessment
    let impactResult = null;
    try {
      impactResult = assessImpact({
        featureObject: extracted.featureObject,
        riskData: { ...riskData, riskScore, riskLevel, confidence: calibratedConfidence },
        terrainData,
        historicalRiskData,
        location: { latitude: lat, longitude: lon, city: locName },
        forecastData,
      });
    } catch (err) {
      console.warn(`[monitorService] Impact assessment evaluation warning: ${err.message}`);
    }

    const impactSeverity = impactResult?.severity?.label || null;
    const resolvedHazard = impactResult?.hazard || (
      riskLevel === "Severe" ? "Severe Disaster Warning" :
      riskLevel === "High" ? "Severe Weather Risk" :
      riskLevel === "Moderate" ? "Moderate Weather Risk" : "Normal Conditions"
    );

    const triggerMetrics = {
      rainfall: curRain,
      windSpeed: curWind,
      humidity: curHumidity,
      temperature: curTemp,
      pressure: curPressure,
    };

    // ─── DECISION LOGIC: CANDIDATE EVALUATION ─────────────────────────────────
    let candidateAlert = null;

    // Check A: Official IMD Government Warning (Tier 1 Priority)
    const hasOfficialIMDWarning =
      imdData?.available &&
      imdData.advisory &&
      imdData.advisory.warningColor &&
      imdData.advisory.warningColor.toLowerCase() !== "green" &&
      imdData.advisory.warningLevel !== "No Warning";

    if (hasOfficialIMDWarning) {
      const adv = imdData.advisory;
      const priority = determinePriority({
        sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
        severity: adv.warningLevel || "Warning",
        riskLevel,
        riskScore,
        imdWarningColor: adv.warningColor,
        impactSeverity,
      });

      const expiry = calculateExpiry({
        sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
        imdAdvisory: adv,
        priority,
      });

      candidateAlert = {
        sourceAuthority: SOURCE_AUTHORITIES.OFFICIAL_ADVISORY,
        priority,
        severity: adv.warningLevel === "Warning" ? "Warning" : adv.warningLevel === "Watch" ? "Watch" : "Severe",
        hazard: adv.headline || "Official Weather Warning",
        riskLevel,
        riskScore,
        confidence: calibratedConfidence,
        calibratedConfidence,
        impactSeverity,
        title: `🇮🇳 IMD Official Warning: ${adv.headline || adv.warningColor + ' Advisory'}`,
        message: adv.bulletin || "Official weather advisory issued by India Meteorological Department.",
        recommendedAction: getAdvisory(inputs, riskLevel, adv.headline),
        recommendedActions: impactResult?.recommendedActions || [getAdvisory(inputs, riskLevel, adv.headline)],
        reason: `Official bulletin issued by IMD Station ${imdData.station?.name || imdData.station?.id || "Regional"} valid through ${adv.validTo ? new Date(adv.validTo).toLocaleTimeString() : "today"}.`,
        location: locName,
        latitude: lat,
        longitude: lon,
        imdStationId: imdData.station?.id || null,
        triggerMetrics,
        expiresAt: expiry,
      };
    } else {
      // Check B: Model-Estimated Risk or Observational Threshold
      const isHighOrSevere = riskLevel === "High" || riskLevel === "Severe";
      const isRapidEscalation = lastRiskScore !== null && (riskScore - lastRiskScore >= 15);
      const isExtremeObservational = curRain >= 40 || curWind >= 55;

      if (isHighOrSevere || isRapidEscalation || isExtremeObservational) {
        const priority = determinePriority({
          sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
          severity: riskLevel === "Severe" ? "Severe" : "Warning",
          riskLevel,
          riskScore,
          calibratedConfidence,
          impactSeverity,
          rainfall: curRain,
          windSpeed: curWind,
        });

        const reason = isRapidEscalation
          ? `Rapid risk escalation: score surged by ${riskScore - lastRiskScore} points to ${riskScore}/100.`
          : isExtremeObservational
          ? `Observational threshold exceeded: rain ${curRain}mm, wind ${curWind}km/h.`
          : `Model-estimated ${riskLevel} risk (${riskScore}/100 with ${calibratedConfidence}% confidence).`;

        const title = `SKYRA Model-Estimated ${riskLevel} Risk Alert: ${resolvedHazard}`;
        const advisoryText = getAdvisory(inputs, riskLevel, resolvedHazard);

        candidateAlert = {
          sourceAuthority: SOURCE_AUTHORITIES.MODEL_ESTIMATE,
          priority,
          severity: riskLevel === "Severe" ? "Severe" : "Warning",
          hazard: resolvedHazard,
          riskLevel,
          riskScore,
          confidence: calibratedConfidence,
          calibratedConfidence,
          impactSeverity,
          title,
          message: advisoryText,
          recommendedAction: advisoryText,
          recommendedActions: impactResult?.recommendedActions || [advisoryText],
          reason,
          location: locName,
          latitude: lat,
          longitude: lon,
          imdStationId: null,
          triggerMetrics,
        };
      }
    }

    // ─── DEDUPLICATION & ESCALATION HANDLING ─────────────────────────────────
    if (candidateAlert) {
      const candidateFingerprint = generateAlertFingerprint({
        alertType: candidateAlert.hazard,
        sourceAuthority: candidateAlert.sourceAuthority,
        hazard: candidateAlert.hazard,
        severity: candidateAlert.severity,
        latitude: lat,
        longitude: lon,
        imdStationId: candidateAlert.imdStationId,
      });

      const hasActive = activeAlert && (activeAlert.status === LIFECYCLE_STATUS.ACTIVE || activeAlert.status === LIFECYCLE_STATUS.ACKNOWLEDGED);

      if (hasActive && activeAlert.fingerprint === candidateFingerprint) {
        // Identical alert within cooldown: update metrics without creating duplicate doc
        if (isCooldownActive(activeAlert, DEFAULT_COOLDOWN_MS)) {
          activeAlert.occurrenceCount = (activeAlert.occurrenceCount || 1) + 1;
          activeAlert.lastObservedAt = new Date();
          activeAlert.triggerMetrics = triggerMetrics;
          activeAlert.riskScore = riskScore;
          activeAlert.confidence = calibratedConfidence;

          if (mongoose.connection.readyState === 1) {
            try {
              await Alert.updateOne(
                { id: activeAlert.id },
                {
                  $inc: { occurrenceCount: 1 },
                  $set: {
                    lastObservedAt: activeAlert.lastObservedAt,
                    triggerMetrics: activeAlert.triggerMetrics,
                    riskScore: activeAlert.riskScore,
                  },
                }
              );
            } catch (_) {}
          }
          console.log(`🔄 Deduplication: Alert [${activeAlert.id}] repeated cycle (${activeAlert.occurrenceCount}x within cooldown).`);
        } else {
          // Cooldown legitimately expired: generate fresh alert
          await createAlert(candidateAlert);
        }
      } else if (hasActive) {
        // Priority escalation (e.g. active is P3, candidate is P2 or P1): supersede previous
        const priorityRanks = { P4: 1, P3: 2, P2: 3, P1: 4 };
        const activeRank = priorityRanks[activeAlert.priority] || 0;
        const candidateRank = priorityRanks[candidateAlert.priority] || 0;

        if (candidateRank > activeRank) {
          console.log(`⚡ Alert Escalation: ${activeAlert.priority} -> ${candidateAlert.priority}. Superseding active alert.`);
          activeAlert.status = LIFECYCLE_STATUS.RESOLVED;
          activeAlert.resolvedAt = new Date();
          activeAlert.resolvedBy = "System Escalation";

          if (mongoose.connection.readyState === 1) {
            try {
              await Alert.updateOne(
                { id: activeAlert.id },
                { status: LIFECYCLE_STATUS.RESOLVED, resolvedAt: activeAlert.resolvedAt, resolvedBy: "System Escalation" }
              );
            } catch (_) {}
          }

          await createAlert(candidateAlert);
        } else {
          // Different hazard/source with equal or lower priority: allow creation
          await createAlert(candidateAlert);
        }
      } else {
        // No active alert: create immediately
        await createAlert(candidateAlert);
      }
    } else {
      // Check Auto-Resolution: conditions have normalized
      if (
        activeAlert &&
        activeAlert.status === LIFECYCLE_STATUS.ACTIVE &&
        activeAlert.sourceAuthority === SOURCE_AUTHORITIES.MODEL_ESTIMATE &&
        riskScore < 55 &&
        curRain < 15 &&
        curWind < 35
      ) {
        console.log(`✅ Risk normalized (score: ${riskScore}). Auto-resolving active model alert [${activeAlert.id}].`);
        activeAlert.status = LIFECYCLE_STATUS.RESOLVED;
        activeAlert.resolvedAt = new Date();
        activeAlert.resolvedBy = "System Auto-Resolution";

        if (mongoose.connection.readyState === 1) {
          try {
            await Alert.updateOne(
              { id: activeAlert.id },
              { status: LIFECYCLE_STATUS.RESOLVED, resolvedAt: activeAlert.resolvedAt, resolvedBy: "System Auto-Resolution" }
            );
          } catch (_) {}
        }
        activeAlert = null;
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
  } finally {
    isCycleRunning = false;
  }
}

/* ================================
   CONTROLLER MUTATIONS
=============================== */

/**
 * Acknowledges an alert by ID.
 * Survives page refresh and updates both memory and MongoDB.
 */
async function acknowledgeAlert(alertId, acknowledgedBy = "User") {
  if (!alertId || typeof alertId !== "string") {
    throw new Error("Valid alert ID string is required for acknowledgement.");
  }

  // Find in memory history or active
  let target = (activeAlert && activeAlert.id === alertId)
    ? activeAlert
    : alertHistory.find((a) => a.id === alertId);

  // If not found in memory, query MongoDB
  if (!target && mongoose.connection.readyState === 1) {
    target = await Alert.findOne({ id: alertId });
  }

  if (!target) {
    const err = new Error(`Alert with ID '${alertId}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  // Validate state machine transition
  const check = evaluateAlertLifecycleTransition(target.status, LIFECYCLE_STATUS.ACKNOWLEDGED);
  if (!check.valid) {
    const err = new Error(check.error || "Cannot acknowledge alert in current status.");
    err.statusCode = 400;
    throw err;
  }

  target.status = LIFECYCLE_STATUS.ACKNOWLEDGED;
  target.acknowledgedAt = new Date();
  target.acknowledgedBy = String(acknowledgedBy || "User").trim();

  // If this was activeAlert, keep it activeAlert but with Acknowledged status
  if (activeAlert && activeAlert.id === alertId) {
    activeAlert.status = LIFECYCLE_STATUS.ACKNOWLEDGED;
    activeAlert.acknowledgedAt = target.acknowledgedAt;
    activeAlert.acknowledgedBy = target.acknowledgedBy;
  }

  if (mongoose.connection.readyState === 1) {
    await Alert.updateOne(
      { id: alertId },
      {
        $set: {
          status: LIFECYCLE_STATUS.ACKNOWLEDGED,
          acknowledgedAt: target.acknowledgedAt,
          acknowledgedBy: target.acknowledgedBy,
        },
      }
    );
  }

  console.log(`✅ Alert [${alertId}] acknowledged by ${target.acknowledgedBy} at ${target.acknowledgedAt.toISOString()}`);
  return target;
}

/**
 * Resolves an alert by ID.
 */
async function resolveAlert(alertId, resolvedBy = "User", reason = "Manual resolution") {
  if (!alertId || typeof alertId !== "string") {
    throw new Error("Valid alert ID string is required for resolution.");
  }

  let target = (activeAlert && activeAlert.id === alertId)
    ? activeAlert
    : alertHistory.find((a) => a.id === alertId);

  if (!target && mongoose.connection.readyState === 1) {
    target = await Alert.findOne({ id: alertId });
  }

  if (!target) {
    const err = new Error(`Alert with ID '${alertId}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  const check = evaluateAlertLifecycleTransition(target.status, LIFECYCLE_STATUS.RESOLVED);
  if (!check.valid) {
    const err = new Error(check.error || "Cannot resolve alert in current status.");
    err.statusCode = 400;
    throw err;
  }

  target.status = LIFECYCLE_STATUS.RESOLVED;
  target.resolvedAt = new Date();
  target.resolvedBy = String(resolvedBy || "User").trim();
  target.reason = `${target.reason || ""} | Resolved: ${reason}`.trim();

  if (activeAlert && activeAlert.id === alertId) {
    activeAlert = null;
  }

  if (mongoose.connection.readyState === 1) {
    await Alert.updateOne(
      { id: alertId },
      {
        $set: {
          status: LIFECYCLE_STATUS.RESOLVED,
          resolvedAt: target.resolvedAt,
          resolvedBy: target.resolvedBy,
          reason: target.reason,
        },
      }
    );
  }

  console.log(`✅ Alert [${alertId}] resolved by ${target.resolvedBy}`);
  return target;
}

/* ================================
   CONTROLS & LIFECYCLE HOOKS
=============================== */

function startMonitoring() {
  if (monitorTimer) return;
  console.log("🚀 SKYRA continuous monitoring started");
  if (monitoredLocation) {
    runMonitoringCycle();
  } else {
    console.log("ℹ️ [SKYRA Monitor] Monitoring idle: no location configured yet. Set a location via setMonitoredLocation().");
  }
  monitorTimer = setInterval(runMonitoringCycle, MONITOR_INTERVAL);
}

function stopMonitoring() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

async function setMonitoredLocation(latitude, longitude, name = "Monitored Location") {
  if (latitude == null || longitude == null) {
    monitoredLocation = null;
    activeAlert = null;
    lastRiskScore = null;
    lastRiskLevel = null;
    console.log("ℹ️ [SKYRA Monitor] Monitoring location cleared; monitor returned to idle.");
    return null;
  }
  const coords = validateCoordinates(latitude, longitude);
  const newName = (name && String(name).trim()) || "Monitored Location";

  const isLocationChanged = !monitoredLocation ||
    monitoredLocation.latitude !== coords.latitude ||
    monitoredLocation.longitude !== coords.longitude ||
    monitoredLocation.name !== newName;

  monitoredLocation = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    name: newName,
  };

  if (isLocationChanged) {
    lastRiskScore = null;
    lastRiskLevel = null;
    if (activeAlert && activeAlert.location !== newName) {
      activeAlert = null;
    }
  }

  console.log(`📍 [SKYRA Monitor] Monitored location set to: ${monitoredLocation.name} (${coords.latitude}, ${coords.longitude})`);
  return await runMonitoringCycle();
}

function getMonitoredLocation() {
  return monitoredLocation ? { ...monitoredLocation } : null;
}

function getActiveAlert() {
  if (activeAlert && isAlertStale(activeAlert)) {
    activeAlert.status = LIFECYCLE_STATUS.EXPIRED;
    activeAlert = null;
  }
  return activeAlert;
}

function getAlertHistory() {
  return alertHistory;
}

function _setWeatherFetcherOverride(fn) {
  _weatherFetcherOverride = fn;
}

// Test helper to reset internal monitor state between test cases
function _resetMonitorState() {
  monitoredLocation = null;
  activeAlert = null;
  alertHistory = [];
  lastRiskScore = null;
  lastRiskLevel = null;
  isCycleRunning = false;
  _weatherFetcherOverride = null;
}

module.exports = {
  initializeAlerts,
  startMonitoring,
  stopMonitoring,
  runMonitoringCycle,
  setMonitoredLocation,
  getMonitoredLocation,
  getActiveAlert,
  getAlertHistory,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  getRiskLevel,
  getRiskRank,
  _resetMonitorState,
  _setWeatherFetcherOverride,
};
