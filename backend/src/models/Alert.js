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

    // Phase 12 Priority Rating (P1: Emergency, P2: Warning, P3: Watch, P4: Advisory)
    priority: {
      type: String,
      enum: ["P1", "P2", "P3", "P4"],
      default: "P3",
      index: true,
    },

    // Source Authority Classification (Phase 12 Anti-Fabrication Guarantee)
    sourceAuthority: {
      type: String,
      enum: ["OFFICIAL_ADVISORY", "EMERGENCY_SYSTEM", "MODEL_ESTIMATE", "OBSERVATION"],
      default: "MODEL_ESTIMATE",
      index: true,
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

    calibratedConfidence: {
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

    // Impact severity label from Phase 6 Impact Assessment
    impactSeverity: {
      type: String,
      default: null,
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

    recommendedActions: {
      type: [String],
      default: [],
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional IMD station reference if alert derived from official advisory
    imdStationId: {
      type: String,
      default: null,
      trim: true,
    },

    // SHA-256 fingerprint for deduplication
    fingerprint: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // Deduplication occurrence counter & temporal tracking
    occurrenceCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    firstObservedAt: {
      type: Date,
      default: Date.now,
    },

    lastObservedAt: {
      type: Date,
      default: Date.now,
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

    resolvedBy: {
      type: String,
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
// Synchronizes GeoJSON Point, confidence fields, and actions
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

  // Cross-synchronize legacy confidence and calibratedConfidence
  if (this.confidence != null && (this.calibratedConfidence == null || this.calibratedConfidence === 0)) {
    this.calibratedConfidence = this.confidence;
  } else if (this.calibratedConfidence != null && (this.confidence == null || this.confidence === 0)) {
    this.confidence = this.calibratedConfidence;
  }

  // Cross-synchronize recommendedAction and recommendedActions array
  if (this.recommendedAction && (!this.recommendedActions || this.recommendedActions.length === 0)) {
    this.recommendedActions = [this.recommendedAction];
  } else if ((!this.recommendedAction || !this.recommendedAction.trim()) && this.recommendedActions && this.recommendedActions.length > 0) {
    this.recommendedAction = this.recommendedActions[0];
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

// 5. Phase 12 Deduplication index
alertSchema.index({ fingerprint: 1, status: 1 });

// 6. Operational priority & active alerts index
alertSchema.index({ status: 1, priority: 1, createdAt: -1 });

// 7. Automatic expiration TTL for temporary alerts (where expiresAt is set)
alertSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  }
);

module.exports = mongoose.model("Alert", alertSchema);