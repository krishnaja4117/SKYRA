/**
 * SKYRA – Actionable Advice Engine (Stage 1)
 * ────────────────────────────────────────────────────────────────────────────
 * Converts detected risks and predicted impacts into clear, prioritised
 * actions the user should take RIGHT NOW.
 *
 * Architecture:
 *
 *   currentWeather
 *   + mlRiskLevel / mlRiskScore      (from /api/risk)
 *   + historicalIntelligenceResult   (from analyzeHistoricalPatterns)
 *   + predictiveImpactResult         (from predictImpacts)
 *                  ↓
 *         generateAdvice(input)
 *                  ↓
 *         ActionableAdviceResult
 *              ↙           ↘
 *        Dashboard     WeatherGPT
 *
 * Design principles:
 *   • Pure function — no side-effects, no randomness.
 *   • Deterministic rule-based logic for Stage 1.
 *   • Advice content driven exclusively by actual detected hazard/risk values.
 *   • Emergency guidance is always conservative and safety-first.
 *   • The advice selection function (selectAdviceProfile) is the only piece
 *     that needs replacing when upgrading to an ML/API backend.
 *   • Does NOT import or modify: predictiveImpact.js, historicalIntelligence.js,
 *     Dashboard, WeatherGPT, /api/risk, Flask, or Open-Meteo.
 *
 * ─── Input (ActionableAdviceInput) ──────────────────────────────────────────
 *   rainfall          {number}  mm      – current.rain (Open-Meteo)
 *   humidity          {number}  %       – current.relative_humidity_2m
 *   temperature       {number}  °C      – current.temperature_2m
 *   wind              {number}  km/h    – current.wind_speed_10m
 *   month             {number}  1–12
 *   mlRiskLevel       {string}  "Low" | "Moderate" | "High" | "Severe"
 *   mlRiskScore       {number}  0–100
 *   historicalRisk    {string}  historicalResult.historicalRisk
 *   patternMatch      {number}  historicalResult.patternMatch  (0–100)
 *   predictedHazard   {string}  predictiveImpactResult.hazard
 *   impactLevel       {string}  predictiveImpactResult.impactLevel
 *   location          {string}  e.g. "Bhubaneswar"
 *
 * ─── Output (ActionableAdviceResult) ────────────────────────────────────────
 *   analysisTime        {string}    ISO timestamp
 *   location            {string}
 *   priority            {string}    "Routine" | "Caution" | "Action" | "Emergency"
 *   priorityColour      {string}    CSS variable name for UI use
 *   title               {string}    short headline
 *   context             {string}    one-sentence why explanation
 *   immediateActions    {string[]}  do these now
 *   avoidActions        {string[]}  do not do these
 *   preparationActions  {string[]}  get ready for potential escalation
 *   emergencyGuidance   {string[]}  if situation worsens / use SOS
 *   explanation         {string}    full plain-language explanation
 *   dataSource          {string}
 */

// ─── Advice thresholds ────────────────────────────────────────────────────────
// Mirror of predictiveImpact.js thresholds — kept here so this module is
// fully self-contained and does not create a circular dependency.
const T = {
  rainfall: { moderate: 10, heavy: 25, extreme: 50 },
  wind:     { strong: 55,   severe: 80, extreme: 110 },
  temperature: { hot: 36,  extreme: 42 },
  humidity:    { high: 85 },
};

// ─── Priority levels ──────────────────────────────────────────────────────────
// Routine   – general awareness, no immediate action needed
// Caution   – monitor conditions, take light precautions
// Action    – take specific protective actions now
// Emergency – immediate danger; use SOS/emergency services if needed
const PRIORITY_COLOUR = {
  Routine:   "var(--green)",
  Caution:   "var(--blue)",
  Action:    "var(--amber)",
  Emergency: "var(--red)",
};

// ─── Advice templates ─────────────────────────────────────────────────────────
// Each entry maps to a hazard scenario.
// Keys match the hazard categories from predictiveImpact.js impactLevel +
// weather thresholds — they are NOT directly imported from that module.
// To add a new scenario: add a key here and a matching rule in selectAdviceProfile.

const ADVICE_TEMPLATES = {

  // ── Routine: no significant hazard ────────────────────────────────────────
  routine: {
    priority: "Routine",
    title: "No Immediate Action Required",
    context: "Current conditions do not indicate a significant weather or disaster risk.",
    immediateActions: [
      "Continue normal activities with standard awareness.",
      "Check the SKYRA forecast periodically for any changes.",
      "Ensure your emergency contacts and documents are accessible.",
    ],
    avoidActions: [
      "Do not ignore sudden changes in weather — conditions can develop quickly.",
    ],
    preparationActions: [
      "Keep a basic emergency kit ready (torch, water, first-aid, phone charger).",
      "Save local emergency numbers in your phone: Police 100, Fire 101, Ambulance 108, Disaster Helpline 1070.",
      "Check the next 24-hour forecast before long-distance travel.",
    ],
    emergencyGuidance: [
      "If conditions deteriorate suddenly, move indoors immediately.",
      "Use SKYRA SOS to alert emergency contacts if needed.",
    ],
  },

  // ── Caution: light rain / minor waterlogging risk ─────────────────────────
  lightRain: {
    priority: "Caution",
    title: "Light Rain — Stay Alert",
    context: "Light rainfall is occurring; minor waterlogging is possible in low-lying areas.",
    immediateActions: [
      "Carry an umbrella or raincoat before going out.",
      "Allow extra travel time — roads may be slippery.",
      "Avoid walking on flooded footpaths or near open drains.",
      "Keep your phone charged.",
    ],
    avoidActions: [
      "Do not walk barefoot near open drains or waterlogged areas.",
      "Avoid using two-wheelers on slippery roads at speed.",
      "Avoid underpasses if there is any standing water.",
    ],
    preparationActions: [
      "Monitor local weather updates from IMD or SKYRA.",
      "Keep emergency contacts accessible.",
      "If you have a basement or ground-floor property, check for early water seepage.",
    ],
    emergencyGuidance: [
      "If waterlogging increases rapidly, move to a higher floor.",
      "Call 112 for emergency assistance.",
      "Use SKYRA SOS if immediate help is needed.",
    ],
  },

  // ── Action: moderate rain / waterlogging ──────────────────────────────────
  waterlogging: {
    priority: "Action",
    title: "Waterlogging Alert — Take Precautions Now",
    context: "Moderate rainfall is causing or may cause waterlogging on roads and low-lying areas.",
    immediateActions: [
      "Avoid low-lying roads, underpasses, and subways — they may be waterlogged.",
      "Stay indoors unless travel is essential.",
      "Move vehicles parked in low-lying areas to higher ground.",
      "Keep your phone fully charged.",
      "Check SKYRA and IMD for the latest rainfall forecast.",
    ],
    avoidActions: [
      "Do not attempt to drive or walk through visibly waterlogged areas.",
      "Do not use underpasses or tunnels if water level is rising.",
      "Avoid areas near open nallahs and drainage channels.",
      "Do not allow children to play near flooded streets or drains.",
    ],
    preparationActions: [
      "Keep emergency supplies accessible: torch, drinking water, medicines, phone power bank.",
      "Identify the nearest elevated shelter in your neighbourhood.",
      "Inform family members of your location.",
      "Place sandbags or water barriers at door entrances if available.",
    ],
    emergencyGuidance: [
      "If water enters your ground floor, move to an upper floor immediately.",
      "Do not attempt to swim or wade through fast-moving water.",
      "Call ODISHA STATE DISASTER HELPLINE: 1070 for local assistance.",
      "Call 112 for immediate police or emergency services.",
      "Use SKYRA SOS to alert your emergency contacts.",
    ],
  },

  // ── Action: heavy rain / urban flooding ───────────────────────────────────
  urbanFlooding: {
    priority: "Action",
    title: "Heavy Rainfall — Urban Flooding Risk",
    context: "Heavy rainfall is in progress; urban flooding is likely on major roads and low-lying areas.",
    immediateActions: [
      "Stay indoors and away from windows during heavy downpours.",
      "Avoid all road travel unless absolutely essential.",
      "Move vehicles to the highest available ground.",
      "Turn off electrical appliances if water is approaching ground-floor level.",
      "Keep emergency bag ready: documents, medicines, water, torch, phone charger.",
      "Monitor SKYRA and IMD Orange/Red alerts.",
    ],
    avoidActions: [
      "Do not drive through flooded roads — even 15 cm of moving water can stall a car.",
      "Do not walk through floodwater — hidden manholes, debris, and electrical hazards.",
      "Do not use lifts in multi-storey buildings during flooding.",
      "Avoid touching or approaching fallen electrical lines.",
      "Do not ignore official evacuation advisories.",
    ],
    preparationActions: [
      "Fill clean water containers in case supply is disrupted.",
      "Charge all devices fully now.",
      "Move valuables, documents, and medicines above floor level.",
      "Identify your nearest official flood relief shelter.",
      "Inform a trusted contact of your exact location.",
    ],
    emergencyGuidance: [
      "If flooding enters your home and water level is rising, move to the highest floor.",
      "Signal from a window or rooftop if you need rescue.",
      "Call NDRF RESCUE: 011-24363260 or ODISHA DISASTER HELPLINE: 1070.",
      "Call 112 for immediate police, fire, or medical assistance.",
      "Activate SKYRA SOS to alert emergency contacts with your location.",
      "Do not attempt self-rescue by swimming in floodwater.",
    ],
  },

  // ── Emergency: severe / extreme flooding ──────────────────────────────────
  severeFlooding: {
    priority: "Emergency",
    title: "Severe Flooding — Emergency Conditions",
    context: "Extreme rainfall has triggered severe flooding; this is an emergency situation.",
    immediateActions: [
      "Move to the highest floor of your building IMMEDIATELY.",
      "Do not attempt to leave unless instructed by official authorities.",
      "Stay away from windows and exterior walls.",
      "Switch off the main electricity supply at the fuse board if safe to do so.",
      "Keep all emergency numbers on hand and phone fully charged.",
    ],
    avoidActions: [
      "Do not enter floodwater under any circumstances.",
      "Do not use staircases if stairwell is flooded.",
      "Do not attempt to drive — all roads may be inundated.",
      "Do not rely on unofficial information — follow official advisories only.",
      "Do not use open flames near potentially gas-contaminated water.",
    ],
    preparationActions: [
      "Assemble emergency bag: water, medicines, documents, torch, food, power bank.",
      "Know the location of your nearest official relief camp.",
      "Keep a whistle or torch to signal for rescue from high ground.",
      "Maintain contact with family and neighbours.",
    ],
    emergencyGuidance: [
      "CALL 112 IMMEDIATELY if you or others are in immediate danger.",
      "NDRF RESCUE HELPLINE: 011-24363260.",
      "ODISHA DISASTER HELPLINE: 1070.",
      "Activate SKYRA SOS — your location will be shared with your emergency contacts.",
      "Move to your roof or highest accessible point and signal rescuers.",
      "Follow ALL official evacuation orders without delay.",
    ],
  },

  // ── Action: strong wind / cyclone watch ───────────────────────────────────
  cycloneWatch: {
    priority: "Action",
    title: "Strong Winds — Cyclone Watch",
    context: "Strong winds are detected; structural and falling-object risk is elevated.",
    immediateActions: [
      "Stay indoors and away from windows and glass doors.",
      "Secure loose objects on balconies, terraces, and gardens.",
      "Park vehicles in a covered or sheltered location away from trees.",
      "Keep emergency kit ready and phone charged.",
      "Monitor official cyclone/wind advisories from IMD.",
    ],
    avoidActions: [
      "Do not go outdoors unless essential — falling trees and debris are a serious hazard.",
      "Avoid standing under or near large trees and billboard hoardings.",
      "Do not park vehicles under trees.",
      "Avoid using umbrellas in gusty conditions — they can act as a sail.",
      "Do not approach coastal or river bank areas.",
    ],
    preparationActions: [
      "Reinforce or tape window glass if possible.",
      "Move to an interior room away from windows during peak gusts.",
      "Store drinking water and food supplies for at least 48 hours.",
      "Charge all devices and keep a battery-powered torch handy.",
      "Identify the nearest cyclone shelter in your area.",
    ],
    emergencyGuidance: [
      "If structural damage occurs, evacuate to a safe building immediately.",
      "Call 112 for fire, injury, or structural collapse emergencies.",
      "Follow all official cyclone shelter and evacuation instructions.",
      "Use SKYRA SOS to alert contacts if you are stranded or injured.",
    ],
  },

  // ── Emergency: severe cyclone ─────────────────────────────────────────────
  severeCyclone: {
    priority: "Emergency",
    title: "Severe Cyclone — Emergency Action Required",
    context: "Very severe wind speeds detected; this is an active cyclone emergency.",
    immediateActions: [
      "TAKE SHELTER IN A STRONG BUILDING IMMEDIATELY.",
      "Move to an interior room on the ground floor or first floor — away from all windows.",
      "Do not go outside under any circumstances.",
      "Switch off electrical mains if flooding is also occurring.",
      "Keep emergency bag, water, and medicines with you.",
    ],
    avoidActions: [
      "Do not go outdoors — extreme winds can cause fatal injuries.",
      "Do not shelter under trees, in temporary structures, or in a vehicle.",
      "Do not use mobile phones near fallen electrical lines.",
      "Do not open windows or doors — sudden pressure change can cause injury.",
    ],
    preparationActions: [
      "Fill water containers — supply may be cut off.",
      "Prepare a 72-hour emergency supply: food, water, medicines, documents.",
      "Keep a hand-crank or battery radio for official updates.",
    ],
    emergencyGuidance: [
      "CALL 112 IMMEDIATELY if you or others need rescue.",
      "NDRF HELPLINE: 011-24363260.",
      "ODISHA CYCLONE HELPLINE: 1070.",
      "Activate SKYRA SOS.",
      "After the storm passes, do not go outside until officials declare it safe.",
      "Beware of downed power lines and weakened structures after the event.",
    ],
  },

  // ── Action: extreme heat ──────────────────────────────────────────────────
  extremeHeat: {
    priority: "Action",
    title: "Extreme Heat — Protect Yourself Now",
    context: "Dangerous heat levels detected; heat stroke and heat exhaustion are serious risks.",
    immediateActions: [
      "Stay indoors or in shaded areas during peak hours (11 AM – 4 PM).",
      "Drink water frequently — at least one glass every 20–30 minutes, even if not thirsty.",
      "Wear light, loose, light-coloured cotton clothing.",
      "Use a wet cloth or fan to cool down if no air conditioning is available.",
      "Check on elderly neighbours, children, and vulnerable persons.",
    ],
    avoidActions: [
      "Do not perform strenuous outdoor work or exercise between 11 AM and 4 PM.",
      "Avoid leaving children or animals in parked vehicles.",
      "Do not consume alcohol, carbonated, or very sugary drinks — they accelerate dehydration.",
      "Avoid direct sun exposure on the head — use a hat or umbrella.",
      "Do not ignore signs of heat exhaustion: heavy sweating, weakness, nausea, pale skin.",
    ],
    preparationActions: [
      "Identify the nearest government cooling centre or shaded public space.",
      "Store adequate drinking water.",
      "Keep ORS (Oral Rehydration Salts) packets at home.",
      "Ensure infants, elderly, and sick persons have access to a cool space.",
    ],
    emergencyGuidance: [
      "Signs of heat stroke: very high body temperature, no sweating, confusion, loss of consciousness.",
      "HEAT STROKE IS A MEDICAL EMERGENCY — call 108 (Ambulance) immediately.",
      "Cool the affected person rapidly: move to shade, apply cool water, fan them.",
      "Call 112 for immediate emergency assistance.",
      "Use SKYRA SOS to alert contacts if you or someone else is in distress.",
    ],
  },

  // ── Caution: heat stress (high temp + humidity) ───────────────────────────
  heatStress: {
    priority: "Caution",
    title: "Heat Stress — Take Precautions",
    context: "High temperature combined with high humidity increases heat stress risk.",
    immediateActions: [
      "Drink water regularly throughout the day.",
      "Reduce outdoor activity during midday hours.",
      "Wear light, breathable clothing.",
      "Rest frequently in shaded areas if working outdoors.",
    ],
    avoidActions: [
      "Do not work outdoors intensively between 12 PM and 3 PM.",
      "Avoid heavy meals — eat lighter, hydrating foods.",
      "Do not ignore persistent headache, dizziness, or cramps — these are early heat-stress signs.",
    ],
    preparationActions: [
      "Keep ORS packets or electrolyte drinks on hand.",
      "Ensure children and elderly have access to cooler indoor environments.",
    ],
    emergencyGuidance: [
      "If heat-related symptoms are severe, call 108 immediately.",
      "Use SKYRA SOS to alert your emergency contacts.",
    ],
  },

  // ── Emergency: severe combined weather ───────────────────────────────────
  severeCombined: {
    priority: "Emergency",
    title: "Severe Combined Weather — Maximum Alert",
    context: "Multiple severe weather hazards are simultaneously active; this is a high-risk emergency.",
    immediateActions: [
      "Seek immediate shelter in the strongest available building.",
      "Stay away from windows, exterior walls, and all water-logged areas.",
      "Turn off electrical mains if flooding is present.",
      "Keep your emergency bag and all critical documents with you.",
      "Monitor ALL official alerts from IMD, OSDMA, and NDRF.",
    ],
    avoidActions: [
      "Do not go outdoors under any circumstances.",
      "Do not ignore ANY official evacuation orders.",
      "Avoid using lifts — use only stairs.",
      "Do not attempt to rescue others unless you are trained and it is safe.",
      "Do not use open flames near flood water (gas leak risk).",
    ],
    preparationActions: [
      "Ensure 72-hour emergency supplies: water, food, medicines, torch, power bank, documents.",
      "Know the exact address of the nearest official relief camp.",
      "Keep multiple emergency contact numbers saved offline.",
    ],
    emergencyGuidance: [
      "CALL 112 IMMEDIATELY for any life-threatening situation.",
      "NDRF HELPLINE: 011-24363260.",
      "ODISHA DISASTER MANAGEMENT HELPLINE: 1070.",
      "Activate SKYRA SOS — your location will be sent to your emergency contacts.",
      "Follow ALL official instructions without delay.",
      "Signal from a safe elevated position if rescue is needed.",
    ],
  },
};

// ─── Priority rank (for escalation) ──────────────────────────────────────────
const PRIORITY_RANK = { Routine: 0, Caution: 1, Action: 2, Emergency: 3 };

// ─── Advice profile selector ──────────────────────────────────────────────────
/**
 * Determines which advice template(s) apply and what priority to assign.
 * Returns { templateKey, priority } for the primary scenario.
 *
 * This function encapsulates ALL rule-based hazard-to-advice mapping.
 * To upgrade to ML/API: replace this function; the rest of the pipeline
 * is unchanged.
 *
 * Escalation logic:
 *   1. Start with the weather-driven base profile.
 *   2. Escalate priority if ML risk is High/Severe.
 *   3. Escalate further if predictedHazard indicates a more severe scenario.
 *   4. Cap at Emergency.
 */
function selectAdviceProfile(input) {
  const {
    rainfall, wind, temperature, humidity,
    mlRiskLevel, mlRiskScore,
    predictedHazard, impactLevel,
  } = input;

  // ── Step 1: Base profile from weather conditions ──────────────────────────
  let templateKey = "routine";
  let priority    = "Routine";

  // Wind dominates when very strong (cyclone scenarios)
  if (wind >= T.wind.extreme) {
    templateKey = "severeCyclone";
    priority    = "Emergency";
  } else if (wind >= T.wind.severe) {
    templateKey = "severeCyclone";
    priority    = "Emergency";
  } else if (wind >= T.wind.strong) {
    templateKey = "cycloneWatch";
    priority    = "Action";
  }

  // Rainfall scenarios (only override if wind hasn't set a higher priority)
  if (rainfall >= T.rainfall.extreme && PRIORITY_RANK[priority] < PRIORITY_RANK["Emergency"]) {
    templateKey = "severeFlooding";
    priority    = "Emergency";
  } else if (rainfall >= T.rainfall.heavy && PRIORITY_RANK[priority] < PRIORITY_RANK["Action"]) {
    templateKey = "urbanFlooding";
    priority    = "Action";
  } else if (rainfall >= T.rainfall.moderate && PRIORITY_RANK[priority] < PRIORITY_RANK["Action"]) {
    templateKey = "waterlogging";
    priority    = "Action";
  } else if (rainfall > 0 && rainfall < T.rainfall.moderate && PRIORITY_RANK[priority] < PRIORITY_RANK["Caution"]) {
    templateKey = "lightRain";
    priority    = "Caution";
  }

  // Heat scenarios (only if no high-priority weather already detected)
  if (PRIORITY_RANK[priority] < PRIORITY_RANK["Action"]) {
    if (temperature >= T.temperature.extreme) {
      templateKey = "extremeHeat";
      priority    = "Action";
    } else if (temperature >= T.temperature.hot && humidity >= T.humidity.high) {
      templateKey = "heatStress";
      priority    = "Caution";
    } else if (temperature >= T.temperature.hot) {
      templateKey = "heatStress";
      priority    = "Caution";
    }
  }

  // ── Step 2: ML risk escalation ────────────────────────────────────────────
  if (mlRiskLevel === "Severe" || mlRiskScore >= 80) {
    if (PRIORITY_RANK[priority] < PRIORITY_RANK["Emergency"]) {
      priority = "Emergency";
      // If the template is not already an emergency template, upgrade it
      if (!["severeFlooding", "severeCyclone", "severeCombined"].includes(templateKey)) {
        templateKey = "severeCombined";
      }
    }
  } else if (mlRiskLevel === "High" || mlRiskScore >= 60) {
    if (PRIORITY_RANK[priority] < PRIORITY_RANK["Action"]) {
      priority = "Action";
    }
  }

  // ── Step 3: Predictive impact escalation ─────────────────────────────────
  // When the predictive impact engine has already flagged Severe impact,
  // ensure we are at Emergency priority.
  if (impactLevel === "Severe" && PRIORITY_RANK[priority] < PRIORITY_RANK["Emergency"]) {
    priority = "Emergency";
    // Upgrade template if it is not already an emergency one
    if (!["severeFlooding", "severeCyclone", "severeCombined"].includes(templateKey)) {
      templateKey = "severeCombined";
    }
  }

  // If predictedHazard mentions cyclone and wind is strong but we haven't
  // already set a cyclone template, upgrade:
  if (
    typeof predictedHazard === "string" &&
    predictedHazard.toLowerCase().includes("cyclone") &&
    !["cycloneWatch", "severeCyclone"].includes(templateKey)
  ) {
    templateKey = "cycloneWatch";
    if (PRIORITY_RANK[priority] < PRIORITY_RANK["Action"]) priority = "Action";
  }

  return { templateKey, priority };
}

// ─── Explanation builder ──────────────────────────────────────────────────────
function buildAdviceExplanation(input, template, priority) {
  const { rainfall, wind, temperature, humidity, mlRiskLevel,
          mlRiskScore, location, predictedHazard, historicalRisk } = input;

  const factors = [];
  if (rainfall >= T.rainfall.moderate) factors.push(`rainfall of ${rainfall} mm`);
  if (wind >= T.wind.strong)           factors.push(`wind speed of ${wind} km/h`);
  if (temperature >= T.temperature.hot) factors.push(`temperature of ${temperature}°C`);
  if (humidity >= T.humidity.high)     factors.push(`humidity of ${humidity}%`);
  if (factors.length === 0)            factors.push("current mild conditions");

  const factorStr = factors.join(", ");

  const riskStr = mlRiskLevel
    ? `ML risk assessment: ${mlRiskLevel} (score ${mlRiskScore}/100).`
    : "";

  const histStr = historicalRisk && historicalRisk !== "Unknown"
    ? ` Historical analysis indicates ${historicalRisk} risk under similar past conditions.`
    : "";

  const hazardStr = predictedHazard && predictedHazard !== "No Significant Hazard"
    ? ` Predicted hazard: ${predictedHazard}.`
    : "";

  return (
    `SKYRA advice for ${location ?? "your location"} — Priority: ${priority}. ` +
    `Detected conditions: ${factorStr}. ${riskStr}${hazardStr}${histStr} ` +
    `Follow the ${priority}-level actions listed above and monitor for updates.`
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * generateAdvice
 *
 * @param {ActionableAdviceInput} input
 * @returns {ActionableAdviceResult}
 */
export function generateAdvice(input) {
  const now = new Date();

  // Validate — return safe routine advice on missing weather data
  const { rainfall, humidity, temperature, wind, month, location } = input;

  const hasValidWeather =
    Number.isFinite(rainfall) &&
    Number.isFinite(humidity) &&
    Number.isFinite(temperature) &&
    Number.isFinite(wind) &&
    Number.isFinite(month);

  if (!hasValidWeather) {
    const t = ADVICE_TEMPLATES.routine;
    return {
      analysisTime:       now.toISOString(),
      location:           location ?? "Unknown",
      priority:           "Routine",
      priorityColour:     PRIORITY_COLOUR.Routine,
      title:              "Weather Data Unavailable",
      context:            "Live weather data could not be loaded. Showing default safety guidance.",
      immediateActions:   t.immediateActions,
      avoidActions:       t.avoidActions,
      preparationActions: t.preparationActions,
      emergencyGuidance:  t.emergencyGuidance,
      explanation:        "Insufficient weather data to generate condition-specific advice.",
      dataSource:         "SKYRA Actionable Advice Engine — Stage 1 (Rule-based)",
    };
  }

  // Select the appropriate advice profile
  const { templateKey, priority } = selectAdviceProfile(input);
  const template = ADVICE_TEMPLATES[templateKey] ?? ADVICE_TEMPLATES.routine;

  // Build the full explanation using live values
  const explanation = buildAdviceExplanation(input, template, priority);

  return {
    analysisTime:       now.toISOString(),
    location:           location ?? "Current location",
    priority,
    priorityColour:     PRIORITY_COLOUR[priority] ?? PRIORITY_COLOUR.Routine,
    title:              template.title,
    context:            template.context,
    immediateActions:   template.immediateActions,
    avoidActions:       template.avoidActions,
    preparationActions: template.preparationActions,
    emergencyGuidance:  template.emergencyGuidance,
    explanation,
    dataSource:         "SKYRA Actionable Advice Engine — Stage 1 (Rule-based)",
  };
}
