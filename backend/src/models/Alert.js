/**
 * SKYRA – Alert Model (Phase 4 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mongoose persistence schema for automated meteorological alerts and
 * impact warnings.
 *
 * Design Guarantees:
 *   • Traceable: Preserves risk result reference, source, triggers, and lifecycle
 *   • Geospatial: GeoJSON Point [longitude, latitude] with 2dsphere indexing
 *   • Strict validation: Numeric bounds, enumerated severity, and ISO timestamps
 *   • Backward compatible: Supports legacy fields used across Phase 1-3
 *   • Lifecycle ready: Status tracking (Active, Acknowledged, Resolved, Expired)
 */

const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    // Unique business identifier for the alert
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Alert classification
    alertType: {
      type: String,
      default: function () {
        return this.hazard || "Weather Hazard";
      },
      trim: true,
    },

    severity: {
      type: String,
      enum: ["Low", "Moderate", "Watch", "High", "Warning", "Severe", "Emergency"],
      default: function () {
        return this.riskLevel || "Warning";
      },
    },

    riskLevel: {
      type: String,
      required: true,
      trim: true,
    },

    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    hazard: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    recommendedAction: {
      type: String,
      required: true,
      trim: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    // Trigger metadata for audit and XAI traceability
    triggerMetrics: {
      rainfall: { type: Number, default: null },
      windSpeed: { type: Number, default: null },
      humidity: { type: Number, default: null },
      temperature: { type: Number, default: null },
      pressure: { type: Number, default: null },
    },

    // Location details
    location: {
      type: String,
      default: "Current location",
      trim: true,
    },

    latitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null,
    },

    longitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null,
    },

    // GeoJSON Point for geospatial queries (e.g. alerts within 50km radius)
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function (coords) {
            if (!coords || coords.length === 0) return true; // Optional if coordinates not supplied
            if (coords.length !== 2) return false;
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

    // Traceability reference to RiskResult model
    riskResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RiskResult",
      default: null,
    },

    // Source provenance
    source: {
      type: String,
      default: "SKYRA Automated Monitor",
      trim: true,
    },

    // Status lifecycle
    status: {
      type: String,
      enum: ["Active", "Acknowledged", "Resolved", "Expired"],
      default: "Active",
      index: true,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    acknowledgedBy: {
      type: String,
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    // Optional TTL expiration (null = persists until resolved or manual expiration)
    expiresAt: {
      type: Date,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: "alerts",
    timestamps: true,
  }
);

// ─── Pre-validation Hook ───────────────────────────────────────────────────────
// Synchronizes GeoJSON Point from flat latitude/longitude if coordinates array is missing
alertSchema.pre("validate", function () {
  if (
    this.latitude != null &&
    this.longitude != null &&
    (!this.coordinates || !this.coordinates.coordinates || this.coordinates.coordinates.length === 0)
  ) {
    this.coordinates = {
      type: "Point",
      coordinates: [Number(this.longitude), Number(this.latitude)], // GeoJSON order: [lon, lat]
    };
  }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// 1. Unique alert business identifier
alertSchema.index({ id: 1 }, { unique: true });

// 2. Geospatial index for proximity-based active alert queries
alertSchema.index({ coordinates: "2dsphere" }, { sparse: true });

// 3. Operational query index: active alerts ordered by creation time
alertSchema.index({ status: 1, createdAt: -1 });

// 4. Severity / risk level index
alertSchema.index({ severity: 1, status: 1 });

// 5. Automatic expiration TTL for temporary alerts (where expiresAt is set)
alertSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  }
);

module.exports = mongoose.model("Alert", alertSchema);