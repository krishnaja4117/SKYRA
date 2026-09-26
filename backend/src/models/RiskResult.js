/**
 * SKYRA – Risk Result Model (Phase 4 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mongoose persistence schema for storing evaluated meteorological risk
 * assessments, ML inferences, feature snapshots, and explainable AI outputs.
 *
 * Design Guarantees:
 *   • Traceable: Stores exact input features, model name/version, and explanations
 *   • Geospatial: GeoJSON Point [longitude, latitude] with 2dsphere index
 *   • Non-colliding: Historical assessments are time-indexed and never overwrite newer ones
 *   • Non-blocking: Safe for offline degradation when MongoDB is disconnected
 *   • Strict validation: Numeric bounds, risk scores [0, 100], and enum constraints
 */

const mongoose = require("mongoose");

const riskFactorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    impact: { type: String, enum: ["Low", "Moderate", "High", "Critical"], default: "Low" },
    detail: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const riskResultSchema = new mongoose.Schema(
  {
    // Location details
    location: {
      displayName: { type: String, default: "Monitored Location", trim: true },
      city: { type: String, default: null, trim: true },
      region: { type: String, default: null, trim: true },
      country: { type: String, default: "India", trim: true },
      latitude: {
        type: Number,
        required: true,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        required: true,
        min: -180,
        max: 180,
      },
    },

    // GeoJSON Point for geospatial queries (e.g. risks in a bounding box or radius)
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: function (coords) {
            if (!Array.isArray(coords) || coords.length !== 2) return false;
            const [lon, lat] = coords;
            return (
              Number.isFinite(lon) &&
              Number.isFinite(lat) &&
              lon >= -180 &&
              lon <= 180 &&
              lat >= -90 &&
              lat <= 90
            );
          },
          message: "coordinates must be [longitude, latitude] within valid WGS-84 ranges",
        },
      },
    },

    // Evaluation timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },

    // Risk classification
    riskLevel: {
      type: String,
      enum: ["Low", "Moderate", "High", "Severe"],
      required: true,
      index: true,
    },

    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    confidence: {
      type: Number,
      default: 85,
      min: 0,
      max: 100,
    },

    hazard: {
      type: String,
      default: "No Significant Hazard",
      trim: true,
    },

    impactLevel: {
      type: String,
      enum: ["Advisory", "Watch", "Warning", "Severe", "Emergency"],
      default: "Advisory",
    },

    // Model and inference provenance
    model: {
      type: String,
      default: "RandomForest ML Service",
      trim: true,
    },

    modelVersion: {
      type: String,
      default: "2.0.0",
      trim: true,
    },

    datasetVersion: {
      type: String,
      default: "ERA5-MultiCity-2021-2023",
      trim: true,
    },

    confidenceType: {
      type: String,
      enum: ["CALIBRATED", "UNCALIBRATED", "HEURISTIC"],
      default: "CALIBRATED",
    },

    calibrationMethod: {
      type: String,
      default: null,
      trim: true,
    },

    isFallback: {
      type: Boolean,
      default: false,
    },

    // Exact input features snapshot used for inference (strict 8-feature order)
    inputs: {
      rainfall: { type: Number, required: true, min: 0 },
      forecastRainfall: { type: Number, required: true, min: 0 },
      humidity: { type: Number, required: true, min: 0, max: 100 },
      windSpeed: { type: Number, required: true, min: 0 },
      historicalRisk: { type: Number, required: true, min: 0, max: 100 },
      terrainSlope: { type: Number, required: true, min: 0, max: 90 },
      temperature: { type: Number, required: true, min: -100, max: 100 },
      pressure: { type: Number, required: true, min: 300, max: 1200 },
    },

    featureVector: {
      type: [Number],
      default: undefined,
    },

    // Explainable AI & rationale
    factors: {
      type: [riskFactorSchema],
      default: [],
    },

    explanation: {
      type: String,
      default: "",
      trim: true,
    },

    // Provenance details
    provenance: {
      weatherSource: { type: String, default: "Open-Meteo API" },
      retrievedAt: { type: Date, default: Date.now },
      executionDurationMs: { type: Number, default: 0 },
    },

    // Retention policy: null = permanent retention for historical auditing
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "risk_results",
    timestamps: true,
  }
);

// ─── Pre-validation Hook ───────────────────────────────────────────────────────
// Automatically synchronizes GeoJSON [longitude, latitude] with location.latitude/longitude
riskResultSchema.pre("validate", function () {
  if (
    this.location &&
    this.location.latitude != null &&
    this.location.longitude != null &&
    (!this.coordinates || !this.coordinates.coordinates || this.coordinates.coordinates.length === 0)
  ) {
    this.coordinates = {
      type: "Point",
      coordinates: [Number(this.location.longitude), Number(this.location.latitude)], // GeoJSON order: [lon, lat]
    };
  }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// 1. Geospatial index for radius & spatial queries
riskResultSchema.index({ coordinates: "2dsphere" });

// 2. Compound index for location-specific chronological queries (fetch latest risk for city)
riskResultSchema.index({ "location.latitude": 1, "location.longitude": 1, timestamp: -1 });

// 3. Operational query index for high/severe risk filtering
riskResultSchema.index({ riskLevel: 1, timestamp: -1 });

// 4. Chronological audit index
riskResultSchema.index({ timestamp: -1 });

// 5. Optional TTL retention (only applies if expiresAt is explicitly set)
riskResultSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  }
);

module.exports = mongoose.model("RiskResult", riskResultSchema);
