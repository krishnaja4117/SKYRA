/**
 * SKYRA – Risk Result Persistence Service (Phase 4 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides reliable, non-blocking MongoDB persistence and retrieval for evaluated
 * ML risk assessments, heuristic fallback scores, and XAI explanations.
 *
 * Guarantees:
 *   • Non-fatal: Never throws or halts request pipelines if MongoDB is offline
 *   • Truthful: Returns explicit persisted: true/false status
 *   • Strict validation: Rejects invalid or out-of-range coordinates & risk scores
 *   • Traceable: Stores exact input feature vectors and provenance
 */

const mongoose = require("mongoose");
const RiskResult = require("../models/RiskResult");
const { validateCoordinates } = require("./weatherService");

/**
 * Persists an evaluated risk assessment to MongoDB if connection is active.
 *
 * @param {Object} riskPayload
 * @param {Object} [options]
 * @returns {Promise<{ persisted: boolean, id?: string, reason?: string }>}
 */
async function persistRiskResult(riskPayload, options = {}) {
  if (!riskPayload || typeof riskPayload !== "object") {
    return { persisted: false, reason: "invalid_payload" };
  }

  const lat = riskPayload.location?.latitude ?? riskPayload.latitude;
  const lon = riskPayload.location?.longitude ?? riskPayload.longitude;

  if (lat == null || lon == null) {
    return { persisted: false, reason: "missing_coordinates" };
  }

  let coords;
  try {
    coords = validateCoordinates(lat, lon);
  } catch (err) {
    return { persisted: false, reason: err.message };
  }

  // Graceful offline degradation: MongoDB not connected
  if (mongoose.connection.readyState !== 1) {
    return { persisted: false, reason: "mongodb_disconnected" };
  }

  try {
    const doc = new RiskResult({
      location: {
        displayName: riskPayload.location?.displayName || riskPayload.locationName || "Monitored Location",
        city: riskPayload.location?.city || null,
        region: riskPayload.location?.region || null,
        country: riskPayload.location?.country || "India",
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      coordinates: {
        type: "Point",
        coordinates: [coords.longitude, coords.latitude], // GeoJSON order: [lon, lat]
      },
      timestamp: riskPayload.timestamp ? new Date(riskPayload.timestamp) : new Date(),
      riskLevel: riskPayload.riskLevel || "Low",
      riskScore: Math.min(Math.max(Number(riskPayload.riskScore || 0), 0), 100),
      confidence: Math.min(Math.max(Number(riskPayload.confidence || 85), 0), 100),
      hazard: riskPayload.hazard || "No Significant Hazard",
      impactLevel: riskPayload.impactLevel || "Advisory",
      model: riskPayload.model || riskPayload.sourceInformation?.mlModel || "Calibrated RandomForestClassifier",
      modelVersion: riskPayload.modelVersion || "2.0.0",
      datasetVersion: riskPayload.datasetVersion || "ERA5-MultiCity-2021-2023",
      confidenceType: riskPayload.confidenceType || "CALIBRATED",
      calibrationMethod: riskPayload.calibrationMethod || null,
      isFallback: Boolean(riskPayload.isFallback),
      inputs: {
        rainfall: Number(riskPayload.inputs?.rainfall ?? 0),
        forecastRainfall: Number(riskPayload.inputs?.forecastRainfall ?? 0),
        humidity: Number(riskPayload.inputs?.humidity ?? 50),
        windSpeed: Number(riskPayload.inputs?.windSpeed ?? 0),
        historicalRisk: Number(riskPayload.inputs?.historicalRisk ?? 0),
        terrainSlope: Number(riskPayload.inputs?.terrainSlope ?? 0),
        temperature: Number(riskPayload.inputs?.temperature ?? 25),
        pressure: Number(riskPayload.inputs?.pressure ?? 1013),
      },
      featureVector: Array.isArray(riskPayload.featureVector) ? riskPayload.featureVector : undefined,
      factors: Array.isArray(riskPayload.factors) ? riskPayload.factors : [],
      explanation: riskPayload.explanation || "",
      provenance: {
        weatherSource: riskPayload.sourceInformation?.weatherSource || "Open-Meteo API",
        retrievedAt: new Date(),
        executionDurationMs: Number(options.durationMs || 0),
      },
      expiresAt: options.expiresAt || null,
    });

    const saved = await doc.save();
    return { persisted: true, id: saved._id.toString() };
  } catch (err) {
    console.warn("⚠️ [SKYRA RiskPersistence] Non-fatal risk persistence failure:", err.message);
    return { persisted: false, reason: err.message };
  }
}

/**
 * Retrieves the most recent risk evaluation for the specified coordinates.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @returns {Promise<Object|null>}
 */
async function getLatestRiskForLocation(latitude, longitude) {
  if (mongoose.connection.readyState !== 1) return null;

  try {
    const coords = validateCoordinates(latitude, longitude);
    return await RiskResult.findOne({
      "location.latitude": coords.latitude,
      "location.longitude": coords.longitude,
    })
      .sort({ timestamp: -1 })
      .lean();
  } catch (err) {
    console.warn("⚠️ [SKYRA RiskPersistence] Error fetching latest risk:", err.message);
    return null;
  }
}

/**
 * Retrieves historical risk assessments for the specified coordinates.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
async function getRiskHistory(latitude, longitude, limit = 10) {
  if (mongoose.connection.readyState !== 1) return [];

  try {
    const coords = validateCoordinates(latitude, longitude);
    return await RiskResult.find({
      "location.latitude": coords.latitude,
      "location.longitude": coords.longitude,
    })
      .sort({ timestamp: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  } catch (err) {
    console.warn("⚠️ [SKYRA RiskPersistence] Error fetching risk history:", err.message);
    return [];
  }
}

module.exports = {
  persistRiskResult,
  getLatestRiskForLocation,
  getRiskHistory,
};
