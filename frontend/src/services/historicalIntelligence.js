/**
 * SKYRA – Historical Pattern Intelligence
 * ────────────────────────────────────────────────────────────────────────────
 * Shared analysis module consumed by BOTH WeatherGPT and the Dashboard.
 *
 * Architecture:
 *   Current weather  +  Historical records
 *          ↓
 *   analyzeHistoricalPatterns(currentWeather)
 *          ↓
 *   HistoricalIntelligenceResult
 *       ↙              ↘
 *  WeatherGPT      Dashboard Card
 *
 * DATA SOURCES:
 *   ONLINE MODE (city search):
 *     Uses real historical weather from Open-Meteo ERA5 archive API.
 *     Records fetched dynamically based on location (latitude, longitude).
 *     Covers 2012–2023 for accurate multi-location analysis.
 *
 *   DEMO MODE (offline scenarios):
 *     Uses hardcoded BHUBANESWAR_HISTORICAL_RECORDS dataset.
 *     5 pre-computed disaster scenarios, 100% offline.
 *     Unchanged behavior for demonstration purposes.
 *
 * SIMILARITY WEIGHTS (configurable via SIMILARITY_WEIGHTS):
 *   Rainfall   40 %
 *   Humidity   20 %
 *   Month      20 %
 *   Temperature 10 %
 *   Wind speed  10 %
 */

import { fetchHistoricalData } from "./historicalDataService.js";

// ─── Similarity weights ───────────────────────────────────────────────────────
const SIMILARITY_WEIGHTS = {
  rainfall:    0.40,
  humidity:    0.20,
  month:       0.20,
  temperature: 0.10,
  wind:        0.10,
};

// ─── Thresholds ───────────────────────────────────────────────────────────────
// A record is considered "similar" if its weighted similarity score ≥ this value.
const SIMILARITY_THRESHOLD = 0.45;

// Maximum records to use when analysing common impacts.
const TOP_SIMILAR_RECORDS = 8;

// ─── DEMO historical dataset ──────────────────────────────────────────────────
// 30 varied records spanning different months, hazard types, and severity levels.
// Fields:
//   id           – unique identifier
//   date         – ISO 8601 date string (YYYY-MM-DD)
//   month        – 1–12  (redundant but convenient for quick math)
//   location     – place name
//   rainfall     – mm (current-hour or event total, consistent with Open-Meteo current.rain)
//   humidity     – %
//   temperature  – °C
//   wind         – km/h
//   hazardType   – primary hazard category
//   impactType   – recorded impact
//   severity     – "Low" | "Moderate" | "High" | "Severe"
//   notes        – brief description
export const BHUBANESWAR_HISTORICAL_RECORDS = [
  {
    id: "BBS-2023-001",
    date: "2023-06-14",
    month: 6,
    location: "Bhubaneswar",
    rainfall: 18.2,
    humidity: 91,
    temperature: 29,
    wind: 38,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Post-monsoon onset waterlogging in low-lying wards.",
  },
  {
    id: "BBS-2023-002",
    date: "2023-07-21",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 42.5,
    humidity: 96,
    temperature: 27,
    wind: 52,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "IMD orange alert; NH-16 briefly inundated.",
  },
  {
    id: "BBS-2023-003",
    date: "2023-08-03",
    month: 8,
    location: "Bhubaneswar",
    rainfall: 61.0,
    humidity: 98,
    temperature: 26,
    wind: 68,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "Cyclonic circulation caused prolonged rainfall.",
  },
  {
    id: "BBS-2023-004",
    date: "2023-09-09",
    month: 9,
    location: "Bhubaneswar",
    rainfall: 8.4,
    humidity: 87,
    temperature: 30,
    wind: 22,
    hazardType: "Waterlogging",
    impactType: "Waterlogging",
    severity: "Low",
    notes: "Moderate rain led to isolated waterlogging.",
  },
  {
    id: "BBS-2022-001",
    date: "2022-06-29",
    month: 6,
    location: "Bhubaneswar",
    rainfall: 24.0,
    humidity: 93,
    temperature: 28,
    wind: 44,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Pre-Odisha flood season warning issued.",
  },
  {
    id: "BBS-2022-002",
    date: "2022-07-10",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 55.3,
    humidity: 97,
    temperature: 26,
    wind: 60,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "Depression over Bay of Bengal triggered heavy rain.",
  },
  {
    id: "BBS-2022-003",
    date: "2022-08-18",
    month: 8,
    location: "Bhubaneswar",
    rainfall: 37.8,
    humidity: 95,
    temperature: 27,
    wind: 48,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Sustained rain; drainage overflow in Nayapalli.",
  },
  {
    id: "BBS-2022-004",
    date: "2022-10-12",
    month: 10,
    location: "Bhubaneswar",
    rainfall: 5.1,
    humidity: 82,
    temperature: 31,
    wind: 18,
    hazardType: "None",
    impactType: "No Major Impact",
    severity: "Low",
    notes: "Post-monsoon light showers, no significant event.",
  },
  {
    id: "BBS-2021-001",
    date: "2021-05-27",
    month: 5,
    location: "Bhubaneswar",
    rainfall: 12.6,
    humidity: 88,
    temperature: 33,
    wind: 85,
    hazardType: "Cyclone",
    impactType: "Tree Falls & Structural Damage",
    severity: "High",
    notes: "Yaas cyclone periphery; gusty winds caused tree uprooting.",
  },
  {
    id: "BBS-2021-002",
    date: "2021-07-05",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 48.0,
    humidity: 96,
    temperature: 27,
    wind: 55,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "Record July rainfall for the decade.",
  },
  {
    id: "BBS-2021-003",
    date: "2021-08-22",
    month: 8,
    location: "Bhubaneswar",
    rainfall: 29.5,
    humidity: 94,
    temperature: 27,
    wind: 40,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Low-lying areas waterlogged for 6–8 hours.",
  },
  {
    id: "BBS-2020-001",
    date: "2020-06-03",
    month: 6,
    location: "Bhubaneswar",
    rainfall: 15.4,
    humidity: 90,
    temperature: 29,
    wind: 36,
    hazardType: "Waterlogging",
    impactType: "Waterlogging",
    severity: "Low",
    notes: "Early monsoon arrival, minor waterlogging.",
  },
  {
    id: "BBS-2020-002",
    date: "2020-09-14",
    month: 9,
    location: "Bhubaneswar",
    rainfall: 33.2,
    humidity: 93,
    temperature: 28,
    wind: 42,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Prolonged cloud burst event.",
  },
  {
    id: "BBS-2020-003",
    date: "2020-11-04",
    month: 11,
    location: "Bhubaneswar",
    rainfall: 4.0,
    humidity: 78,
    temperature: 27,
    wind: 20,
    hazardType: "None",
    impactType: "No Major Impact",
    severity: "Low",
    notes: "Northeast monsoon onset, light rain only.",
  },
  {
    id: "BBS-2019-001",
    date: "2019-05-03",
    month: 5,
    location: "Bhubaneswar",
    rainfall: 9.8,
    humidity: 86,
    temperature: 35,
    wind: 110,
    hazardType: "Cyclone",
    impactType: "Tree Falls & Structural Damage",
    severity: "Severe",
    notes: "Cyclone Fani landfall; widespread destruction.",
  },
  {
    id: "BBS-2019-002",
    date: "2019-07-19",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 50.0,
    humidity: 97,
    temperature: 26,
    wind: 58,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "Monsoon trough over Odisha triggered heavy rain.",
  },
  {
    id: "BBS-2019-003",
    date: "2019-08-11",
    month: 8,
    location: "Bhubaneswar",
    rainfall: 22.5,
    humidity: 92,
    temperature: 28,
    wind: 30,
    hazardType: "Waterlogging",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Two-day continuous rain.",
  },
  {
    id: "BBS-2018-001",
    date: "2018-07-31",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 65.0,
    humidity: 98,
    temperature: 26,
    wind: 72,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "Severe",
    notes: "State capital experienced worst urban flood in a decade.",
  },
  {
    id: "BBS-2018-002",
    date: "2018-09-01",
    month: 9,
    location: "Bhubaneswar",
    rainfall: 19.0,
    humidity: 89,
    temperature: 29,
    wind: 26,
    hazardType: "Waterlogging",
    impactType: "Waterlogging",
    severity: "Low",
    notes: "Post-withdrawal light event.",
  },
  {
    id: "BBS-2017-001",
    date: "2017-06-22",
    month: 6,
    location: "Bhubaneswar",
    rainfall: 28.0,
    humidity: 92,
    temperature: 28,
    wind: 46,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Onset rains caused street flooding.",
  },
  {
    id: "BBS-2017-002",
    date: "2017-10-11",
    month: 10,
    location: "Bhubaneswar",
    rainfall: 6.2,
    humidity: 84,
    temperature: 30,
    wind: 16,
    hazardType: "None",
    impactType: "No Major Impact",
    severity: "Low",
    notes: "Retreating monsoon, negligible impact.",
  },
  {
    id: "BBS-2016-001",
    date: "2016-08-07",
    month: 8,
    location: "Bhubaneswar",
    rainfall: 38.5,
    humidity: 95,
    temperature: 27,
    wind: 50,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "Low-pressure system triggered heavy downpour.",
  },
  {
    id: "BBS-2016-002",
    date: "2016-12-08",
    month: 12,
    location: "Bhubaneswar",
    rainfall: 1.2,
    humidity: 65,
    temperature: 20,
    wind: 10,
    hazardType: "None",
    impactType: "No Major Impact",
    severity: "Low",
    notes: "Winter light shower, no event.",
  },
  {
    id: "BBS-2015-001",
    date: "2015-07-14",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 44.0,
    humidity: 96,
    temperature: 27,
    wind: 54,
    hazardType: "Urban Flooding",
    impactType: "Localized Flooding",
    severity: "High",
    notes: "Peak monsoon flooding event.",
  },
  {
    id: "BBS-2015-002",
    date: "2015-03-15",
    month: 3,
    location: "Bhubaneswar",
    rainfall: 0.4,
    humidity: 55,
    temperature: 34,
    wind: 14,
    hazardType: "Heat Stress",
    impactType: "Heat Stress",
    severity: "Moderate",
    notes: "Unusually dry and hot pre-summer conditions.",
  },
  {
    id: "BBS-2014-001",
    date: "2014-10-13",
    month: 10,
    location: "Bhubaneswar",
    rainfall: 11.0,
    humidity: 86,
    temperature: 29,
    wind: 62,
    hazardType: "Cyclone",
    impactType: "Tree Falls & Structural Damage",
    severity: "High",
    notes: "Cyclone Hudhud periphery; wind damage reported.",
  },
  {
    id: "BBS-2014-002",
    date: "2014-06-17",
    month: 6,
    location: "Bhubaneswar",
    rainfall: 20.0,
    humidity: 90,
    temperature: 29,
    wind: 34,
    hazardType: "Waterlogging",
    impactType: "Waterlogging",
    severity: "Low",
    notes: "Monsoon onset waterlogging, minor drainage issues.",
  },
  {
    id: "BBS-2013-001",
    date: "2013-10-12",
    month: 10,
    location: "Bhubaneswar",
    rainfall: 31.0,
    humidity: 91,
    temperature: 28,
    wind: 76,
    hazardType: "Cyclone",
    impactType: "Tree Falls & Structural Damage",
    severity: "Severe",
    notes: "Cyclone Phailin; extensive wind and rain damage.",
  },
  {
    id: "BBS-2013-002",
    date: "2013-07-25",
    month: 7,
    location: "Bhubaneswar",
    rainfall: 40.0,
    humidity: 95,
    temperature: 27,
    wind: 46,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Extended monsoon event.",
  },
  {
    id: "BBS-2012-001",
    date: "2012-08-29",
    month: 8,
    location: "Bhubaneswar",
    rainfall: 26.0,
    humidity: 93,
    temperature: 27,
    wind: 38,
    hazardType: "Urban Flooding",
    impactType: "Waterlogging",
    severity: "Moderate",
    notes: "Mid-monsoon surge.",
  },
];

// ─── Month similarity helper ──────────────────────────────────────────────────
// Treats months as a circular scale so e.g. January and December are close.
function monthSimilarity(monthA, monthB) {
  const diff = Math.abs(monthA - monthB);
  const circular = Math.min(diff, 12 - diff); // 0–6
  return 1 - circular / 6; // 1 = same, 0 = 6 months apart
}

// ─── Single-dimension similarity ─────────────────────────────────────────────
// Returns 0–1, where 1 = identical and 0 = maximally different.
// Uses a soft exponential decay: similarity = exp(-|diff| / scale).
// scale is chosen so that a difference equal to the "typical range" gives ~0.37.
function softSimilarity(current, historical, scale) {
  if (!Number.isFinite(current) || !Number.isFinite(historical)) return 0.5;
  const diff = Math.abs(current - historical);
  return Math.exp(-diff / scale);
}

// ─── Weighted similarity score ────────────────────────────────────────────────
// Returns 0–1.
function computeSimilarity(current, record) {
  const rainfallSim = softSimilarity(current.rainfall,    record.rainfall,    20);
  const humiditySim = softSimilarity(current.humidity,    record.humidity,    15);
  const tempSim     = softSimilarity(current.temperature, record.temperature, 10);
  const windSim     = softSimilarity(current.wind,        record.wind,        25);
  const monthSim    = monthSimilarity(current.month,      record.month);

  return (
    SIMILARITY_WEIGHTS.rainfall    * rainfallSim +
    SIMILARITY_WEIGHTS.humidity    * humiditySim +
    SIMILARITY_WEIGHTS.temperature * tempSim     +
    SIMILARITY_WEIGHTS.wind        * windSim     +
    SIMILARITY_WEIGHTS.month       * monthSim
  );
}

// ─── Severity to numeric ──────────────────────────────────────────────────────
const SEVERITY_SCORE = { Low: 1, Moderate: 2, High: 3, Severe: 4 };

function severityScore(severity) {
  return SEVERITY_SCORE[severity] ?? 1;
}

// ─── Historical risk from similar events ─────────────────────────────────────
// Calculates a weighted-severity score from the top-similar records and maps
// it to a risk label. This is separate from the ML riskLevel.
function computeHistoricalRisk(topRecords) {
  if (topRecords.length === 0) return "Unknown";

  const totalWeight = topRecords.reduce((sum, r) => sum + r.similarity, 0);
  if (totalWeight === 0) return "Low";

  const weightedSeverity = topRecords.reduce(
    (sum, r) => sum + r.similarity * severityScore(r.record.severity),
    0
  );

  const avg = weightedSeverity / totalWeight;

  if (avg >= 3.2) return "Severe";
  if (avg >= 2.4) return "High";
  if (avg >= 1.6) return "Moderate";
  return "Low";
}

// ─── Common impact finder ─────────────────────────────────────────────────────
// Counts impact occurrences, returns the mode and its frequency as a fraction.
function findCommonImpact(topRecords) {
  const counts = {};
  for (const { record } of topRecords) {
    const key = record.impactType;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { impactType: "Unknown", frequency: 0 };

  const [topImpact, topCount] = entries[0];
  return {
    impactType: topImpact,
    frequency: topCount / topRecords.length,
  };
}

// ─── Trend detector ──────────────────────────────────────────────────────────
// Simple heuristic: compare average severity of the 5 oldest vs 5 newest
// similar records (sorted by date). Returns "Increasing" | "Stable" | "Decreasing".
function detectTrend(topRecords) {
  if (topRecords.length < 4) return null; // not enough data

  const sorted = [...topRecords].sort((a, b) =>
    a.record.date.localeCompare(b.record.date)
  );

  const half = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, half);
  const newer = sorted.slice(-half);

  const avgSev = (group) =>
    group.reduce((s, r) => s + severityScore(r.record.severity), 0) / group.length;

  const diff = avgSev(newer) - avgSev(older);
  if (diff > 0.3) return "Increasing";
  if (diff < -0.3) return "Decreasing";
  return "Stable";
}

// ─── Explanation builder ─────────────────────────────────────────────────────
function buildExplanation(current, topRecords, commonImpact, patternMatch) {
  if (topRecords.length === 0) {
    return "Current conditions do not closely match any recorded historical events in the SKYRA demo dataset.";
  }

  const matchPct = Math.round(patternMatch);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthName = months[(current.month - 1)] ?? "";

  const factors = [];
  if (current.rainfall > 15)   factors.push(`elevated rainfall (${current.rainfall} mm)`);
  if (current.humidity > 85)   factors.push(`high humidity (${current.humidity}%)`);
  if (current.wind > 40)       factors.push(`strong winds (${current.wind} km/h)`);
  if (factors.length === 0)    factors.push(`moderate overall conditions`);

  const factorStr = factors.join(" and ");
  const impactStr = commonImpact.impactType !== "No Major Impact"
    ? commonImpact.impactType.toLowerCase()
    : "no major impact";

  return (
    `Current conditions in ${monthName} (${factorStr}) show a ${matchPct}% pattern match ` +
    `with ${topRecords.length} similar historical event(s). ` +
    `The most common past outcome under similar conditions was ${impactStr} ` +
    `(${Math.round(commonImpact.frequency * 100)}% of similar events).`
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * analyzeHistoricalPatterns
 *
 * @param {{ rainfall: number, humidity: number, temperature: number,
 *            wind: number, month: number, location: string }} currentWeather
 *   All numeric values extracted from the live Open-Meteo response.
 *   month is 1–12 (JS Date.getMonth() + 1).
 *   location is the city name or display name (used in results).
 *
 * @returns {HistoricalIntelligenceResult}
 */
export async function analyzeHistoricalPatterns(currentWeather) {
  const now = new Date();

  // Validate input – return a safe "insufficient data" result if values missing.
  const { rainfall, humidity, temperature, wind, month, location, latitude, longitude } = currentWeather;
  if (
    !Number.isFinite(rainfall) ||
    !Number.isFinite(humidity) ||
    !Number.isFinite(temperature) ||
    !Number.isFinite(wind) ||
    !Number.isFinite(month)
  ) {
    return {
      location: location ?? "Current location",
      analysisTime: now.toISOString(),
      status: "insufficient_data",
      patternMatch: 0,
      similarityLevel: "Unknown",
      similarEventCount: 0,
      historicalRisk: "Unknown",
      commonImpact: "Unknown",
      impactLikelihood: 0,
      historicalTrend: null,
      explanation: "Insufficient current weather data for historical pattern analysis.",
      dataCoverage: "No data available",
      dataSource: `Historical analysis for ${location ?? "current location"}`,
      dataReliability: "Unavailable",
    };
  }

  // ONLINE MODE: Fetch dynamic historical data from Open-Meteo API
  // DEMO MODE: Return unavailable (let analyzeHistoricalPatterns not be called)
  
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    let historicalRecords;
    let dataSource;
    let dataReliability;
    
    try {
      console.log(`[SKYRA] Online Mode: fetching historical data for ${location} (${latitude}, ${longitude})`);
      historicalRecords = await fetchHistoricalData(latitude, longitude, location);
      dataSource = `Open-Meteo ERA5 Reanalysis – Historical data for ${location}`;
      dataReliability = "Live API";
    } catch (err) {
      console.error(`[SKYRA] CRITICAL: Failed to fetch historical data for ${location}:`, err.message);
      // DO NOT FALLBACK TO BHUBANESWAR - return unavailable state instead
      return {
        location: location ?? "Current location",
        analysisTime: now.toISOString(),
        status: "data_unavailable",
        patternMatch: 0,
        similarityLevel: "Unknown",
        similarEventCount: 0,
        historicalRisk: "Unknown",
        commonImpact: "Unknown",
        impactLikelihood: 0,
        historicalTrend: null,
        explanation: `Historical data unavailable for ${location ?? "current location"}. Historical pattern analysis cannot be performed at this time.`,
        dataCoverage: "No data available",
        dataSource: `Open-Meteo Archive API (${location ?? "current location"})`,
        dataReliability: "Unavailable",
      };
    }

    // Score every historical record against current conditions.
    const scored = historicalRecords.map((record) => ({
      record,
      similarity: computeSimilarity(currentWeather, record),
    }));

    // Sort descending by similarity.
    scored.sort((a, b) => b.similarity - a.similarity);

    // Select the most similar records above the threshold.
    const topRecords = scored
      .filter((r) => r.similarity >= SIMILARITY_THRESHOLD)
      .slice(0, TOP_SIMILAR_RECORDS);

    // Pattern match = average similarity of top records × 100, clamped 0–100.
    const patternMatch =
      topRecords.length > 0
        ? Math.min(
            100,
            Math.round(
              (topRecords.reduce((s, r) => s + r.similarity, 0) / topRecords.length) * 100
            )
          )
        : 0;

    // Similarity level label.
    let similarityLevel;
    if (patternMatch >= 80)      similarityLevel = "Very High";
    else if (patternMatch >= 65) similarityLevel = "High";
    else if (patternMatch >= 50) similarityLevel = "Moderate";
    else if (patternMatch >= 35) similarityLevel = "Low";
    else                         similarityLevel = "Very Low";

    const historicalRisk   = computeHistoricalRisk(topRecords);
    const commonImpactData = findCommonImpact(topRecords);
    const historicalTrend  = detectTrend(topRecords);
    const explanation      = buildExplanation(
      currentWeather, topRecords, commonImpactData, patternMatch
    );

    return {
      location: location ?? "Current location",
      analysisTime: now.toISOString(),
      status: topRecords.length >= 2 ? "ok" : "low_data",
      patternMatch,
      similarityLevel,
      similarEventCount: topRecords.length,
      historicalRisk,
      commonImpact: commonImpactData.impactType,
      impactLikelihood: Math.round(commonImpactData.frequency * 100),
      historicalTrend,
      explanation,
      dataCoverage: `${historicalRecords.length} historical records (2012–2023)`,
      dataSource,
      dataReliability,
    };
  } else {
    console.log(`[SKYRA] Demo Mode or insufficient location data: historical analysis not applicable`);
    // This should not happen in normal flow - analyzeHistoricalPatterns should not be called without coordinates in Online Mode
    return {
      location: location ?? "Current location",
      analysisTime: now.toISOString(),
      status: "no_coordinates",
      patternMatch: 0,
      similarityLevel: "Unknown",
      similarEventCount: 0,
      historicalRisk: "Unknown",
      commonImpact: "Unknown",
      impactLikelihood: 0,
      historicalTrend: null,
      explanation: "Historical pattern analysis requires location coordinates.",
      dataCoverage: "No data available",
      dataSource: "N/A",
      dataReliability: "N/A",
    };
  }
}
