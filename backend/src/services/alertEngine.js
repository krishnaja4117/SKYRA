/**
 * SKYRA – Alert Decision & Deduplication Engine (Phase 12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative, pure deterministic logic for:
 *   • SHA-256 Alert Fingerprinting & Spatial Hashing
 *   • Priority Rating (P1 Emergency, P2 Warning, P3 Watch, P4 Advisory)
 *   • Source Authority Classification & Anti-Fabrication Guarantees
 *   • Dynamic Expiration Calculation
 *   • Strict Lifecycle State-Machine Validation
 *   • Deduplication & Cooldown Tracking
 *
 * Guarantees:
 *   • ZERO synthetic government warnings; official advisories retain true provenance.
 *   • Model estimates explicitly identified with calibrated confidence ratings.
 *   • No timestamp variables included in cryptographic fingerprint.
 *   • Strict state-machine transitions: Active -> Acknowledged/Resolved/Expired.
 */

const crypto = require("crypto");

// ─── SOURCE AUTHORITIES ───────────────────────────────────────────────────────
const SOURCE_AUTHORITIES = Object.freeze({
  OFFICIAL_ADVISORY: "OFFICIAL_ADVISORY",
  EMERGENCY_SYSTEM: "EMERGENCY_SYSTEM",
  MODEL_ESTIMATE: "MODEL_ESTIMATE",
  OBSERVATION: "OBSERVATION",
});

// ─── PRIORITIES ───────────────────────────────────────────────────────────────
const PRIORITIES = Object.freeze({
  P1: "P1", // EMERGENCY
  P2: "P2", // WARNING
  P3: "P3", // WATCH
  P4: "P4", // ADVISORY
});

// ─── LIFECYCLE STATES ─────────────────────────────────────────────────────────
const LIFECYCLE_STATUS = Object.freeze({
  ACTIVE: "Active",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved",
  EXPIRED: "Expired",
});

// ─── DEFAULT COOLDOWN ─────────────────────────────────────────────────────────
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes cooldown window

/**
 * Computes deterministic SHA-256 fingerprint for deduplication.
 * Timestamps are strictly excluded to ensure repeated identical hazards produce identical hashes.
 * Spatial coordinates are bucketed to 2 decimal places (~1.1 km precision).
 */
function generateAlertFingerprint({
  alertType = "Weather Hazard",
  sourceAuthority = SOURCE_AUTHORITIES.MODEL_ESTIMATE,
  hazard = "General Weather",
  severity = "Warning",
  latitude,
  longitude,
  imdStationId = "",
} = {}) {
  const normLat = latitude != null && Number.isFinite(Number(latitude))
    ? Number(latitude).toFixed(2)
    : "0.00";
  const normLon = longitude != null && Number.isFinite(Number(longitude))
    ? Number(longitude).toFixed(2)
    : "0.00";

  const normType = String(alertType || "").trim().toLowerCase();
  const normSource = String(sourceAuthority || "").trim().toUpperCase();
  const normHazard = String(hazard || "").trim().toLowerCase();
  const normSeverity = String(severity || "").trim().toLowerCase();
  const normStation = String(imdStationId || "").trim();

  const rawKey = `${normType}|${normSource}|${normHazard}|${normSeverity}|${normLat},${normLon}|${normStation}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Deterministically derives alert priority (P1, P2, P3, P4) based on actual available evidence.
 *
 * Rules:
 *   • Official IMD Red warning -> P1 (EMERGENCY)
 *   • Official IMD Orange warning -> P2 (WARNING)
 *   • Official IMD Yellow warning -> P2 (if ML High/Severe) or P3 (WATCH)
 *   • Severe ML risk (score >= 80) -> P1 if calibratedConfidence >= 70 AND high impact/rain/wind, else P2
 *   • High ML risk (score 70-79) -> P2 if calibratedConfidence >= 65, else downgraded to P3 with uncertainty label
 *   • Moderate ML risk (score 40-69) -> P3 (WATCH)
 *   • Low ML risk (< 40) -> P4 (ADVISORY)
 */
function determinePriority({
  sourceAuthority = SOURCE_AUTHORITIES.MODEL_ESTIMATE,
  severity = "Warning",
  riskLevel = "Moderate",
  riskScore = 50,
  calibratedConfidence = 0,
  imdWarningColor = null,
  impactSeverity = null,
  rainfall = 0,
  windSpeed = 0,
} = {}) {
  const score = Number(riskScore || 0);
  const conf = Number(calibratedConfidence || 0);
  const rain = Number(rainfall || 0);
  const wind = Number(windSpeed || 0);
  const normColor = imdWarningColor ? String(imdWarningColor).trim().toLowerCase() : null;

  // 1. Official Government IMD Warnings take precedence
  if (sourceAuthority === SOURCE_AUTHORITIES.OFFICIAL_ADVISORY) {
    if (normColor === "red") return PRIORITIES.P1;
    if (normColor === "orange") return PRIORITIES.P2;
    if (normColor === "yellow") {
      return (riskLevel === "High" || riskLevel === "Severe") ? PRIORITIES.P2 : PRIORITIES.P3;
    }
    if (normColor === "green") return PRIORITIES.P4;
  }

  // 2. Emergency System Directives
  if (severity === "Emergency" || sourceAuthority === SOURCE_AUTHORITIES.EMERGENCY_SYSTEM) {
    return PRIORITIES.P1;
  }

  // 3. Model-Estimated & Observational Priority Matrix
  if (riskLevel === "Severe" || score >= 80) {
    const isCriticalImpact = impactSeverity === "Critical" || impactSeverity === "Severe";
    const isExtremeMetrics = rain >= 50 || wind >= 60;
    if (conf >= 70 && (isCriticalImpact || isExtremeMetrics)) {
      return PRIORITIES.P1;
    }
    return PRIORITIES.P2;
  }

  if (riskLevel === "High" || (score >= 70 && score < 80)) {
    // If confidence is high enough (>=65%), rank as P2 Warning.
    // If confidence is low (<65%), downgrade to P3 Watch to avoid false panic.
    if (conf >= 65) {
      return PRIORITIES.P2;
    }
    return PRIORITIES.P3;
  }

  if (riskLevel === "Moderate" || (score >= 40 && score < 70)) {
    return PRIORITIES.P3;
  }

  return PRIORITIES.P4;
}

/**
 * Computes realistic expiration date based on source authority and priority.
 * Never defaults to null, ensuring all generated alerts participate in TTL cleanup.
 */
function calculateExpiry({
  sourceAuthority = SOURCE_AUTHORITIES.MODEL_ESTIMATE,
  imdAdvisory = null,
  priority = PRIORITIES.P3,
  referenceDate = new Date(),
} = {}) {
  const refTime = referenceDate instanceof Date ? referenceDate.getTime() : Date.now();

  // If official IMD advisory provides validTo, use it
  if (sourceAuthority === SOURCE_AUTHORITIES.OFFICIAL_ADVISORY && imdAdvisory?.validTo) {
    const parsedValidTo = new Date(imdAdvisory.validTo);
    if (!Number.isNaN(parsedValidTo.getTime()) && parsedValidTo.getTime() > refTime) {
      return parsedValidTo;
    }
  }

  // Model-Estimated & Observational TTL lifetimes based on alert priority
  let lifetimeMs;
  switch (priority) {
    case PRIORITIES.P1: // Emergency: short 3-hour operational re-check window
      lifetimeMs = 3 * 60 * 60 * 1000;
      break;
    case PRIORITIES.P2: // Warning: 4 hours
      lifetimeMs = 4 * 60 * 60 * 1000;
      break;
    case PRIORITIES.P3: // Watch: 6 hours
      lifetimeMs = 6 * 60 * 60 * 1000;
      break;
    case PRIORITIES.P4: // Advisory: 12 hours
    default:
      lifetimeMs = 12 * 60 * 60 * 1000;
      break;
  }

  return new Date(refTime + lifetimeMs);
}

/**
 * Evaluates whether a proposed lifecycle state transition is legally permitted.
 *
 * Allowed:
 *   Active -> Acknowledged, Resolved, Expired
 *   Acknowledged -> Resolved, Expired
 *
 * Forbidden:
 *   Resolved -> Active, Acknowledged, Expired
 *   Expired -> Active, Acknowledged, Resolved
 */
function evaluateAlertLifecycleTransition(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) {
    return { valid: true, noop: true, message: `Alert is already in '${currentStatus}' status.` };
  }

  if (currentStatus === LIFECYCLE_STATUS.RESOLVED) {
    return {
      valid: false,
      error: `Invalid transition: alert is already Resolved and cannot transition to '${targetStatus}'. A new alert must be generated.`,
    };
  }

  if (currentStatus === LIFECYCLE_STATUS.EXPIRED) {
    return {
      valid: false,
      error: `Invalid transition: alert is already Expired and cannot transition to '${targetStatus}'. A new alert must be generated.`,
    };
  }

  if (currentStatus === LIFECYCLE_STATUS.ACTIVE) {
    if (
      targetStatus === LIFECYCLE_STATUS.ACKNOWLEDGED ||
      targetStatus === LIFECYCLE_STATUS.RESOLVED ||
      targetStatus === LIFECYCLE_STATUS.EXPIRED
    ) {
      return { valid: true };
    }
  }

  if (currentStatus === LIFECYCLE_STATUS.ACKNOWLEDGED) {
    if (
      targetStatus === LIFECYCLE_STATUS.RESOLVED ||
      targetStatus === LIFECYCLE_STATUS.EXPIRED
    ) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    error: `Illegal lifecycle transition requested: '${currentStatus}' -> '${targetStatus}'.`,
  };
}

/**
 * Checks if an alert has passed its expiration time.
 */
function isAlertStale(alert, now = new Date()) {
  if (!alert) return true;
  if (alert.status === LIFECYCLE_STATUS.RESOLVED || alert.status === LIFECYCLE_STATUS.EXPIRED) {
    return true;
  }
  if (!alert.expiresAt) return false;
  const expTime = new Date(alert.expiresAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : Date.now();
  return expTime <= currentTime;
}

/**
 * Evaluates whether an identical alert fingerprint is still within its active cooldown period.
 */
function isCooldownActive(alert, cooldownMs = DEFAULT_COOLDOWN_MS, now = new Date()) {
  if (!alert || alert.status !== LIFECYCLE_STATUS.ACTIVE && alert.status !== LIFECYCLE_STATUS.ACKNOWLEDGED) {
    return false;
  }
  const lastObserved = new Date(alert.lastObservedAt || alert.createdAt || 0).getTime();
  const currentTime = now instanceof Date ? now.getTime() : Date.now();
  return (currentTime - lastObserved) < cooldownMs;
}

module.exports = {
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
};
