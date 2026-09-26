/**
 * SKYRA – Feature Extractor Module (Phase 3 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, deterministic feature transformation module for the SKYRA risk pipeline.
 *
 * Guarantees:
 *   • Pure function (zero network calls, zero database access, zero side-effects)
 *   • Exact feature ordering matching ML model (predict_api.py & train_model.py)
 *   • Strict input validation with explicit error reporting
 *   • Zero silent fallbacks to Bhubaneswar or invented weather values
 *   • Support for both normalized weather payloads and direct property inputs
 */

const FEATURE_NAMES = Object.freeze([
  "rainfall",
  "forecastRainfall",
  "humidity",
  "windSpeed",
  "historicalRisk",
  "terrainSlope",
  "temperature",
  "pressure",
]);

/**
 * Validates a single feature value for numeric validity and range.
 *
 * @param {any} value
 * @param {string} fieldName
 * @param {Object} [options]
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @returns {number}
 * @throws {TypeError|RangeError}
 */
function validateFeatureNumber(value, fieldName, options = {}) {
  if (value === null || value === undefined || value === "") {
    const err = new TypeError(`Missing required feature: '${fieldName}'`);
    err.statusCode = 400;
    err.code = "ERR_MISSING_FEATURE";
    throw err;
  }

  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    const err = new TypeError(`Feature '${fieldName}' must be a valid finite number. Received: ${value}`);
    err.statusCode = 400;
    err.code = "ERR_INVALID_NUMERIC";
    throw err;
  }

  if (options.min !== undefined && num < options.min) {
    const err = new RangeError(`Feature '${fieldName}' (${num}) cannot be less than ${options.min}`);
    err.statusCode = 400;
    err.code = "ERR_OUT_OF_RANGE";
    throw err;
  }

  if (options.max !== undefined && num > options.max) {
    const err = new RangeError(`Feature '${fieldName}' (${num}) cannot be greater than ${options.max}`);
    err.statusCode = 400;
    err.code = "ERR_OUT_OF_RANGE";
    throw err;
  }

  return num;
}

/**
 * Extracts and strictly validates features from a normalized weather object
 * or flat input structure.
 *
 * Accepts either:
 *   1. Flat input object:
 *      { rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure }
 *   2. Structured weather/context object:
 *      {
 *        current: { rainfall, humidity, windSpeed, temperature, pressure },
 *        forecast: { precipitationExpected, hourly, ... },
 *        context: { historicalRisk, terrainSlope }
 *      }
 *
 * @param {Object} rawInput
 * @returns {{
 *   featureVector: number[],
 *   featureObject: {
 *     rainfall: number,
 *     forecastRainfall: number,
 *     humidity: number,
 *     windSpeed: number,
 *     historicalRisk: number,
 *     terrainSlope: number,
 *     temperature: number,
 *     pressure: number
 *   },
 *   featureNames: readonly string[]
 * }}
 */
function extractFeatures(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    const err = new TypeError("Input to featureExtractor must be a non-null object.");
    err.statusCode = 400;
    err.code = "ERR_INVALID_INPUT";
    throw err;
  }

  // Resolve values from flat inputs or structured nested payloads
  const cur = rawInput.current || rawInput.currentWeather || {};
  const forecast = rawInput.forecast || {};
  const ctx = rawInput.context || rawInput.environmentalContext || {};

  const rawRainfall = rawInput.rainfall ?? cur.rainfall ?? cur.rain ?? cur.precipitation;
  const rawForecastRainfall = rawInput.forecastRainfall ?? forecast.precipitationExpected ?? (Array.isArray(forecast.hourly) ? forecast.hourly[0]?.precipitation : undefined);
  const rawHumidity = rawInput.humidity ?? cur.humidity ?? cur.relative_humidity_2m;
  const rawWindSpeed = rawInput.windSpeed ?? cur.windSpeed ?? cur.wind_speed_10m;
  const rawHistoricalRisk = rawInput.historicalRisk ?? ctx.historicalRisk;
  const rawTerrainSlope = rawInput.terrainSlope ?? ctx.terrainSlope;
  const rawTemperature = rawInput.temperature ?? cur.temperature ?? cur.temperature_2m;
  const rawPressure = rawInput.pressure ?? cur.pressure ?? cur.surfacePressure ?? cur.surface_pressure;

  const rainfall = validateFeatureNumber(rawRainfall, "rainfall", { min: 0 });
  const forecastRainfall = validateFeatureNumber(rawForecastRainfall, "forecastRainfall", { min: 0 });
  const humidity = validateFeatureNumber(rawHumidity, "humidity", { min: 0, max: 100 });
  const windSpeed = validateFeatureNumber(rawWindSpeed, "windSpeed", { min: 0 });
  const historicalRisk = validateFeatureNumber(rawHistoricalRisk, "historicalRisk", { min: 0, max: 100 });
  const terrainSlope = validateFeatureNumber(rawTerrainSlope, "terrainSlope", { min: 0, max: 90 });
  const temperature = validateFeatureNumber(rawTemperature, "temperature", { min: -100, max: 100 });
  const pressure = validateFeatureNumber(rawPressure, "pressure", { min: 300, max: 1200 });

  // Strictly ordered feature vector matching predict_api.py:
  // [rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]
  const featureVector = [
    rainfall,
    forecastRainfall,
    humidity,
    windSpeed,
    historicalRisk,
    terrainSlope,
    temperature,
    pressure,
  ];

  const featureObject = {
    rainfall,
    forecastRainfall,
    humidity,
    windSpeed,
    historicalRisk,
    terrainSlope,
    temperature,
    pressure,
  };

  return {
    featureVector,
    featureObject,
    featureNames: FEATURE_NAMES,
  };
}

module.exports = {
  extractFeatures,
  FEATURE_NAMES,
  validateFeatureNumber,
};
