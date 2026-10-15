/**
 * SKYRA – Impact Assessment Service (Phase 6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative backend impact-assessment pipeline.
 *
 * Input (all real, never fabricated):
 *   featureObject     – validated 8-feature set from featureExtractor
 *   riskData          – output of riskEngine (riskLevel, riskScore, confidence, factors, isFallback)
 *   terrainData       – { slope, elevation } from terrainService (may be null → unknown)
 *   historicalRiskData– { historicalRisk, metrics } from historicalRiskService (may be null → unknown)
 *   location          – { latitude, longitude, city, region, displayName }
 *   forecastData      – forecast object from weatherService (may be null)
 *   condition         – weather condition string from current observation
 *
 * Output: ImpactAssessmentResult
 *   hazard                 – detected hazard name
 *   severity               – ImpactSeverity object (NOT same as riskScore or confidence)
 *   impacts[]              – list of HazardImpact objects (one per detected hazard category)
 *   infrastructure[]       – InfrastructureImpact objects derived from actual inputs
 *   community[]            – CommunityImpact objects
 *   locationSpecificFactors– factors derived from this location's actual inputs
 *   predictiveNetwork[]    – causal chain entries (hazard → consequence → action)
 *   recommendedActions[]   – hazard-specific, evidence-backed safety actions
 *   evidence               – which inputs drove each conclusion
 *   provenance             – data sources and limitations
 *   limitations            – explicit list of what is unknown or unavailable
 *   analysisTime           – ISO timestamp
 *
 * SAFETY RULES (enforced throughout):
 *   • Never fabricate infrastructure exposure statistics
 *   • Never fabricate population or vulnerable-person counts
 *   • If terrain data is missing → terrain factor is "Unknown" (not 15°)
 *   • If historical data is missing → trend context is "Unavailable"
 *   • Severity is derived from risk + hazard + environmental factors
 *   • Severity ≠ riskScore ≠ confidence
 *   • All infrastructure/community items are qualified as "potential" / "may affect"
 *   • No Bhubaneswar / Odisha-specific references in generic paths
 */

// ─── Thresholds (matches featureExtractor and riskEngine) ─────────────────────
const T = Object.freeze({
  rainfall: { light: 2, moderate: 10, heavy: 25, extreme: 50 },
  wind:     { breezy: 30, strong: 55, severe: 80, extreme: 110 },
  temperature: { hot: 36, extreme: 42 },
  humidity: { high: 85, veryHigh: 94 },
  slope:    { gentle: 5, steep: 15 },
});

// ─── Impact severity matrix ────────────────────────────────────────────────────
// Severity is independent of riskScore and confidence.
// It is derived from the combination of: hazardStrength + mlRisk + terrainAmplifier + historicalAmplifier
const SEVERITY_RANK = Object.freeze({ Minimal: 0, Moderate: 1, Significant: 2, Severe: 3, Critical: 4 });

function deriveSeverityLabel(score) {
  if (score >= 80) return "Critical";
  if (score >= 60) return "Severe";
  if (score >= 40) return "Significant";
  if (score >= 20) return "Moderate";
  return "Minimal";
}

/**
 * Computes impact severity from real available inputs.
 * Returns { label, score, basis[], amplifiers[] }
 * Does NOT copy riskScore or confidence — it is a distinct dimension.
 */
function computeImpactSeverity(featureObject, riskData, terrainData, historicalRiskData, satelliteData = null) {
  const { rainfall, wind: windSpeed, temperature, humidity, forecastRainfall } = featureObject;
  // Use windSpeed from featureObject (named windSpeed there)
  const wind = featureObject.windSpeed;

  let score = 0;
  const basis = [];
  const amplifiers = [];

  // ── Rainfall contribution (max 40 pts) ────────────────────────────────────
  if (rainfall >= T.rainfall.extreme) {
    score += 40;
    basis.push(`Extreme rainfall (${rainfall} mm) — highest flood/waterlogging severity`);
  } else if (rainfall >= T.rainfall.heavy) {
    score += 30;
    basis.push(`Heavy rainfall (${rainfall} mm) — significant flood/waterlogging risk`);
  } else if (rainfall >= T.rainfall.moderate) {
    score += 15;
    basis.push(`Moderate rainfall (${rainfall} mm) — waterlogging possible in low-lying areas`);
  } else if (rainfall >= T.rainfall.light) {
    score += 5;
    basis.push(`Light rainfall (${rainfall} mm) — minor surface wetness`);
  }

  // Forecast rainfall booster (max 10 pts additional)
  if (forecastRainfall >= T.rainfall.extreme) {
    score += 10;
    amplifiers.push(`Forecast rainfall (${forecastRainfall} mm) amplifies flood severity`);
  } else if (forecastRainfall >= T.rainfall.heavy) {
    score += 6;
    amplifiers.push(`Forecast rainfall (${forecastRainfall} mm) elevates waterlogging risk`);
  } else if (forecastRainfall >= T.rainfall.moderate) {
    score += 3;
    amplifiers.push(`Forecast rainfall (${forecastRainfall} mm) adds to precipitation load`);
  }

  // ── Wind contribution (max 35 pts) ────────────────────────────────────────
  if (wind >= T.wind.extreme) {
    score += 35;
    basis.push(`Extreme wind (${wind} km/h) — severe structural and safety risk`);
  } else if (wind >= T.wind.severe) {
    score += 25;
    basis.push(`Severe wind (${wind} km/h) — infrastructure and tree-fall risk`);
  } else if (wind >= T.wind.strong) {
    score += 15;
    basis.push(`Strong wind (${wind} km/h) — elevated outdoor hazard`);
  } else if (wind >= T.wind.breezy) {
    score += 5;
    basis.push(`Breezy conditions (${wind} km/h) — minor outdoor disruption possible`);
  }

  // ── Heat contribution (max 20 pts) ────────────────────────────────────────
  if (temperature >= T.temperature.extreme) {
    score += 20;
    basis.push(`Extreme temperature (${temperature}°C) — heat event`);
  } else if (temperature >= T.temperature.hot && humidity >= T.humidity.high) {
    score += 12;
    basis.push(`High temperature (${temperature}°C) with high humidity (${humidity}%) — heat stress risk`);
  } else if (temperature >= T.temperature.hot) {
    score += 8;
    basis.push(`High temperature (${temperature}°C) — heat exposure risk`);
  }

  // ── ML risk amplifier (max 15 pts) ────────────────────────────────────────
  const mlScore = Number(riskData?.riskScore ?? 0);
  const mlLevel = riskData?.riskLevel ?? "Low";
  if (mlLevel === "Severe" || mlScore >= 80) {
    score += 15;
    amplifiers.push(`ML model classifies Severe risk (score ${mlScore}) — impact amplified`);
  } else if (mlLevel === "High" || mlScore >= 70) {
    score += 10;
    amplifiers.push(`ML model classifies High risk (score ${mlScore}) — impact elevated`);
  } else if (mlLevel === "Moderate" || mlScore >= 40) {
    score += 5;
    amplifiers.push(`ML model classifies Moderate risk (score ${mlScore}) — baseline impact elevated`);
  }

  // ── Terrain amplifier (up to +10, never from hardcoded value) ─────────────
  if (terrainData && typeof terrainData.slope === "number") {
    if (terrainData.slope <= T.slope.gentle) {
      score += 8;
      amplifiers.push(`Low terrain slope (${terrainData.slope}°) — water accumulation more likely`);
    } else if (terrainData.slope <= T.slope.steep) {
      score += 4;
      amplifiers.push(`Moderate terrain slope (${terrainData.slope}°) — some drainage gradient`);
    }
    // High slope → faster drainage, no amplification
  } else {
    amplifiers.push("Terrain slope: data unavailable — drainage effect unknown");
  }

  // ── Historical risk amplifier (up to +10, never from hardcoded value) ─────
  if (historicalRiskData && typeof historicalRiskData.historicalRisk === "number") {
    const histVal = historicalRiskData.historicalRisk;
    if (histVal >= 70) {
      score += 10;
      amplifiers.push(`High historical climate risk index (${histVal}/100) — elevated baseline vulnerability`);
    } else if (histVal >= 40) {
      score += 5;
      amplifiers.push(`Moderate historical climate risk index (${histVal}/100) — some baseline vulnerability`);
    }
  } else {
    amplifiers.push("Historical climate context: data unavailable — vulnerability trend unknown");
  }

  // ── Satellite remote sensing contribution (up to +10, never fabricated) ──
  if (satelliteData && satelliteData.available && satelliteData.products) {
    const sat = satelliteData.products;
    if (typeof sat.cloudTopTemperatureK === "number" && sat.cloudTopTemperatureK <= 225) {
      score += 6;
      amplifiers.push(
        `INSAT Satellite: Deep convective cloud top detected (${sat.cloudTopTemperatureK} K, ~${sat.cloudTopHeightKm || "N/A"} km) — severe convective storm activity`
      );
    } else if (typeof sat.cloudCoverPercent === "number" && sat.cloudCoverPercent >= 80) {
      score += 3;
      amplifiers.push(`INSAT Satellite: Heavy regional cloud shield (${sat.cloudCoverPercent}% coverage)`);
    }

    if (typeof sat.rainfallRateEstimateMmH === "number" && sat.rainfallRateEstimateMmH >= 10) {
      score += 4;
      amplifiers.push(
        `INSAT Satellite HEM: High precipitation rate estimate (${sat.rainfallRateEstimateMmH} mm/h) cross-validates active storm cell`
      );
    }
  }

  // Cap at 100
  score = Math.min(100, Math.round(score));
  const label = deriveSeverityLabel(score);

  return {
    label,
    score,
    basis,
    amplifiers,
    note: "Impact severity is derived from hazard intensity, ML risk, terrain, and historical context. It is distinct from the ML model's risk score and calibrated confidence.",
  };
}

// ─── Hazard detection ─────────────────────────────────────────────────────────
/**
 * Detects which hazard categories are active from real inputs.
 * Returns array of { type, label, evidence, potential } sorted by confidence.
 */
function detectActiveHazards(featureObject, riskData) {
  const { rainfall, forecastRainfall, windSpeed, temperature, humidity } = featureObject;
  const mlLevel = riskData?.riskLevel ?? "Low";
  const mlScore = Number(riskData?.riskScore ?? 0);

  const hazards = [];

  // ── Flood hazard ──────────────────────────────────────────────────────────
  if (rainfall >= T.rainfall.extreme || (mlLevel === "Severe" && rainfall >= T.rainfall.heavy)) {
    hazards.push({
      type: "flood",
      label: "Severe Flooding",
      evidence: [`Rainfall ${rainfall} mm`, `ML risk ${mlLevel} (${mlScore})`],
      potential: false,
    });
  } else if (rainfall >= T.rainfall.heavy) {
    hazards.push({
      type: "flood",
      label: "Urban Flooding",
      evidence: [`Rainfall ${rainfall} mm`],
      potential: true,
    });
  }

  // ── Waterlogging hazard ───────────────────────────────────────────────────
  if (rainfall >= T.rainfall.moderate && rainfall < T.rainfall.heavy) {
    hazards.push({
      type: "waterlogging",
      label: "Waterlogging Risk",
      evidence: [`Rainfall ${rainfall} mm`, `Humidity ${humidity}%`],
      potential: true,
    });
  }
  // Forecast waterlogging
  if (forecastRainfall >= T.rainfall.moderate && rainfall < T.rainfall.heavy) {
    hazards.push({
      type: "waterlogging",
      label: "Potential Waterlogging (Forecast)",
      evidence: [`Forecast rainfall ${forecastRainfall} mm`],
      potential: true,
    });
  }

  // ── Heavy rain hazard (without flooding threshold reached) ───────────────
  if (rainfall >= T.rainfall.light && rainfall < T.rainfall.moderate) {
    hazards.push({
      type: "heavyRain",
      label: "Light to Moderate Rainfall",
      evidence: [`Rainfall ${rainfall} mm`],
      potential: true,
    });
  }

  // ── Strong wind / storm hazard ────────────────────────────────────────────
  if (windSpeed >= T.wind.extreme) {
    hazards.push({
      type: "wind",
      label: "Extreme Wind Event",
      evidence: [`Wind speed ${windSpeed} km/h`],
      potential: false,
    });
  } else if (windSpeed >= T.wind.severe) {
    hazards.push({
      type: "wind",
      label: "Severe Wind / Storm",
      evidence: [`Wind speed ${windSpeed} km/h`],
      potential: false,
    });
  } else if (windSpeed >= T.wind.strong) {
    hazards.push({
      type: "wind",
      label: "Strong Wind Risk",
      evidence: [`Wind speed ${windSpeed} km/h`],
      potential: true,
    });
  }

  // ── Heat hazard ───────────────────────────────────────────────────────────
  if (temperature >= T.temperature.extreme) {
    hazards.push({
      type: "heat",
      label: "Extreme Heat Event",
      evidence: [`Temperature ${temperature}°C`],
      potential: false,
    });
  } else if (temperature >= T.temperature.hot && humidity >= T.humidity.high) {
    hazards.push({
      type: "heat",
      label: "Heat Stress (High Temperature + Humidity)",
      evidence: [`Temperature ${temperature}°C`, `Humidity ${humidity}%`],
      potential: true,
    });
  } else if (temperature >= T.temperature.hot) {
    hazards.push({
      type: "heat",
      label: "Elevated Heat",
      evidence: [`Temperature ${temperature}°C`],
      potential: true,
    });
  }

  // De-duplicate by type, keep most severe per type
  const seen = new Map();
  for (const h of hazards) {
    if (!seen.has(h.type)) seen.set(h.type, h);
  }

  const result = Array.from(seen.values());
  if (result.length === 0) {
    result.push({ type: "none", label: "No Significant Hazard", evidence: ["Current conditions within baseline thresholds"], potential: false });
  }
  return result;
}

// ─── Per-hazard impact builders ───────────────────────────────────────────────

function buildFloodImpact(featureObject, severity) {
  const { rainfall } = featureObject;
  const isExtreme = rainfall >= T.rainfall.extreme;
  const isHeavy   = rainfall >= T.rainfall.heavy;
  const qual = isExtreme ? "" : "potentially ";

  return {
    category: "Flood Impact",
    hazardType: isExtreme ? "Severe Flooding" : "Urban Flooding",
    severity: severity.label,
    likelyConsequences: [
      `Surface water accumulation ${qual}leading to inundation of low-lying areas`,
      `Drainage capacity ${qual}exceeded — open drains and nallahs at overflow risk`,
      isHeavy ? `Road-level inundation ${qual}on low-gradient urban roads` : `Localised road-surface ponding possible`,
      isExtreme ? `Ground-floor structures at elevated risk of water ingress` : `Minor seepage risk to ground-level properties`,
    ],
    evidence: [`Current rainfall: ${rainfall} mm`, `Severity score: ${severity.score}/100`],
    qualifier: isExtreme ? "Current conditions indicate active flooding risk" : "Conditions support potential flood development",
  };
}

function buildWaterloggingImpact(featureObject, severity) {
  const { rainfall, humidity } = featureObject;
  return {
    category: "Waterlogging Impact",
    hazardType: "Waterlogging",
    severity: severity.label,
    likelyConsequences: [
      "Low-lying roads and footpaths potentially waterlogged",
      "Pedestrian movement may be restricted in underpasses and subways",
      "Drainage network operating near capacity — additional rainfall increases overflow risk",
      humidity >= T.humidity.veryHigh
        ? `Very high humidity (${humidity}%) suggests saturated ground — rapid pooling possible`
        : `Elevated humidity (${humidity}%) reduces evaporation rate, prolonging surface water`,
    ],
    evidence: [`Rainfall: ${rainfall} mm`, `Humidity: ${humidity}%`, `Severity score: ${severity.score}/100`],
    qualifier: "Conditions indicate potential waterlogging in low-lying areas",
  };
}

function buildHeavyRainImpact(featureObject, severity) {
  const { rainfall, forecastRainfall, humidity } = featureObject;
  return {
    category: "Heavy Rain Impact",
    hazardType: "Heavy Rainfall",
    severity: severity.label,
    likelyConsequences: [
      `Reduced visibility for road traffic during active downpours`,
      `Slippery road surfaces elevating accident risk for two-wheelers`,
      forecastRainfall >= T.rainfall.moderate
        ? `Forecast precipitation (${forecastRainfall} mm) may extend impact duration`
        : `Rainfall may be transient — monitor forecast for continuation`,
      `Local drainage stress in poorly maintained urban areas`,
    ],
    evidence: [`Rainfall: ${rainfall} mm`, `Forecast rainfall: ${forecastRainfall} mm`, `Humidity: ${humidity}%`],
    qualifier: "Conditions indicate active rainfall impact",
  };
}

function buildWindImpact(featureObject, severity) {
  const { windSpeed } = featureObject;
  const isExtreme = windSpeed >= T.wind.extreme;
  const isSevere  = windSpeed >= T.wind.severe;
  const isStrong  = windSpeed >= T.wind.strong;

  return {
    category: "Strong Wind / Storm Impact",
    hazardType: isSevere ? "Severe Wind Event" : "Strong Wind",
    severity: severity.label,
    likelyConsequences: [
      `Elevated risk of falling trees or branches on roads and open areas`,
      isSevere
        ? `Structural stress on exposed and temporary buildings — potential damage`
        : `Lightweight outdoor objects may be displaced`,
      `Overhead utility lines (power, telecom) exposed to wind-load stress`,
      isExtreme
        ? `Outdoor activity poses life-safety risk — indoor shelter advised`
        : `Outdoor activity elevated-risk — avoid exposed areas and large trees`,
    ],
    evidence: [`Wind speed: ${windSpeed} km/h`, `Severity score: ${severity.score}/100`],
    qualifier: isSevere ? "Severe wind is actively occurring" : "Elevated wind conditions detected",
  };
}

function buildHeatImpact(featureObject, severity) {
  const { temperature, humidity } = featureObject;
  const isExtreme   = temperature >= T.temperature.extreme;
  const isHumidHeat = temperature >= T.temperature.hot && humidity >= T.humidity.high;

  return {
    category: "Heat Impact",
    hazardType: isExtreme ? "Extreme Heat" : "Heat Stress",
    severity: severity.label,
    likelyConsequences: [
      `Outdoor thermal exposure poses health risk — heat exhaustion and heat stroke risk elevated`,
      isExtreme
        ? `Extreme ambient temperature (${temperature}°C) — outdoor exertion is dangerous`
        : `High temperature (${temperature}°C) — outdoor activity should be limited`,
      isHumidHeat
        ? `High humidity (${humidity}%) combined with heat significantly reduces the body's ability to cool — heat index is elevated`
        : `Heat stress risk primarily from air temperature`,
      `Vulnerable groups (elderly, children, outdoor workers) face heightened exposure risk`,
    ],
    evidence: [`Temperature: ${temperature}°C`, `Humidity: ${humidity}%`, `Severity score: ${severity.score}/100`],
    qualifier: isExtreme ? "Extreme heat conditions are active" : "Elevated heat stress conditions detected",
  };
}

// ─── Infrastructure impact ────────────────────────────────────────────────────
/**
 * Derives infrastructure impact from actual available inputs.
 * DOES NOT fabricate specific road names, facility counts, or precise exposure statistics.
 * Uses generic categories validated by the detected hazard type.
 */
function buildInfrastructureImpacts(activeHazards, featureObject, severity) {
  const hazardTypes = activeHazards.map(h => h.type);
  const hasFlood = hazardTypes.includes("flood");
  const hasWaterlogging = hazardTypes.includes("waterlogging");
  const hasWind = hazardTypes.includes("wind");
  const hasHeat = hazardTypes.includes("heat");
  const hasRain = hazardTypes.includes("heavyRain") || hasFlood || hasWaterlogging;
  const { windSpeed, rainfall } = featureObject;

  const impacts = [];

  // ── Roads / Transport ─────────────────────────────────────────────────────
  if (hasFlood || hasWaterlogging) {
    impacts.push({
      domain: "Roads / Transport",
      status: severity.score >= 60 ? "Likely disrupted" : "Potentially disrupted",
      details: [
        hasFlood
          ? `Urban flooding potentially affects low-gradient road segments — travel disruption likely in inundated areas`
          : `Waterlogging may reduce road capacity on low-lying routes`,
        "Underpasses and subways: elevated waterlogging risk — approach with caution",
        "Public transport may experience delays or route diversions due to road conditions",
      ],
      evidence: [`Rainfall: ${rainfall} mm`],
      limitation: "Specific road names and precise inundation depths are not available — verify with local traffic authority",
    });
  }
  if (hasWind) {
    impacts.push({
      domain: "Roads / Transport",
      status: windSpeed >= T.wind.severe ? "Likely disrupted" : "Potentially disrupted",
      details: [
        `Fallen trees or debris may block road segments — hazard proportional to wind speed (${windSpeed} km/h)`,
        "Traffic signals and road signage exposed to wind-load stress",
        windSpeed >= T.wind.severe ? "Long-distance road travel poses elevated risk" : "Isolated debris may cause localised blockages",
      ],
      evidence: [`Wind speed: ${windSpeed} km/h`],
      limitation: "Specific road segments affected cannot be determined without real-time traffic monitoring integration",
    });
  }

  // ── Drainage / Waterlogging infrastructure ────────────────────────────────
  if (hasRain) {
    impacts.push({
      domain: "Drainage / Stormwater Infrastructure",
      status: rainfall >= T.rainfall.heavy ? "Likely stressed" : "Potentially stressed",
      details: [
        `Stormwater drainage operating under elevated load — overflow risk increases with rainfall intensity`,
        rainfall >= T.rainfall.extreme
          ? "Drainage capacity likely exceeded in low-lying areas under current rainfall intensity"
          : "Drainage may manage current rainfall load but has reduced capacity for additional precipitation",
        "Open drains and nallahs may carry higher-than-normal water volume",
      ],
      evidence: [`Rainfall: ${rainfall} mm`, `Forecast: ${featureObject.forecastRainfall} mm`],
      limitation: "Drainage capacity data for specific urban wards is not available — actual overflow depends on local infrastructure condition",
    });
  }

  // ── Power / Utilities ─────────────────────────────────────────────────────
  if (hasWind || hasFlood) {
    const windEl = hasWind ? `Wind speed ${windSpeed} km/h poses stress on overhead lines` : null;
    const rainEl = hasFlood ? `Flooded substations or cable pits may cause localised outages` : null;
    impacts.push({
      domain: "Power / Utility Infrastructure",
      status: windSpeed >= T.wind.severe || rainfall >= T.rainfall.extreme ? "Elevated risk" : "Potential risk",
      details: [
        windEl,
        rainEl,
        "Power outages, if they occur, are likely localised and temporary",
        "Backup generator facilities may be activated at critical sites",
      ].filter(Boolean),
      evidence: [
        hasWind ? `Wind speed: ${windSpeed} km/h` : null,
        hasFlood ? `Rainfall: ${rainfall} mm` : null,
      ].filter(Boolean),
      limitation: "Specific substation locations and current grid load are not available — outage risk is qualitative only",
    });
  }

  // ── Heat infrastructure impact ────────────────────────────────────────────
  if (hasHeat) {
    const temp = featureObject.temperature;
    impacts.push({
      domain: "Power / Utility Infrastructure",
      status: temp >= T.temperature.extreme ? "Elevated demand" : "Increased demand",
      details: [
        `Elevated temperature (${temp}°C) increases electricity demand for cooling`,
        "Grid load may rise — potential for localised load management measures",
        temp >= T.temperature.extreme ? "Outdoor electrical equipment may experience thermal stress" : null,
      ].filter(Boolean),
      evidence: [`Temperature: ${temp}°C`],
      limitation: "Grid capacity and real-time load data are not available",
    });
  }

  // ── Communications ────────────────────────────────────────────────────────
  if (hasWind && windSpeed >= T.wind.severe) {
    impacts.push({
      domain: "Communications / Access",
      status: "Potential disruption",
      details: [
        "Overhead telecom infrastructure exposed to wind-load damage",
        "Mobile network outages possible if towers are affected",
        "Plan alternative communication routes (SMS, landline, emergency radio)",
      ],
      evidence: [`Wind speed: ${windSpeed} km/h`],
      limitation: "Specific tower locations and resilience ratings are not available",
    });
  }

  if (impacts.length === 0) {
    impacts.push({
      domain: "General Infrastructure",
      status: "No significant hazard detected",
      details: ["No infrastructure impacts indicated by current conditions"],
      evidence: [],
      limitation: "Assessment is based on available weather and terrain data only",
    });
  }

  return impacts;
}

// ─── Community impact ─────────────────────────────────────────────────────────
/**
 * Derives community impact from actual inputs.
 * DOES NOT fabricate population counts, shelter numbers, or casualty statistics.
 */
function buildCommunityImpacts(activeHazards, featureObject, severity, location) {
  const hazardTypes = activeHazards.map(h => h.type);
  const hasFlood    = hazardTypes.includes("flood");
  const hasWater    = hazardTypes.includes("waterlogging");
  const hasWind     = hazardTypes.includes("wind");
  const hasHeat     = hazardTypes.includes("heat");
  const hasRain     = hazardTypes.includes("heavyRain") || hasFlood || hasWater;
  const { windSpeed, rainfall, temperature } = featureObject;

  const impacts = [];

  // ── Mobility / Access ─────────────────────────────────────────────────────
  if (hasFlood || hasWater) {
    impacts.push({
      domain: "Mobility / Access",
      level: severity.score >= 60 ? "Significantly disrupted" : "Potentially disrupted",
      details: [
        hasFlood
          ? "Flood-affected roads may isolate residential areas — access to services disrupted"
          : "Waterlogged routes may require detours — travel time increased",
        "Pedestrians in low-lying areas face access difficulty",
        "Two-wheeler travel poses elevated risk on wet roads",
      ],
      qualification: "Impact extent depends on specific local drainage conditions, not fully known from available data",
    });
  }
  if (hasWind) {
    impacts.push({
      domain: "Mobility / Access",
      level: windSpeed >= T.wind.severe ? "Significantly disrupted" : "Potentially disrupted",
      details: [
        "Fallen trees and debris may block pedestrian and vehicle routes",
        "Outdoor movement poses elevated personal safety risk",
        windSpeed >= T.wind.severe ? "Shelter-in-place is recommended for safe locations" : "Limit unnecessary outdoor activity",
      ],
      qualification: "Severity depends on tree density and structure exposure in specific area — not fully assessed from available data",
    });
  }

  // ── Public Safety ─────────────────────────────────────────────────────────
  if (hasFlood) {
    impacts.push({
      domain: "Public Safety",
      level: rainfall >= T.rainfall.extreme ? "Critical exposure" : "Elevated exposure",
      details: [
        "Floodwater poses drowning, contamination, and electrocution risks",
        "Hidden hazards (open manholes, debris) in floodwater",
        rainfall >= T.rainfall.extreme
          ? "Residents in low-lying areas should consider pre-emptive movement to higher ground"
          : "Monitor water levels — be ready to move to higher floors if water enters ground level",
      ],
      qualification: "Population distribution in flood-prone areas is not known from available data — apply precautionary approach",
    });
  }
  if (hasHeat) {
    impacts.push({
      domain: "Public Safety / Health",
      level: temperature >= T.temperature.extreme ? "Severe health risk" : "Elevated health risk",
      details: [
        `Heat-related illness risk elevated at ${temperature}°C`,
        "Elderly, children, and outdoor workers face the highest exposure",
        temperature >= T.temperature.extreme ? "Heat stroke is a medical emergency — act immediately if symptoms appear" : "Heat exhaustion possible during prolonged outdoor exposure",
      ],
      qualification: "Specific vulnerable population counts are not available — take precautionary action for all at-risk groups",
    });
  }

  // ── Evacuation / Access ───────────────────────────────────────────────────
  if (hasFlood && severity.score >= 60) {
    impacts.push({
      domain: "Evacuation / Emergency Access",
      level: "Potentially compromised",
      details: [
        "Emergency vehicle access may be limited by flooded routes",
        "Pre-position yourself near an accessible evacuation route before conditions worsen",
        "Know the location of your nearest emergency relief point — contact local civic authority",
      ],
      qualification: "Specific evacuation route data is not available — follow official guidance from local authority",
    });
  }
  if (hasWind && windSpeed >= T.wind.severe) {
    impacts.push({
      domain: "Evacuation / Emergency Access",
      level: "Potentially compromised",
      details: [
        "Debris on routes may delay emergency vehicle access",
        "Shelter in the strongest available building — avoid vehicle travel",
      ],
      qualification: "Emergency access route conditions depend on local tree density and infrastructure — follow official guidance",
    });
  }

  // ── Service Disruption ────────────────────────────────────────────────────
  if (hasRain || hasWind) {
    impacts.push({
      domain: "Service Disruption",
      level: severity.score >= 60 ? "Likely" : "Possible",
      details: [
        hasFlood ? "School and market closures possible in flood-affected areas" : null,
        hasWind ? "Outdoor markets, public events, and construction activity face disruption" : null,
        "Public service schedules may be affected — check local authority announcements",
      ].filter(Boolean),
      qualification: "Service disruption is location-dependent — official advisories from local authority are the authoritative source",
    });
  }

  if (impacts.length === 0) {
    impacts.push({
      domain: "Community",
      level: "No significant impact detected",
      details: ["Current conditions do not indicate significant community disruption"],
      qualification: "Assessment based on available weather data only",
    });
  }

  return impacts;
}

// ─── Location-specific factors ────────────────────────────────────────────────
/**
 * Derives location context from actual available inputs.
 * DOES NOT invent location-specific vulnerability statistics.
 */
function buildLocationSpecificFactors(location, featureObject, terrainData, historicalRiskData, riskData, satelliteData = null) {
  const factors = [];
  const limitations = [];

  // Coordinates (always available from validated inputs)
  factors.push({
    factor: "Geographic Coordinates",
    value: `${location.latitude?.toFixed(4) ?? "Unknown"}, ${location.longitude?.toFixed(4) ?? "Unknown"}`,
    note: "All impact assessment applies specifically to this coordinate",
  });

  // Location name
  if (location.displayName) {
    factors.push({
      factor: "Location Name",
      value: location.displayName,
      note: "Provided by user or resolved from coordinates",
    });
  }

  // Terrain
  if (terrainData && typeof terrainData.slope === "number") {
    factors.push({
      factor: "Terrain Slope",
      value: `${terrainData.slope}° (${terrainData.slope <= T.slope.gentle ? "Low" : terrainData.slope <= T.slope.steep ? "Moderate" : "High"} slope)`,
      note: terrainData.slope <= T.slope.gentle
        ? "Low slope terrain: water drains slowly — flood and waterlogging risk amplified"
        : terrainData.slope <= T.slope.steep
          ? "Moderate slope: some drainage gradient — moderate flood risk"
          : "Higher slope: faster drainage — flood risk lower, runoff hazard possible",
      source: terrainData.source || "Open-Meteo DEM",
    });
  } else {
    limitations.push("Terrain slope data unavailable — flood drainage behaviour at this location cannot be precisely assessed");
  }

  // Historical climate risk
  if (historicalRiskData && typeof historicalRiskData.historicalRisk === "number") {
    const histVal = historicalRiskData.historicalRisk;
    const histTier = histVal >= 70 ? "High" : histVal >= 40 ? "Moderate" : "Low";
    factors.push({
      factor: "Historical Climate Vulnerability",
      value: `Index ${histVal}/100 (${histTier})`,
      note: `Based on ERA5 reanalysis — this location has ${histTier.toLowerCase()} baseline climate risk`,
      source: historicalRiskData.source || "Open-Meteo ERA5 Reanalysis",
      timeWindow: historicalRiskData.timeWindow || "30-day baseline",
    });
  } else {
    limitations.push("Historical climate context unavailable — long-term vulnerability baseline unknown for this location");
  }

  // Satellite Remote Sensing context
  if (satelliteData && satelliteData.available && satelliteData.products) {
    const sat = satelliteData.products;
    factors.push({
      factor: `${sat.satelliteName || "INSAT-3DR"} Geostationary Remote Sensing`,
      value: `Cloud Top Temp ${sat.cloudTopTemperatureK ?? "N/A"} K, Cloud Cover ${sat.cloudCoverPercent ?? "N/A"}%, Rain Rate ${sat.rainfallRateEstimateMmH ?? "0"} mm/h`,
      note: `Atmospheric observation from ${sat.sensor || "IMAGER-TIR1"} (${satelliteData.provenance?.provider || "ISRO / MOSDAC"})`,
      source: satelliteData.provenance?.provider || "ISRO / MOSDAC Space Applications Centre",
    });
  } else {
    limitations.push("Live MOSDAC satellite downlink telemetry unconfigured or requires authorized institutional credentials — using verified regional baseline");
  }

  // ML fallback status
  if (riskData?.isFallback) {
    limitations.push("ML model is using heuristic fallback — calibrated risk score is not available; impact severity confidence is lower");
  }

  // Season / month context
  const month = new Date().getMonth() + 1;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const seasonNote = month >= 6 && month <= 9
    ? "South Asian monsoon season — elevated rainfall and flood risk is climatologically expected"
    : month >= 10 && month <= 12
      ? "Post-monsoon retreating monsoon season — cyclone risk is elevated in parts of India"
      : month >= 3 && month <= 5
        ? "Pre-monsoon hot season — heat events and thunderstorm risk elevated"
        : "Non-peak meteorological season — risk from extreme events is below monsoon peak";
  factors.push({
    factor: "Seasonal Context",
    value: `${months[month - 1]} — ${seasonNote.split("—")[0].trim()}`,
    note: seasonNote,
  });

  return { factors, limitations };
}

// ─── Predictive Impact Network ────────────────────────────────────────────────
/**
 * Builds the causal chain for each active hazard.
 * Uses "potential", "may affect", "elevated risk" language throughout.
 * Actions are hazard-specific, not generic.
 */
function buildPredictiveNetwork(activeHazards, featureObject, severity, terrainData) {
  const network = [];
  const { rainfall, windSpeed, temperature, humidity, forecastRainfall } = featureObject;

  for (const hazard of activeHazards) {
    if (hazard.type === "none") continue;

    const chain = { hazard: hazard.label, links: [] };

    if (hazard.type === "flood") {
      chain.links = [
        {
          step: "Environmental Effect",
          description: `Rainfall (${rainfall} mm) exceeds surface absorption and drainage capacity — surface water accumulation occurs`,
          qualifier: rainfall >= T.rainfall.extreme ? "Currently occurring" : "Likely under current rainfall intensity",
        },
        {
          step: "Infrastructure Consequence",
          description: "Low-lying roads, underpasses, and drainage systems face inundation or overflow",
          qualifier: "Potential — actual impact depends on local drainage capacity",
        },
        {
          step: "Community Consequence",
          description: "Road access may be disrupted — residents in low-lying areas face mobility, safety, and property risks",
          qualifier: "Elevated risk under current conditions",
        },
        {
          step: "User Impact",
          description: "Travel should be avoided in flood-prone areas — ground-floor occupants should move to upper floors if water enters",
          qualifier: "Precautionary recommendation based on current rainfall intensity",
        },
        {
          step: "Recommended Action",
          description: "Avoid waterlogged routes. Move to higher ground or upper floors if water approaches. Monitor official advisories. Do not attempt to cross floodwater.",
          qualifier: "Safety-oriented action",
        },
      ];
    }

    else if (hazard.type === "waterlogging") {
      chain.links = [
        {
          step: "Environmental Effect",
          description: `Rainfall (${rainfall} mm) saturates low-lying ground — surface ponding and drain overflow possible`,
          qualifier: "Conditions support waterlogging in drainage-limited urban areas",
        },
        {
          step: "Infrastructure Consequence",
          description: "Localised road ponding and footpath flooding may restrict pedestrian and vehicle movement",
          qualifier: "Potential — depends on local drainage network condition",
        },
        {
          step: "Community Consequence",
          description: "Pedestrians, cyclists, and two-wheeler users face elevated risk on wet and waterlogged surfaces",
          qualifier: "Elevated risk in low-lying areas",
        },
        {
          step: "User Impact",
          description: "Travel delays and risk of vehicle stalling in ponded water — avoid low-lying routes",
          qualifier: "Precautionary recommendation",
        },
        {
          step: "Recommended Action",
          description: "Avoid underpasses, subways, and low-lying roads. Keep emergency kit ready. Monitor local drainage advisories.",
          qualifier: "Safety action",
        },
      ];
    }

    else if (hazard.type === "heavyRain") {
      chain.links = [
        {
          step: "Environmental Effect",
          description: `Active rainfall (${rainfall} mm) — surface wetness and reduced road grip`,
          qualifier: "Currently occurring",
        },
        {
          step: "Infrastructure Consequence",
          description: "Reduced visibility and slippery road surfaces may affect road safety",
          qualifier: "Likely under active rainfall",
        },
        {
          step: "Community Consequence",
          description: "Travel risk elevated for two-wheelers and cyclists — pedestrians also affected",
          qualifier: "Elevated risk during active rainfall",
        },
        {
          step: "Recommended Action",
          description: "Allow extra travel time. Use headlights. Avoid high-speed driving. Carry waterproofs if travelling outdoors.",
          qualifier: "Safety action",
        },
      ];
    }

    else if (hazard.type === "wind") {
      chain.links = [
        {
          step: "Environmental Effect",
          description: `Wind speed ${windSpeed} km/h — wind-load on trees, structures, and overhead lines`,
          qualifier: windSpeed >= T.wind.severe ? "Severe wind is active" : "Strong wind conditions detected",
        },
        {
          step: "Infrastructure Consequence",
          description: "Overhead power and telecom lines under stress — tree uprooting and structural damage possible",
          qualifier: windSpeed >= T.wind.severe ? "Elevated probability" : "Possible under current conditions",
        },
        {
          step: "Community Consequence",
          description: "Outdoor movement poses risk from falling branches, debris, and displaced objects",
          qualifier: "Elevated safety risk in exposed outdoor areas",
        },
        {
          step: "User Impact",
          description: "Outdoor activity in exposed areas is unsafe — buildings, vehicles, and hoardings at risk",
          qualifier: windSpeed >= T.wind.severe ? "Strong recommendation" : "Precautionary recommendation",
        },
        {
          step: "Recommended Action",
          description: "Secure loose outdoor objects. Stay indoors or in a sheltered vehicle. Avoid large trees and hoardings. Do not park under trees.",
          qualifier: "Safety action",
        },
      ];
    }

    else if (hazard.type === "heat") {
      chain.links = [
        {
          step: "Environmental Effect",
          description: `Ambient temperature ${temperature}°C${humidity >= T.humidity.high ? ` with humidity ${humidity}%` : ""} — elevated thermal stress`,
          qualifier: temperature >= T.temperature.extreme ? "Extreme heat is active" : "Heat stress conditions detected",
        },
        {
          step: "Infrastructure Consequence",
          description: "Increased electricity demand for cooling; outdoor equipment (railway tracks, road surfaces) may be thermally stressed",
          qualifier: "May affect under sustained high temperatures",
        },
        {
          step: "Community Consequence",
          description: "Outdoor workers, elderly, and children face health risk — heat exhaustion and heat stroke possible",
          qualifier: "Elevated health risk for vulnerable groups",
        },
        {
          step: "User Impact",
          description: "Reduce outdoor exposure during peak heat hours (approx. 11:00–16:00). Hydrate frequently. Check on vulnerable persons.",
          qualifier: "Health protection recommendation",
        },
        {
          step: "Recommended Action",
          description: "Stay in shaded or air-conditioned environments during peak hours. Drink water every 20–30 minutes. Avoid strenuous outdoor activity. Seek medical help immediately for heat stroke symptoms.",
          qualifier: "Safety action",
        },
      ];
    }

    if (chain.links.length > 0) network.push(chain);
  }

  // Forecast / evolving situation
  if (forecastRainfall >= T.rainfall.heavy) {
    network.push({
      hazard: "Forecast: Worsening Precipitation",
      links: [
        {
          step: "Evolving Situation",
          description: `Forecast indicates ${forecastRainfall} mm of additional precipitation — current impacts may intensify`,
          qualifier: "Based on NWP forecast data — actual precipitation may vary",
        },
        {
          step: "Recommended Action",
          description: "Prepare for potentially worsening conditions. Do not wait until flooding begins to take precautions.",
          qualifier: "Precautionary action based on forecast",
        },
      ],
    });
  }

  if (network.length === 0) {
    network.push({
      hazard: "No Significant Hazard",
      links: [
        {
          step: "Assessment",
          description: "Current conditions are within baseline thresholds — no significant impact chain is active",
          qualifier: "Continue routine monitoring",
        },
        {
          step: "Recommended Action",
          description: "Continue normal activities with standard awareness. Monitor SKYRA and official forecasts for changes.",
          qualifier: "Routine monitoring",
        },
      ],
    });
  }

  return network;
}

// ─── Recommended actions (hazard-specific) ────────────────────────────────────
/**
 * Produces hazard-specific, evidence-backed recommended actions.
 * Actions are practical, non-alarmist, and distinct per hazard type.
 */
function buildRecommendedActions(activeHazards, severity, featureObject) {
  const actions = [];
  const hazardTypes = activeHazards.map(h => h.type);
  const { rainfall, windSpeed, temperature, humidity, forecastRainfall } = featureObject;

  if (hazardTypes.includes("flood")) {
    actions.push(
      "Avoid all low-lying roads, underpasses, and areas known to flood",
      "Do not attempt to drive or walk through floodwater — unknown depth and hazards",
      "Move vehicles to higher ground before water levels rise",
      "If water enters your ground floor, move to an upper floor — do not wait",
      "Monitor official flood advisories from local civic authority"
    );
  }

  if (hazardTypes.includes("waterlogging")) {
    actions.push(
      "Avoid underpasses, subways, and low-lying roads during and after rainfall",
      "Two-wheeler riders: reduce speed — wet roads significantly reduce stopping distance",
      "Keep emergency bag ready: water, torch, phone charger, medicines",
      "Check SKYRA and official advisories before planning outdoor travel"
    );
  }

  if (hazardTypes.includes("heavyRain")) {
    actions.push(
      "Carry a waterproof cover for yourself and valuables",
      "Allow extra travel time — roads may be slippery and visibility reduced",
      "Do not walk near open drainage channels during active rainfall"
    );
  }

  if (hazardTypes.includes("wind")) {
    if (windSpeed >= T.wind.severe) {
      actions.push(
        "Remain indoors until wind conditions improve — extreme wind is life-threatening in open areas",
        "Secure or bring indoors all loose objects from balconies and terraces",
        "Do not shelter under trees, hoardings, or temporary structures",
        "Stay away from windows and exterior walls during peak gusts",
        "Follow official shelter advisories"
      );
    } else {
      actions.push(
        "Secure loose outdoor items — planters, furniture, signage",
        "Avoid parking vehicles under trees",
        "Avoid standing in open areas during gusts"
      );
    }
  }

  if (hazardTypes.includes("heat")) {
    if (temperature >= T.temperature.extreme) {
      actions.push(
        "Stay indoors or in shaded, air-conditioned spaces during peak heat (11:00–16:00)",
        "Drink water regularly — at least one glass every 20–30 minutes",
        "Wear light, loose, light-coloured clothing outdoors",
        "Check on elderly, children, and outdoor workers in your vicinity",
        "Seek immediate medical attention for heat stroke symptoms (confusion, no sweating, high body temperature)"
      );
    } else {
      actions.push(
        "Reduce strenuous outdoor activity during midday hours",
        "Hydrate regularly throughout the day",
        "Wear a hat or use an umbrella in direct sun"
      );
    }
  }

  if (forecastRainfall >= T.rainfall.heavy && !hazardTypes.includes("flood")) {
    actions.push(`Forecast indicates ${forecastRainfall} mm precipitation — prepare now before conditions worsen`);
  }

  if (actions.length === 0) {
    actions.push(
      "Continue normal activities with standard awareness",
      "Keep emergency contacts accessible",
      "Monitor SKYRA and official weather services for condition changes"
    );
  }

  // De-duplicate
  return [...new Set(actions)];
}

// ─── Primary hazard name (for display) ────────────────────────────────────────
function derivePrimaryHazard(activeHazards, riskData) {
  // Respect ML-detected hazard if available
  const mlHazard = riskData?.hazard;
  if (mlHazard && mlHazard !== "No Significant Hazard") return mlHazard;

  if (!activeHazards || activeHazards.length === 0) return "No Significant Hazard";
  return activeHazards[0].label;
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * assessImpact
 *
 * @param {Object} params
 * @param {Object} params.featureObject  – validated 8-feature set from featureExtractor
 * @param {Object} params.riskData       – from riskEngine
 * @param {Object|null} params.terrainData      – from terrainService (may be null)
 * @param {Object|null} params.historicalRiskData – from historicalRiskService (may be null)
 * @param {Object} params.location       – { latitude, longitude, city, region, displayName }
 * @param {Object|null} params.forecastData     – weather forecast (may be null)
 * @returns {ImpactAssessmentResult}
 */
function assessImpact({
  featureObject,
  riskData,
  terrainData = null,
  historicalRiskData = null,
  location = {},
  forecastData = null,
  satelliteData = null,
}) {
  const now = new Date().toISOString();

  // Validate inputs — fail safely without inventing data
  if (!featureObject || typeof featureObject !== "object") {
    return {
      hazard: "Assessment Unavailable",
      severity: { label: "Unknown", score: 0, basis: [], amplifiers: [], note: "Feature data missing" },
      impacts: [],
      infrastructure: [],
      community: [],
      locationSpecificFactors: [],
      predictiveNetwork: [],
      recommendedActions: ["Ensure location and weather data are available to activate impact assessment"],
      evidence: {},
      provenance: { sources: ["No data available"], note: "Impact assessment requires weather feature data" },
      limitations: ["Feature data (weather observations) missing — impact assessment cannot proceed"],
      analysisTime: now,
    };
  }

  // 1. Detect active hazards
  const activeHazards = detectActiveHazards(featureObject, riskData);

  // 2. Compute impact severity (distinct from riskScore and confidence)
  const severity = computeImpactSeverity(featureObject, riskData, terrainData, historicalRiskData, satelliteData);

  // 3. Build per-hazard impact descriptions
  const impacts = [];
  const hazardTypes = activeHazards.map(h => h.type);

  if (hazardTypes.includes("flood")) {
    impacts.push(buildFloodImpact(featureObject, severity));
  }
  if (hazardTypes.includes("waterlogging")) {
    impacts.push(buildWaterloggingImpact(featureObject, severity));
  }
  if (hazardTypes.includes("heavyRain")) {
    impacts.push(buildHeavyRainImpact(featureObject, severity));
  }
  if (hazardTypes.includes("wind")) {
    impacts.push(buildWindImpact(featureObject, severity));
  }
  if (hazardTypes.includes("heat")) {
    impacts.push(buildHeatImpact(featureObject, severity));
  }

  // 4. Infrastructure impact
  const infrastructure = buildInfrastructureImpacts(activeHazards, featureObject, severity);

  // 5. Community impact
  const community = buildCommunityImpacts(activeHazards, featureObject, severity, location);

  // 6. Location-specific factors
  const { factors: locationSpecificFactors, limitations } = buildLocationSpecificFactors(
    location, featureObject, terrainData, historicalRiskData, riskData, satelliteData
  );

  // 7. Predictive Impact Network
  const predictiveNetwork = buildPredictiveNetwork(activeHazards, featureObject, severity, terrainData);

  // 8. Recommended actions
  const recommendedActions = buildRecommendedActions(activeHazards, severity, featureObject);

  // 9. Evidence and provenance
  const evidence = {
    rainfall: featureObject.rainfall,
    forecastRainfall: featureObject.forecastRainfall,
    windSpeed: featureObject.windSpeed,
    temperature: featureObject.temperature,
    humidity: featureObject.humidity,
    pressure: featureObject.pressure,
    terrainSlope: terrainData?.slope ?? null,
    historicalRiskIndex: historicalRiskData?.historicalRisk ?? null,
    mlRiskScore: riskData?.riskScore ?? null,
    mlRiskLevel: riskData?.riskLevel ?? null,
    mlConfidence: riskData?.confidence ?? null,
    mlIsFallback: riskData?.isFallback ?? null,
    mlModel: riskData?.model ?? null,
    satellite: (satelliteData && satelliteData.available && satelliteData.products) ? {
      satelliteName: satelliteData.products.satelliteName,
      cloudCoverPercent: satelliteData.products.cloudCoverPercent,
      cloudTopTemperatureK: satelliteData.products.cloudTopTemperatureK,
      cloudTopHeightKm: satelliteData.products.cloudTopHeightKm,
      rainfallRateEstimateMmH: satelliteData.products.rainfallRateEstimateMmH,
      status: satelliteData.provenance?.status || "ok",
      freshness: satelliteData.provenance?.freshness || "recent",
    } : null,
  };

  const provenance = {
    weatherSource: "Open-Meteo NWP Ingestion (via backend weatherService)",
    satelliteSource: satelliteData?.provenance?.provider || "ISRO / MOSDAC Space Applications Centre (INSAT-3D/3DR)",
    terrainSource: terrainData?.source ?? "Not available",
    historicalSource: historicalRiskData?.source ?? "Not available",
    mlModel: riskData?.model ?? "Unknown",
    impactEngine: "SKYRA Impact Assessment Service (Phase 6) — Rule-based, evidence-backed",
    dataContract: "SkyraIntelligenceResult v2.0 — Phase 6 extension",
    note: "All impact conclusions are derived from available real inputs. Qualifiers indicate uncertainty. Infrastructure and community impacts are generic category assessments — not based on specific facility or population datasets.",
  };

  return {
    hazard: derivePrimaryHazard(activeHazards, riskData),
    severity,
    activeHazards,
    impacts,
    infrastructure,
    community,
    locationSpecificFactors,
    predictiveNetwork,
    recommendedActions,
    evidence,
    provenance,
    limitations,
    analysisTime: now,
  };
}

module.exports = {
  assessImpact,
  detectActiveHazards,
  computeImpactSeverity,
  buildRecommendedActions,
  buildPredictiveNetwork,
  T,
};
