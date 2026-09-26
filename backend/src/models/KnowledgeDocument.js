/**
 * SKYRA – Knowledge Document Model (Phase 4 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mongoose persistence schema for authoritative meteorological guidance,
 * disaster management protocols, evacuation guidelines, and safety knowledge.
 *
 * Design Guarantees:
 *   • Traceable: Preserves author, source agency, URL, publication and retrieval dates
 *   • Versioned: Multi-version document history with content checksums
 *   • Freshness-aware: Distinguishes current, expired, stale, and archived knowledge
 *   • Region-scoped: Explicit geographic boundaries (GLOBAL, NATIONAL, STATE, DISTRICT, LOCAL)
 *   • Multilingual: Explicit language tagging for future localized assistance
 *   • Duplicate-resistant: SHA-256 content hashing prevents accidental duplicate ingestion
 */

const crypto = require("crypto");
const mongoose = require("mongoose");

const VALID_CATEGORIES = Object.freeze([
  "flood",
  "cyclone",
  "extreme_rainfall",
  "heat",
  "lightning",
  "landslide",
  "thunderstorm",
  "emergency_response",
  "preparedness",
  "evacuation",
  "first_response",
  "general_weather_safety",
]);

const VALID_SCOPES = Object.freeze([
  "GLOBAL",
  "NATIONAL",
  "REGIONAL",
  "STATE",
  "DISTRICT",
  "LOCAL",
]);

const VALID_AUTHORITIES = Object.freeze([
  "GOVERNMENT_NATIONAL",
  "GOVERNMENT_STATE",
  "METEOROLOGICAL_AGENCY",
  "DISASTER_AUTHORITY",
  "ACADEMIC",
  "VERIFIED_NGO",
  "INTERNAL_OPERATIONAL",
]);

const VALID_STATUSES = Object.freeze([
  "current",
  "expired",
  "stale",
  "archived",
  "pending_review",
]);

const knowledgeDocumentSchema = new mongoose.Schema(
  {
    // Business identifier (e.g. 'ndma_flood_guidance_2024')
    documentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: String,
      required: true,
    },

    summary: {
      type: String,
      default: "",
      trim: true,
    },

    category: {
      type: String,
      enum: VALID_CATEGORIES,
      required: true,
      index: true,
    },

    hazardType: {
      type: String,
      default: null,
      trim: true,
    },

    // Geographic boundary of applicability
    scope: {
      type: String,
      enum: VALID_SCOPES,
      default: "NATIONAL",
      required: true,
      index: true,
    },

    targetRegion: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // Optional GeoJSON Point for hyper-local guidance (e.g. specific relief shelter coordinates)
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
            if (!coords || coords.length === 0) return true; // Optional
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

    // Authoritative source metadata
    source: {
      type: String,
      required: true,
      trim: true,
    },

    sourceUrl: {
      type: String,
      default: null,
      trim: true,
    },

    authority: {
      type: String,
      enum: VALID_AUTHORITIES,
      default: "DISASTER_AUTHORITY",
    },

    publicationDate: {
      type: Date,
      default: null,
    },

    effectiveDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    retrievedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // Multilingual readiness: ISO 639-1 code
    language: {
      type: String,
      default: "en",
      trim: true,
      lowercase: true,
      index: true,
    },

    // Versioning
    version: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },

    supersedes: {
      type: String,
      default: null,
      trim: true,
    },

    // Lifecycle status
    status: {
      type: String,
      enum: VALID_STATUSES,
      default: "current",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    // Cryptographic hash for duplicate prevention and data integrity
    contentHash: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    collection: "knowledge_documents",
    timestamps: true,
  }
);

// ─── Pre-validation Hook ───────────────────────────────────────────────────────
// Calculates contentHash and automatically evaluates expiry freshness
knowledgeDocumentSchema.pre("validate", function () {
  if (!this.contentHash && this.title && this.content) {
    const raw = `${this.title}::${this.content}::${this.language || "en"}`;
    this.contentHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
  }

  // Automatic expiry check: if expiryDate has passed, status becomes expired
  if (this.expiryDate && this.expiryDate < new Date() && this.status === "current") {
    this.status = "expired";
  }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// 1. Compound unique index: prevents duplicate versions of the same document
knowledgeDocumentSchema.index({ documentId: 1, version: 1 }, { unique: true });

// 2. Query index for active knowledge by category and scope
knowledgeDocumentSchema.index({ category: 1, status: 1, scope: 1 });

// 3. Location-aware regional lookup
knowledgeDocumentSchema.index({ targetRegion: 1, scope: 1, status: 1 });

// 4. Duplicate prevention lookup by cryptographic contentHash
knowledgeDocumentSchema.index({ contentHash: 1 });

// 5. Multilingual retrieval index
knowledgeDocumentSchema.index({ language: 1, status: 1 });

// 6. Optional geospatial index for hyper-local guidance
knowledgeDocumentSchema.index({ coordinates: "2dsphere" }, { sparse: true });

module.exports = mongoose.model("KnowledgeDocument", knowledgeDocumentSchema);
module.exports.VALID_CATEGORIES = VALID_CATEGORIES;
module.exports.VALID_SCOPES = VALID_SCOPES;
module.exports.VALID_AUTHORITIES = VALID_AUTHORITIES;
module.exports.VALID_STATUSES = VALID_STATUSES;
