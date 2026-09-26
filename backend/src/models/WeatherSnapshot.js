/**
 * SKYRA – Weather Snapshot Model (Phase 3 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mongoose persistence schema for normalized live weather observations,
 * NWP forecasts, and historical ERA5 climate archives.
 *
 * Design Guarantees:
 *   • Supports live observations, forecasts, and historical ERA5 series
 *   • Geospatial indexing via standard GeoJSON Point [longitude, latitude]
 *   • Strict coordinate, timestamp, and numeric boundary validation
 *   • Explicit TTL retention: temporary live snapshots expire via expiresAt,
 *     while historical ERA5 records have NO expiration (expiresAt = null)
 *   • Non-blocking / safe for local offline development
 */

const mongoose = require("mongoose");

/**
 * Sub-schema for daily ERA5 historical climate records.
 */
const dailyHistoricalRecordSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    precipitation: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    tempMax: {
      type: Number,
      default: null,
    },
    tempMin: {
      type: Number,
      default: null,
    },
    tempAvg: {
      type: Number,
      default: null,
    },
    windSpeedMax: {
      type: Number,
      min: 0,
      default: 0,
    },
    relativeHumidityMean: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    apparentTempMax: {
      type: Number,
      default: null,
    },
    apparentTempMin: {
      type: Number,
      default: null,
    },
    apparentTempMean: {
      type: Number,
      default: null,
    },
    windDirectionDominant: {
      type: Number,
      min: 0,
      max: 360,
      default: null,
    },
    surfacePressureMean: {
      type: Number,
      min: 300,
      max: 1200,
      default: null,
    },
  },
  { _id: false }
);

const weatherSnapshotSchema = new mongoose.Schema(
  {
    // Snapshot classification
    snapshotType: {
      type: String,
      enum: ["live", "forecast", "historical", "terrain"],
      required: true,
      default: "live",
      index: true,
    },

    // GeoJSON Point representation for geospatial spatial queries
    // GeoJSON specification requires [longitude, latitude] order
    location: {
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
          message: "coordinates must be [longitude, latitude] with lon in [-180, 180] and lat in [-90, 90]",
        },
      },
    },

    // Flat coordinates for indexed numerical queries
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

    // Human-readable location metadata
    displayName: {
      type: String,
      default: "Monitored Location",
      trim: true,
    },
    city: {
      type: String,
      default: null,
      trim: true,
    },
    region: {
      type: String,
      default: null,
      trim: true,
    },
    country: {
      type: String,
      default: "India",
      trim: true,
    },

    // Source & Provenance
    source: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
    },
    dataset: {
      type: String,
      default: "Best-Match NWP",
      trim: true,
    },
    dataFreshness: {
      type: String,
      enum: ["live", "cached", "historical", "simulated"],
      default: "live",
    },
    sourceStatus: {
      type: String,
      default: "ok",
    },
    retrievedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    observedAt: {
      type: Date,
      default: null,
    },

    // Units metadata
    units: {
      temperature: { type: String, default: "°C" },
      precipitation: { type: String, default: "mm" },
      windSpeed: { type: String, default: "km/h" },
      pressure: { type: String, default: "hPa" },
      humidity: { type: String, default: "%" },
    },

    // Provenance details
    provenance: {
      provider: { type: String, default: "Open-Meteo" },
      sourceModel: { type: String, default: "Best-Match NWP" },
      observationTimestamp: { type: Date, default: null },
      ingestionTimestamp: { type: Date, default: Date.now },
      dataFreshness: { type: String, default: "live" },
      requestedCoordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
      actualSourceCoordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
      cacheStatus: {
        isCached: { type: Boolean, default: false },
        cacheKey: { type: String, default: null },
      },
      persistenceStatus: { type: Boolean, default: false },
    },

    // Core weather observation values (for live/forecast snapshots)
    current: {
      temperature: { type: Number, default: null, min: -100, max: 100 },
      feelsLike: { type: Number, default: null, min: -100, max: 100 },
      humidity: { type: Number, default: null, min: 0, max: 100 },
      windSpeed: { type: Number, default: null, min: 0 },
      windDirection: { type: Number, default: null, min: 0, max: 360 },
      rainfall: { type: Number, default: null, min: 0 },
      pressure: { type: Number, default: null, min: 300, max: 1200 },
      weatherCode: { type: Number, default: null },
      condition: { type: String, default: null },
    },

    // Forecast metrics
    forecastRainfall: {
      type: Number,
      min: 0,
      default: null,
    },
    precipitationExpected: {
      type: Number,
      min: 0,
      default: null,
    },
    maxRainProbability: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    // Context / baseline values (when explicitly provided)
    historicalRisk: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    terrainSlope: {
      type: Number,
      min: 0,
      max: 90,
      default: null,
    },
    // Topographic terrain data (when snapshotType === 'terrain')
    terrain: {
      elevation: { type: Number, default: null },
      slope: { type: Number, default: null, min: 0, max: 90 },
      spatialResolution: { type: String, default: "~90 meters" },
    },

    // Historical ERA5 timeseries (populated when snapshotType === 'historical')
    requestedRange: {
      startDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
      endDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    },
    recordCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyRecords: {
      type: [dailyHistoricalRecordSchema],
      default: undefined,
    },

    // Retention policy:
    // • For live snapshots: expiresAt is set (e.g. 7 days from creation), MongoDB auto-purges.
    // • For historical ERA5 series & terrain: expiresAt MUST remain null/undefined, ensuring permanent retention.
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "weather_snapshots",
    timestamps: true,
  }
);

// ─── Pre-validation Hook ───────────────────────────────────────────────────────
// Automatically synchronizes GeoJSON [longitude, latitude] with flat lat/lon
weatherSnapshotSchema.pre("validate", function () {
  if (
    this.latitude !== undefined &&
    this.longitude !== undefined &&
    (!this.location || !this.location.coordinates || this.location.coordinates.length === 0)
  ) {
    this.location = {
      type: "Point",
      coordinates: [this.longitude, this.latitude], // GeoJSON order: [lon, lat]
    };
  }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// 1. Geospatial index for proximity / radius queries
weatherSnapshotSchema.index({ location: "2dsphere" });

// 2. Compound coordinate & type index for spatial lookup
weatherSnapshotSchema.index({ latitude: 1, longitude: 1, snapshotType: 1 });

// 3. Source & dataset lookup
weatherSnapshotSchema.index({ source: 1, snapshotType: 1 });

// 4. Time-series lookup for historical and operational analytics
weatherSnapshotSchema.index({ snapshotType: 1, retrievedAt: -1 });

// 5. Historical date range lookup
weatherSnapshotSchema.index(
  { latitude: 1, longitude: 1, "requestedRange.startDate": 1, "requestedRange.endDate": 1 },
  { sparse: true }
);

// 6. Targeted TTL index: ONLY expires documents where expiresAt is a valid Date
// Documents with expiresAt: null (such as ERA5 historical and terrain datasets) are NEVER deleted.
weatherSnapshotSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  }
);

module.exports = mongoose.model("WeatherSnapshot", weatherSnapshotSchema);
