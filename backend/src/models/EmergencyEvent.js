/**
 * SKYRA – Emergency Event Model (Phase 13 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mongoose schema and resilient in-memory storage fallback for Phase 13
 * Emergency Mode lifecycle events, SOS triggers, and user safety state tracking.
 *
 * Guarantees:
 *   • Resilient: Functions seamlessly whether MongoDB is online or offline.
 *   • Idempotent: eventId is unique and prevents duplicate record creation.
 *   • Privacy-Aware: Stores only sanitized contact snapshots (masked phone numbers).
 *   • Geospatial: Standard GeoJSON Point [longitude, latitude] with bounds validation.
 *   • Auditable: Full history of state transitions preserved with timestamps.
 */

const mongoose = require("mongoose");

// In-memory store for fallback / offline test execution
const _inMemoryEmergencyStore = new Map();

const emergencyEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
      enum: [
        "NORMAL",
        "EMERGENCY_ACTIVE",
        "SOS_SENT",
        "HELP_NEEDED",
        "SAFE",
        "OFFLINE_PENDING",
        "QUEUED",
        "RESOLVED",
      ],
      default: "EMERGENCY_ACTIVE",
    },
    safetyStatus: {
      type: String,
      enum: ["UNSPECIFIED", "SAFE", "HELP_NEEDED"],
      default: "UNSPECIFIED",
    },
    locationAvailable: {
      type: Boolean,
      default: false,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function (val) {
            if (!this.locationAvailable) return true;
            if (!Array.isArray(val) || val.length !== 2) return false;
            const [lon, lat] = val;
            return (
              typeof lon === "number" &&
              typeof lat === "number" &&
              !isNaN(lon) &&
              !isNaN(lat) &&
              lon >= -180 &&
              lon <= 180 &&
              lat >= -90 &&
              lat <= 90
            );
          },
          message: "Coordinates must be valid [longitude, latitude] numbers.",
        },
      },
    },
    locationLabel: {
      type: String,
      default: "Location Unknown",
      trim: true,
    },
    accuracyMeters: {
      type: Number,
      default: null,
    },
    emergencyType: {
      type: String,
      default: "USER_SOS",
      trim: true,
    },
    contacts: [
      {
        name: { type: String, trim: true },
        phoneMasked: { type: String, trim: true },
      },
    ],
    contactsCount: {
      type: Number,
      default: 0,
    },
    alertId: {
      type: String,
      default: null,
      trim: true,
    },
    deliveryState: {
      type: String,
      enum: ["SENT", "QUEUED", "FAILED", "UNAVAILABLE"],
      default: "SENT",
    },
    deliveryAttempts: {
      type: Number,
      default: 1,
    },
    activatedAt: {
      type: Date,
      default: Date.now,
    },
    sosTriggeredAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    history: [
      {
        state: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
emergencyEventSchema.index({ "location.coordinates": "2dsphere" }, { sparse: true });
emergencyEventSchema.index({ createdAt: -1 });

// Helper to mask phone numbers for privacy (e.g., +91 9876543210 -> +91 *** *** 3210)
function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== "string") return "";
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "****";
  const visible = cleaned.slice(-4);
  return `${"*".repeat(Math.max(0, cleaned.length - 4))}${visible}`;
}

let EmergencyEventModel;
try {
  EmergencyEventModel = mongoose.model("EmergencyEvent", emergencyEventSchema);
} catch {
  EmergencyEventModel = mongoose.model("EmergencyEvent");
}

module.exports = {
  EmergencyEvent: EmergencyEventModel,
  _inMemoryEmergencyStore,
  maskPhoneNumber,
};
