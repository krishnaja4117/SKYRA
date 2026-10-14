/**
 * SKYRA – Risk Inference Engine & Safe Fallback Router (Phase 5 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates ML-based risk inference against the Python microservice and
 * routes to deterministic physics-based rules upon failure.
 *
 * Guarantees:
 *   • Safe fail-fast timeout (6 seconds) with abort signal
 *   • Validates ML service responses (riskLevel, riskScore [0,100], confidence [0,100])
 *   • Truthful fallback flag: isFallback=false for ML, isFallback=true for heuristics
 *   • Explicit model attribution: "RandomForest ML Service" vs "Heuristic Fallback Engine"
 *   • Distinguishes Risk Score (weighted severity) from Confidence (voting agreement)
 */

const env = require("../config/env");
const { generateXaiExplanation } = require("./xaiService");

const VALID_RISK_LEVELS = Object.freeze(["Low", "Moderate", "High", "Severe"]);

/**
 * Fallback risk calculator used when the Python ML microservice is unreachable,
 * times out, or produces a malformed output.
 *
 * @param {Object} inputs - 8 validated features
 * @returns {Object} Fallback risk assessment with isFallback=true
 */
function calculateFallbackRisk(inputs) {
  const rainfall = Number(inputs.rainfall || 0);
  const forecastRainfall = Number(inputs.forecastRainfall || 0);
  const windSpeed = Number(inputs.windSpeed || 0);
  const humidity = Number(inputs.humidity || 50);

  let score = 20; // baseline Low
  if (rainfall >= 50 || forecastRainfall >= 50 || windSpeed >= 70) {
    score = 85; // Severe
  } else if (rainfall >= 25 || forecastRainfall >= 30 || windSpeed >= 50) {
    score = 72; // High
  } else if (rainfall >= 10 || forecastRainfall >= 15 || windSpeed >= 30 || humidity >= 85) {
    score = 48; // Moderate
  }

  // Cross-validate with INSAT satellite remote sensing if available
  const satRain = Number(inputs.satelliteRainfallRate || 0);
  const satCtt = inputs.satelliteCloudTopTemp != null ? Number(inputs.satelliteCloudTopTemp) : null;
  if (satRain >= 25 || (satCtt !== null && satCtt <= 215)) {
    score = Math.max(score, 75); // Intense convective storm cell detected by INSAT
  } else if (satRain >= 10 || (satCtt !== null && satCtt <= 230)) {
    score = Math.max(score, 55); // Active convective rain band detected by INSAT
  }

  let riskLevel = "Low";
  if (score >= 80) riskLevel = "Severe";
  else if (score >= 70) riskLevel = "High";
  else if (score >= 40) riskLevel = "Moderate";

  const xai = generateXaiExplanation({
    riskData: {
      riskLevel,
      riskScore: score,
      confidence: 80,
      confidenceType: "HEURISTIC",
      calibrationMethod: null,
      model: "Heuristic Fallback Engine",
      isFallback: true,
    },
    featureObject: inputs,
    isFallback: true,
  });

  const factors = xai.riskFactors.length > 0
    ? xai.riskFactors.map((rf) => ({
        name: rf.displayName,
        impact: rf.contribution >= 20 ? "High" : "Moderate",
        detail: `${rf.displayName} is ${rf.inputValue} ${rf.unit}, contributing +${rf.contribution.toFixed(1)} pts to predicted risk.`,
      }))
    : [{ name: "Baseline Weather", impact: "Low", detail: "Conditions within normal bounds." }];

  if (satRain >= 10 || (satCtt !== null && satCtt <= 230)) {
    factors.unshift({
      name: "INSAT Satellite Telemetry",
      impact: satRain >= 25 || (satCtt !== null && satCtt <= 215) ? "High" : "Moderate",
      detail: `Satellite remote sensing observes convective storm activity (CTT: ${satCtt ?? "N/A"} K, HEM rain rate: ${satRain} mm/h).`,
    });
  }

  return {
    riskLevel,
    riskScore: score,
    confidence: 80, // Heuristic baseline confidence (uncalibrated)
    confidenceType: "HEURISTIC",
    calibrationMethod: null,
    explanation: xai.whyThisRisk,
    factors,
    model: "Heuristic Fallback Engine",
    modelVersion: "2.0.0",
    datasetVersion: "N/A (Heuristic Rules)",
    isFallback: true,
    xai,
  };
}

/**
 * Executes ML-based risk assessment via Python microservice with validation & fallback.
 *
 * @param {Object} inputs - 8 features
 * @param {Object} [options]
 * @param {Function} [options.fetcherOverride] - Test hook
 * @returns {Promise<Object>} Evaluated risk payload with explicit isFallback flag
 */
async function calculateRisk(inputs, options = {}) {
  const mlUrl = `${env.mlServiceUrl}/predict`;

  try {
    let data;

    if (typeof options.fetcherOverride === "function") {
      data = await options.fetcherOverride(inputs);
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(mlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(inputs),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`[SKYRA RiskEngine] ML service HTTP ${response.status}: ${text}`);
        return calculateFallbackRisk(inputs);
      }

      data = await response.json();
    }

    // Validate ML service response structure and numerical bounds
    if (
      !data ||
      typeof data !== "object" ||
      !VALID_RISK_LEVELS.includes(data.riskLevel) ||
      typeof data.riskScore !== "number" ||
      !Number.isFinite(data.riskScore) ||
      data.riskScore < 0 ||
      data.riskScore > 100 ||
      typeof data.confidence !== "number" ||
      !Number.isFinite(data.confidence) ||
      data.confidence < 0 ||
      data.confidence > 100
    ) {
      console.warn("[SKYRA RiskEngine] Malformed ML response payload. Routing to heuristic engine.");
      return calculateFallbackRisk(inputs);
    }

    const xai = generateXaiExplanation({
      riskData: data,
      featureObject: inputs,
      isFallback: false,
    });

    return {
      riskLevel: data.riskLevel,
      riskScore: Math.round(data.riskScore),
      confidence: Math.round(data.confidence),
      confidenceType: data.confidenceType || "CALIBRATED",
      calibrationMethod: data.calibrationMethod || "Platt Sigmoid (5-fold Cross-Validation)",
      explanation: xai.whyThisRisk || data.explanation || `Classified as ${data.riskLevel} risk with score of ${Math.round(data.riskScore)}%.`,
      factors: Array.isArray(data.factors) && data.factors.length > 0 ? data.factors : (xai.riskFactors.map((rf) => ({
        name: rf.displayName,
        impact: rf.contribution >= 10 ? "High" : "Moderate",
        detail: `${rf.displayName} is ${rf.inputValue} ${rf.unit}, contributing +${rf.contribution.toFixed(1)} pts to predicted risk.`,
      }))),
      model: data.model || "Calibrated RandomForestClassifier (Port 8000)",
      modelVersion: data.modelVersion || "2.0.0",
      datasetVersion: data.datasetVersion || "ERA5-MultiCity-2021-2023",
      isFallback: false,
      xai,
    };
  } catch (error) {
    console.warn(`[SKYRA RiskEngine] ML service unreachable (${error.message}). Routing to heuristic engine.`);
    return calculateFallbackRisk(inputs);
  }
}

module.exports = {
  calculateRisk,
  calculateFallbackRisk,
  VALID_RISK_LEVELS,
};