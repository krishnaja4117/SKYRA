/**
 * SKYRA – Predictive Impact Network (Legacy / Offline Demo Scenarios Only)
 * ────────────────────────────────────────────────────────────────────────────
 * [NON-AUTHORITATIVE: OFFLINE DEMO & TEST USE ONLY]
 * Live meteorological impact assessment is authoritatively derived server-side
 * via backend/src/services/impactAssessmentService.js (Phase 6) and served
 * through GET /api/intelligence. This client-side module is isolated strictly
 * for instant offline scenario simulation in Demo Mode.
 *
 * Input: PredictiveImpactInput
 *   rainfall       – mm   (current.rain from Open-Meteo)
 *   humidity       – %    (current.relative_humidity_2m)
 *   temperature    – °C   (current.temperature_2m)
 *   wind           – km/h (current.wind_speed_10m)
 *   month          – 1–12 (JS Date.getMonth() + 1)
 *   mlRiskLevel    – "Low" | "Moderate" | "High" | "Severe"  (from /api/risk)
 *   mlRiskScore    – 0–100                                    (from /api/risk)
 *   historicalRisk – "Low" | "Moderate" | "High" | "Severe" | "Unknown"
 *                    (historicalResult.historicalRisk)
 *   commonImpact   – string  (historicalResult.commonImpact)
 *   patternMatch   – 0–100   (historicalResult.patternMatch)
 *   location       – string  (e.g. "Bhubaneswar")
 *
 * Output: PredictiveImpactResult (documented at the bottom of this file)
 */

// ─── Weather thresholds ───────────────────────────────────────────────────────
// All values are tunable without touching impact logic.
const THRESHOLDS = {
  rainfall: {
    light:    2,    // mm  ≥ 2   → light rain
    moderate: 10,   // mm  ≥ 10  → moderate rain / waterlogging risk
    heavy:    25,   // mm  ≥ 25  → heavy rain / urban flooding
    extreme:  50,   // mm  ≥ 50  → extreme rainfall / severe flooding
  },
  wind: {
    breezy:   30,   // km/h
    strong:   55,   // km/h – structural risk begins
    severe:   80,   // km/h – cyclone-class gusts
    extreme:  110,  // km/h – major cyclone
  },
  temperature: {
    hot:      36,   // °C – heat stress
    extreme:  42,   // °C – extreme heat event
    cold:     15,   // °C – cold stress
  },
  humidity: {
    high:     85,   // %  – combined with heat → heat index risk
    veryHigh: 94,   // %  – heavy convective rainfall likely
  },
};

// ─── Hazard profiles ──────────────────────────────────────────────────────────
// Each profile is a plain object matching the PredictiveImpactResult shape.
// They are TEMPLATES; dynamic values (confidence, explanation) are computed
// below in buildResult() using the actual live inputs.
//
// impactLevel: "Advisory" | "Watch" | "Warning" | "Severe"

const HAZARD_PROFILES = {

  // ── No significant hazard ────────────────────────────────────────────────
  none: {
    hazard: "No Significant Hazard",
    impactLevel: "Advisory",
    affectedAreas: ["General urban areas"],
    affectedInfrastructure: ["None expected"],
    possibleDisruptions: ["Minimal disruption expected under current conditions."],
    vulnerableGroups: ["General public — routine precautions apply."],
    emergencyServices: ["Standard readiness."],
  },

  // ── Waterlogging (moderate rainfall) ────────────────────────────────────
  waterlogging: {
    hazard: "Rainfall — Waterlogging Risk",
    impactLevel: "Watch",
    affectedAreas: [
      "Low-lying residential areas",
      "Underpasses and subways",
      "Open drains and nallahs",
      "Footpaths and pedestrian crossings",
    ],
    affectedInfrastructure: [
      "Urban drainage network",
      "Local roads and lanes",
      "Pedestrian footpaths",
    ],
    possibleDisruptions: [
      "Localised traffic slowdown on waterlogged roads",
      "Pedestrian movement restricted in low-lying areas",
      "Drainage overflow possible in poorly maintained areas",
    ],
    vulnerableGroups: [
      "Pedestrians and cyclists",
      "Residents of low-lying wards",
      "Children and elderly persons outdoors",
    ],
    emergencyServices: [
      "Local municipal drainage teams on standby",
      "Traffic management may be required at flood-prone junctions",
    ],
  },

  // ── Urban flooding (heavy rainfall) ─────────────────────────────────────
  urbanFlooding: {
    hazard: "Heavy Rainfall — Urban Flooding",
    impactLevel: "Warning",
    affectedAreas: [
      "Low-lying residential colonies",
      "Arterial roads and national highways",
      "Underpasses, subways, and tunnels",
      "River banks and waterways",
      "Open markets and ground-floor commercial areas",
    ],
    affectedInfrastructure: [
      "Urban road network — primary and secondary roads",
      "Stormwater drainage infrastructure",
      "Electricity distribution lines",
      "Ground-floor structures in flood-prone zones",
      "Public transport stops and bus shelters",
    ],
    possibleDisruptions: [
      "Road inundation causing significant traffic disruption",
      "Possible short-term power outages due to flooded substations",
      "Public transport delays or route diversions",
      "School and market closures in flood-prone zones",
      "Ground-floor properties at risk of water ingress",
    ],
    vulnerableGroups: [
      "Residents of flood-prone low-lying areas",
      "Daily-wage workers dependent on outdoor work",
      "Children, elderly, and differently-abled persons",
      "Street vendors and homeless individuals",
      "Commuters using two-wheelers",
    ],
    emergencyServices: [
      "ODRAF / NDRF deployment likely for rescue operations",
      "Fire and emergency services on high alert",
      "Hospital emergency departments on flood-casualty standby",
      "Municipal pumping stations activated",
    ],
  },

  // ── Severe / extreme flooding ─────────────────────────────────────────────
  severeFlooding: {
    hazard: "Extreme Rainfall — Severe Flooding",
    impactLevel: "Severe",
    affectedAreas: [
      "Large sections of the city including mid-elevation areas",
      "All low-lying residential and commercial zones",
      "National Highway and State Highways",
      "Railway stations and approaches",
      "Airports and surrounding areas",
    ],
    affectedInfrastructure: [
      "Major road network including NH-16 and NH-316",
      "Railway tracks and level crossings",
      "Power substations and transmission lines",
      "Water supply and sewage treatment plants",
      "Telecommunications infrastructure",
      "Bridges over local waterways",
    ],
    possibleDisruptions: [
      "Widespread road closures and traffic paralysis",
      "Train and bus service suspensions",
      "Mass power outages across multiple wards",
      "Disruption to drinking water supply",
      "Large-scale evacuations from flood-prone zones",
      "Airport operations potentially affected",
    ],
    vulnerableGroups: [
      "Slum and low-income settlements in flood zones",
      "Patients in ground-floor hospital wards",
      "Elderly, children, and physically challenged persons",
      "Livestock and agricultural workers in peri-urban areas",
      "Construction workers in temporary shelters",
    ],
    emergencyServices: [
      "NDRF teams fully deployed for rescue and evacuation",
      "Military assistance may be requisitioned",
      "Blood banks and hospitals on mass-casualty alert",
      "Emergency relief camps activated at designated centres",
      "Helplines and control rooms operating 24 × 7",
    ],
  },

  // ── Cyclone / strong wind ────────────────────────────────────────────────
  cycloneWinds: {
    hazard: "Cyclone / Strong Winds",
    impactLevel: "Warning",
    affectedAreas: [
      "Open spaces, parks, and tree-lined avenues",
      "Coastal and peri-coastal zones",
      "Elevated structures and rooftops",
      "Construction sites",
      "Agricultural areas on the city periphery",
    ],
    affectedInfrastructure: [
      "Overhead power and telecommunications lines",
      "Billboard hoardings and temporary structures",
      "Road signage and traffic signals",
      "Tiled and sheet-roof buildings",
      "Trees along urban roads (risk of uprooting)",
    ],
    possibleDisruptions: [
      "Fallen trees blocking roads and causing traffic disruption",
      "Power cuts due to line damage",
      "Mobile and broadband network outages",
      "Flight diversions or cancellations at regional airport",
      "Construction halted at active sites",
      "Outdoor events and public gatherings cancelled",
    ],
    vulnerableGroups: [
      "Residents of kutcha (non-permanent) housing",
      "Outdoor workers and street vendors",
      "Fishermen and peri-urban communities",
      "Persons in upper floors of multi-storey buildings",
      "Persons under or near large trees",
    ],
    emergencyServices: [
      "Fire services on standby for tree-fall and rescue incidents",
      "Power utility crews pre-positioned for rapid restoration",
      "Airport authority activating contingency procedures",
      "ODRAF teams ready for structural collapse response",
    ],
  },

  // ── Extreme cyclone ───────────────────────────────────────────────────────
  extremeCyclone: {
    hazard: "Extreme Cyclone / Very Severe Winds",
    impactLevel: "Severe",
    affectedAreas: [
      "Entire city and surrounding districts",
      "Coastal zones within 100 km",
      "All peri-urban and rural fringe areas",
    ],
    affectedInfrastructure: [
      "Entire power distribution network",
      "All telecommunications infrastructure",
      "Road, rail, and air transport network",
      "Major government and public buildings",
      "Coastal embankments and sea walls",
    ],
    possibleDisruptions: [
      "Citywide power blackout",
      "Complete shutdown of road and rail transport",
      "Airport closure",
      "Widespread structural damage to buildings",
      "Storm surge risk in low-lying coastal areas",
      "Mass evacuation orders",
    ],
    vulnerableGroups: [
      "All residents — shelter advisory in effect",
      "Coastal fishing communities",
      "Residents of all non-permanent structures",
      "Hospital patients requiring power-dependent care",
    ],
    emergencyServices: [
      "State Disaster Management Authority in full operation",
      "Army / Navy / Coast Guard on standby",
      "Mass evacuation and relief operations activated",
      "National Crisis Management Committee alerted",
    ],
  },

  // ── Extreme heat ──────────────────────────────────────────────────────────
  extremeHeat: {
    hazard: "Extreme Heat Event",
    impactLevel: "Warning",
    affectedAreas: [
      "Open outdoor areas across the city",
      "Industrial zones and construction sites",
      "Agricultural fields on the city fringe",
      "Densely built low-income areas with poor ventilation",
    ],
    affectedInfrastructure: [
      "Railway tracks (thermal expansion risk)",
      "Road surfaces (tar melting / rutting)",
      "Outdoor electrical equipment",
      "Water supply pipelines (pressure loss)",
    ],
    possibleDisruptions: [
      "Heat-related illness and hospitalisation surge",
      "Outdoor work stoppages in peak afternoon hours",
      "Increased electricity demand and potential load-shedding",
      "Water scarcity in areas with poor supply infrastructure",
    ],
    vulnerableGroups: [
      "Outdoor workers (construction, agriculture, street vendors)",
      "Children under 5 and elderly persons over 65",
      "Persons with cardiovascular or respiratory conditions",
      "Homeless individuals without access to shade",
      "Livestock and animals",
    ],
    emergencyServices: [
      "Health department activating heat-action protocol",
      "Hospitals on alert for heat-stroke patients",
      "Cooling centres / shade shelters activated",
      "Public water distribution points set up",
    ],
  },

  // ── Heat stress (moderate heat + high humidity) ───────────────────────────
  heatStress: {
    hazard: "Heat Stress — High Temperature and Humidity",
    impactLevel: "Watch",
    affectedAreas: [
      "Open outdoor areas",
      "Construction sites and industrial zones",
    ],
    affectedInfrastructure: [
      "Outdoor electrical and mechanical equipment",
    ],
    possibleDisruptions: [
      "Reduced outdoor work productivity",
      "Increased hospital OPD visits for heat-related illness",
    ],
    vulnerableGroups: [
      "Outdoor workers and manual labourers",
      "Elderly persons and children",
      "Persons with pre-existing medical conditions",
    ],
    emergencyServices: [
      "Health advisory issued; OPDs on alert for heat illness",
    ],
  },

  // ── Severe combined weather ───────────────────────────────────────────────
  severeWeather: {
    hazard: "Severe Combined Weather Event",
    impactLevel: "Severe",
    affectedAreas: [
      "All areas — citywide severe weather advisory",
      "Particularly vulnerable: low-lying, coastal, and open areas",
    ],
    affectedInfrastructure: [
      "Entire civic infrastructure under stress",
      "Power, water, transport, and telecommunications simultaneously at risk",
    ],
    possibleDisruptions: [
      "Multiple concurrent disruptions across transport, power, and public services",
      "Emergency response resources under high demand",
      "School and office closures possible",
    ],
    vulnerableGroups: [
      "All residents — citywide advisory in effect",
      "Priority: elderly, children, disabled, and homeless persons",
    ],
    emergencyServices: [
      "All emergency services on maximum alert",
      "State-level disaster coordination activated",
    ],
  },
};

// ─── Hazard detector ─────────────────────────────────────────────────────────
/**
 * Determines which hazard profile(s) apply and their relative confidence.
 * Returns an array of { profileKey, confidence } sorted by confidence desc.
 *
 * This is the ONLY function that needs to change when moving from
 * rule-based to an ML/API-based approach in a future stage.
 */
function detectHazardProfile(input) {
  const { rainfall, wind, temperature, humidity, mlRiskScore, mlRiskLevel, patternMatch } = input;

  const candidates = [];

  // ── Wind-based hazards ────────────────────────────────────────────────────
  if (wind >= THRESHOLDS.wind.extreme) {
    candidates.push({ profileKey: "extremeCyclone", confidence: 95 });
  } else if (wind >= THRESHOLDS.wind.severe) {
    candidates.push({ profileKey: "cycloneWinds", confidence: 88 });
  } else if (wind >= THRESHOLDS.wind.strong) {
    candidates.push({ profileKey: "cycloneWinds", confidence: 72 });
  }

  // ── Rainfall-based hazards ────────────────────────────────────────────────
  if (rainfall >= THRESHOLDS.rainfall.extreme) {
    candidates.push({ profileKey: "severeFlooding", confidence: 92 });
  } else if (rainfall >= THRESHOLDS.rainfall.heavy) {
    candidates.push({ profileKey: "urbanFlooding", confidence: 83 });
  } else if (rainfall >= THRESHOLDS.rainfall.moderate) {
    candidates.push({ profileKey: "waterlogging", confidence: 71 });
  }

  // ── Temperature-based hazards ─────────────────────────────────────────────
  if (temperature >= THRESHOLDS.temperature.extreme) {
    candidates.push({ profileKey: "extremeHeat", confidence: 90 });
  } else if (
    temperature >= THRESHOLDS.temperature.hot &&
    humidity >= THRESHOLDS.humidity.high
  ) {
    candidates.push({ profileKey: "heatStress", confidence: 68 });
  } else if (temperature >= THRESHOLDS.temperature.hot) {
    candidates.push({ profileKey: "extremeHeat", confidence: 55 });
  }

  // ── ML risk amplifier ─────────────────────────────────────────────────────
  // When the ML model rates risk as High or Severe, boost the top candidate's
  // confidence and add severeWeather if multiple hazards coincide.
  if (mlRiskLevel === "Severe" || mlRiskScore >= 80) {
    candidates.forEach((c) => {
      c.confidence = Math.min(98, c.confidence + 10);
    });
    if (candidates.length >= 2) {
      candidates.push({ profileKey: "severeWeather", confidence: 85 });
    }
  } else if (mlRiskLevel === "High" || mlRiskScore >= 60) {
    candidates.forEach((c) => {
      c.confidence = Math.min(95, c.confidence + 5);
    });
  }

  // ── Historical pattern amplifier ──────────────────────────────────────────
  // When historical analysis shows high pattern similarity, nudge confidence up.
  if (patternMatch >= 75 && candidates.length > 0) {
    candidates[0].confidence = Math.min(98, candidates[0].confidence + 4);
  }

  // De-duplicate (keep highest confidence per profileKey)
  const seen = new Map();
  for (const c of candidates) {
    if (!seen.has(c.profileKey) || seen.get(c.profileKey) < c.confidence) {
      seen.set(c.profileKey, c.confidence);
    }
  }

  const deduped = Array.from(seen.entries())
    .map(([profileKey, confidence]) => ({ profileKey, confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  // If nothing triggered, return "none"
  if (deduped.length === 0) {
    return [{ profileKey: "none", confidence: 90 }];
  }

  return deduped;
}

// ─── Confidence label ─────────────────────────────────────────────────────────
function confidenceLabel(pct) {
  if (pct >= 85) return "High";
  if (pct >= 65) return "Moderate";
  return "Low";
}

// ─── Impact level rank (for picking the highest across multiple hazards) ───────
const IMPACT_RANK = { Advisory: 1, Watch: 2, Warning: 3, Severe: 4 };

// ─── Explanation builder ──────────────────────────────────────────────────────
function buildImpactExplanation(input, primaryProfile, primaryKey, confidence) {
  const { rainfall, wind, temperature, humidity, mlRiskLevel, mlRiskScore,
          historicalRisk, commonImpact, patternMatch, location } = input;

  const factors = [];
  if (rainfall >= THRESHOLDS.rainfall.moderate) {
    factors.push(`rainfall of ${rainfall} mm`);
  }
  if (wind >= THRESHOLDS.wind.strong) {
    factors.push(`wind gusts of ${wind} km/h`);
  }
  if (temperature >= THRESHOLDS.temperature.hot) {
    factors.push(`temperature of ${temperature}°C`);
  }
  if (humidity >= THRESHOLDS.humidity.high) {
    factors.push(`humidity of ${humidity}%`);
  }
  if (factors.length === 0) {
    factors.push("current mild conditions");
  }

  const factorStr = factors.join(", ");
  const histContext =
    historicalRisk !== "Unknown" && patternMatch > 0
      ? ` Historical analysis shows a ${patternMatch}% pattern match; ` +
        `past similar events in ${location} commonly resulted in ${commonImpact}.`
      : "";

  return (
    `Detected ${primaryProfile.hazard} in ${location} based on ${factorStr}. ` +
    `ML risk assessment: ${mlRiskLevel} (score ${mlRiskScore}/100). ` +
    `If this hazard develops, the primary predicted impact is ` +
    `${primaryProfile.impactLevel}-level disruption ` +
    `(engine confidence: ${confidence}% — ${confidenceLabel(confidence)}).` +
    histContext
  );
}

// ─── Location-based facility impact ───────────────────────────────────────────
/**
 * Derives location-specific facility impacts based on hazard type and location.
 * In Demo Mode, uses predefined facility impacts.
 * In Online Mode, would integrate with facility finder service.
 */
function deriveFacilityImpacts(hazard, location, mlRiskScore) {
  const impacts = {
    affectedFacilities: [],
    accessDifficulty: "Normal",
    recommendedActions: [],
  };

  // Hazard-specific facility impacts
  if (hazard.includes("Flooding") || hazard.includes("Waterlogging")) {
    impacts.affectedFacilities = [
      "Ground-floor hospitals and clinics — patient movement advised",
      "Primary health centers in low-lying areas",
      "Emergency response staging areas",
      "Water treatment and supply stations",
      "Power substations in flood zones",
    ];
    impacts.accessDifficulty = mlRiskScore >= 80 ? "Severe" : "Moderate";
    impacts.recommendedActions = [
      "Move vulnerable patients to upper floors",
      "Pre-position rescue equipment at flood-prone routes",
      "Activate alternate water supply arrangements",
      "Prepare evacuation protocols for ground-floor facilities",
    ];
  } else if (hazard.includes("Cyclone") || hazard.includes("Wind")) {
    impacts.affectedFacilities = [
      "Temporary shelters and tent structures",
      "Overhead electrical and telecom infrastructure",
      "Open-air facilities (markets, playgrounds)",
      "Helicopter landing zones and rooftop access points",
      "Generator and fuel storage facilities",
    ];
    impacts.accessDifficulty = mlRiskScore >= 80 ? "Severe" : "Moderate";
    impacts.recommendedActions = [
      "Secure or relocate temporary structures",
      "Reinforce outdoor signage and structures",
      "Move persons away from tall trees and open areas",
      "Activate indoor shelter protocols",
    ];
  } else if (hazard.includes("Heat")) {
    impacts.affectedFacilities = [
      "Outdoor facilities without shade or cooling",
      "Outdoor clinics and health camps",
      "Labor camps and construction sites",
      "Cooling centers (to be activated)",
    ];
    impacts.accessDifficulty = "Minimal";
    impacts.recommendedActions = [
      "Activate cooling centers and shade shelters",
      "Increase water distribution points",
      "Shift outdoor activities to early morning or evening",
      "Monitor vulnerable groups at medical facilities",
    ];
  }

  return impacts;
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * predictImpacts
 *
 * @param {PredictiveImpactInput} input
 * @returns {PredictiveImpactResult}
 *
 * PredictiveImpactInput:
 *   rainfall       {number}  – mm
 *   humidity       {number}  – %
 *   temperature    {number}  – °C
 *   wind           {number}  – km/h
 *   month          {number}  – 1–12
 *   mlRiskLevel    {string}  – "Low"|"Moderate"|"High"|"Severe"
 *   mlRiskScore    {number}  – 0–100
 *   historicalRisk {string}  – from historicalResult.historicalRisk
 *   commonImpact   {string}  – from historicalResult.commonImpact
 *   patternMatch   {number}  – 0–100, from historicalResult.patternMatch
 *   location       {string}  – e.g. "Bhubaneswar"
 *
 * PredictiveImpactResult:
 *   analysisTime           {string}   – ISO timestamp
 *   location               {string}
 *   hazard                 {string}   – human-readable hazard name
 *   impactLevel            {string}   – "Advisory"|"Watch"|"Warning"|"Severe"
 *   affectedAreas          {string[]}
 *   affectedInfrastructure {string[]}
 *   possibleDisruptions    {string[]}
 *   vulnerableGroups       {string[]}
 *   emergencyServices      {string[]}
 *   affectedFacilities     {string[]} – location-specific facilities at risk
 *   accessDifficulty       {string}   – "Normal"|"Moderate"|"Severe"
 *   recommendedActions     {string[]} – immediate operational actions
 *   confidence             {number}   – 0–100 (rule engine certainty)
 *   confidenceLabel        {string}   – "Low"|"Moderate"|"High"
 *   explanation            {string}   – plain-English narrative
 *   allDetectedHazards     {Array}    – [{hazard, impactLevel, confidence}]
 *                                        all triggered profiles, not just primary
 *   dataSource             {string}
 *   isPredictor            {boolean}  – true: predicted; false: actual (always true for now)
 */
export function predictImpacts(input) {
  const now = new Date();

  // Validate — return safe no-hazard result on missing data
  const { rainfall, humidity, temperature, wind, month, location, mlRiskScore } = input;

  const hasValidWeather =
    Number.isFinite(rainfall) &&
    Number.isFinite(humidity) &&
    Number.isFinite(temperature) &&
    Number.isFinite(wind) &&
    Number.isFinite(month);

  if (!hasValidWeather) {
    return {
      analysisTime: now.toISOString(),
      location: location ?? "Unknown",
      hazard: "Insufficient Data",
      impactLevel: "Advisory",
      affectedAreas: [],
      affectedInfrastructure: [],
      possibleDisruptions: [],
      vulnerableGroups: [],
      emergencyServices: [],
      affectedFacilities: [],
      accessDifficulty: "Normal",
      recommendedActions: [],
      confidence: 0,
      confidenceLabel: "Low",
      explanation: "Insufficient weather data to generate predictive impact assessment.",
      allDetectedHazards: [],
      dataSource: "SKYRA Predictive Impact Network — Stage 1 (Rule-based)",
      isPredictor: true,
    };
  }

  // Detect hazard(s)
  const detected = detectHazardProfile(input);

  // Primary hazard = highest confidence
  const { profileKey: primaryKey, confidence: primaryConf } = detected[0];
  const primaryProfile = HAZARD_PROFILES[primaryKey];

  // Build allDetectedHazards summary (exclude "none" from secondary list)
  const allDetectedHazards = detected
    .filter(({ profileKey }) => profileKey !== "none" || detected.length === 1)
    .map(({ profileKey, confidence }) => ({
      hazard: HAZARD_PROFILES[profileKey]?.hazard ?? profileKey,
      impactLevel: HAZARD_PROFILES[profileKey]?.impactLevel ?? "Advisory",
      confidence,
    }));

  // If multiple hazards, pick the highest impactLevel for the result
  let finalImpactLevel = primaryProfile.impactLevel;
  for (const { impactLevel } of allDetectedHazards) {
    if ((IMPACT_RANK[impactLevel] ?? 0) > (IMPACT_RANK[finalImpactLevel] ?? 0)) {
      finalImpactLevel = impactLevel;
    }
  }

  const explanation = buildImpactExplanation(
    input, primaryProfile, primaryKey, primaryConf
  );

  // Derive location-specific facility impacts
  const facilityImpacts = deriveFacilityImpacts(
    primaryProfile.hazard,
    location,
    mlRiskScore ?? 0
  );

  return {
    analysisTime: now.toISOString(),
    location: location ?? "Current location",
    hazard: primaryProfile.hazard,
    impactLevel: finalImpactLevel,
    affectedAreas: primaryProfile.affectedAreas,
    affectedInfrastructure: primaryProfile.affectedInfrastructure,
    possibleDisruptions: primaryProfile.possibleDisruptions,
    vulnerableGroups: primaryProfile.vulnerableGroups,
    emergencyServices: primaryProfile.emergencyServices,
    affectedFacilities: facilityImpacts.affectedFacilities,
    accessDifficulty: facilityImpacts.accessDifficulty,
    recommendedActions: facilityImpacts.recommendedActions,
    confidence: primaryConf,
    confidenceLabel: confidenceLabel(primaryConf),
    explanation,
    allDetectedHazards,
    dataSource: "SKYRA Predictive Impact Network — Stage 1 (Rule-based)",
    isPredictor: true,
  };
}
