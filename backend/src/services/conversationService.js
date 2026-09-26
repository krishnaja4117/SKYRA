/**
 * SKYRA – Conversational Intelligence Service (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * Central orchestrator connecting user questions, intent classification,
 * contextual location/time resolution, live telemetry ingestion, ML risk,
 * XAI "Why This Risk?", impact assessments, and RAG disaster guidance.
 *
 * Core Guarantees:
 *   • Real Application Data: Uses live Open-Meteo weather and canonical models
 *   • Immutable ML Results: The LLM NEVER computes, mutates, or overrides risk scores
 *   • Follow-Up Resolution: Understands multi-turn conversational context
 *   • Grounded Evidence: Answers cite official sources ([Citation X]) via Phase 8 RAG
 *   • Epistemic Abstention: Transparently admits when data or guidance is unavailable
 *   • Zero Secret Leakage: API keys are strictly server-side and never returned
 */

const { classifyIntent } = require("./conversationIntentService");
const { getIntelligenceForLocation } = require("./intelligenceService");
const { getRagRetrievalService } = require("./ragRetrievalService");
const { buildEvidencePack } = require("./evidencePackService");
const { evaluateAbstention } = require("./abstentionService");
const { getLlmService } = require("./llmService");
const { resolveCoordinatesForCity } = require("./locationService");

/**
 * Generates dynamic, context-aware suggested follow-up questions.
 *
 * @param {string} intent
 * @param {string} riskLevel
 * @param {string} [hazard]
 * @returns {string[]}
 */
function generateFollowUps(intent, riskLevel, hazard) {
  const followUps = [];

  switch (intent) {
    case "WEATHER_CURRENT":
      followUps.push("Will it rain later today?", "What is the current risk level?", "What about tomorrow?");
      break;

    case "WEATHER_FORECAST":
      followUps.push("Will the risk increase tonight?", "Is there flood risk?", "What should I do to prepare?");
      break;

    case "RISK_QUERY":
      followUps.push("Why is the risk evaluated this way?", "What areas could be affected?", "What actions should I take?");
      break;

    case "XAI_EXPLANATION":
      followUps.push("What areas could be affected?", "What should I do now?", "Will the weather worsen tomorrow?");
      break;

    case "IMPACT_QUERY":
      followUps.push("What should I do to stay safe?", "What are the emergency numbers?", "Why is the risk high?");
      break;

    case "DISASTER_GUIDANCE":
      followUps.push("What are the official helpline numbers?", "Why is this area vulnerable?", "What is the latest weather forecast?");
      break;

    case "EMERGENCY":
      followUps.push("Where are the nearest relief shelters?", "What should I carry when evacuating?", "How do I report trapped persons?");
      break;

    default:
      if (riskLevel === "Severe" || riskLevel === "High") {
        followUps.push("Why is the risk high?", "What should I do now?", "Are there emergency helplines?");
      } else {
        followUps.push("What is the current weather?", "Is there any flood risk?", "Will it rain tomorrow?");
      }
      break;
  }

  return followUps;
}

/**
 * Processes a conversational message end-to-end.
 *
 * @param {Object} params
 * @param {string} params.message - User question
 * @param {Object} [params.locationContext] - { latitude, longitude, locationName }
 * @param {Array<Object>} [params.conversationHistory=[]] - Prior chat turns
 * @param {Object} [params.customInputs] - Test/simulation overrides
 * @param {Object} [params.options]
 * @returns {Promise<Object>}
 */
async function processConversationalMessage(params = {}) {
  const {
    message,
    locationContext = {},
    conversationHistory = [],
    customInputs = null,
    options = {},
  } = params;

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      success: false,
      error: "ERR_EMPTY_MESSAGE",
      message: "Please provide a valid question or message.",
      answer: "I am ready. Ask me any question about the current weather, forecast, risk levels, or disaster safety.",
    };
  }

  const cleanMessage = message.trim();

  // 1. Classify Intent & Contextual Entities
  const intentAnalysis = classifyIntent(cleanMessage, conversationHistory);
  const { intent, hazard, timeTarget, isFollowUp } = intentAnalysis;

  // 2. Resolve Location Coordinates
  let lat = locationContext.latitude;
  let lon = locationContext.longitude;
  let locName = locationContext.locationName || locationContext.name || "Your Location";

  // Check if query explicitly mentions a major city
  const cityMatch = resolveCoordinatesForCity(cleanMessage);
  if (cityMatch) {
    lat = cityMatch.latitude;
    lon = cityMatch.longitude;
    locName = cityMatch.name;
  }

  // Fallback coordinates if location is entirely unspecified
  const hasCoordinates = typeof lat === "number" && !isNaN(lat) && typeof lon === "number" && !isNaN(lon);

  // 3. Fetch Real-time Telemetry & Intelligence (ML, XAI, Impact)
  let intelligence = null;
  let weatherData = null;
  let forecastData = null;
  let riskData = null;
  let xaiData = null;
  let impactData = null;

  if (hasCoordinates) {
    try {
      intelligence = await getIntelligenceForLocation({
        latitude: lat,
        longitude: lon,
        locationName: locName,
        customInputs,
      });

      if (intelligence) {
        const cur = intelligence.currentWeather || intelligence.current || {};
        weatherData = {
          temperature: cur.temperature,
          humidity: cur.humidity,
          windSpeed: cur.windSpeed,
          rainfall: cur.rainfall != null ? cur.rainfall : 0,
          pressure: cur.surfacePressure || cur.pressure,
          condition: cur.condition,
        };

        const fcast = intelligence.forecast || {};
        forecastData = {
          hourly: fcast.hourly || [],
          expectedRainfall: fcast.precipitationExpected != null ? fcast.precipitationExpected : (fcast.expectedRainfall || 0),
          maxProbability: fcast.maxRainProbability != null ? fcast.maxRainProbability : (fcast.maxProbability || 0),
        };

        riskData = {
          riskLevel: intelligence.riskLevel,
          riskScore: intelligence.riskScore,
          confidence: intelligence.confidence,
          isFallback: Boolean(intelligence.isFallback),
        };
        xaiData = intelligence.xai || null;
        impactData = intelligence.impactAssessment || null;
      }
    } catch (err) {
      console.warn("[ConversationService] Intelligence retrieval warning:", err.message);
    }
  }

  // 4. Retrieve RAG Evidence Pack for Guidance, Emergency, or Disaster Inquiries
  let evidencePack = null;
  const needsKnowledgeRetrieval =
    intent === "DISASTER_GUIDANCE" ||
    intent === "EMERGENCY" ||
    intent === "IMPACT_QUERY" ||
    Boolean(hazard);

  if (needsKnowledgeRetrieval) {
    try {
      const retrievalService = getRagRetrievalService();
      const retrievalResult = await retrievalService.retrieve(cleanMessage, {
        region: locName,
        hazardType: hazard,
        topK: 3,
      });

      evidencePack = buildEvidencePack(retrievalResult, {
        location: locName,
        region: locName,
        hazardType: hazard,
        currentRiskLevel: riskData?.riskLevel,
      });

      const abstentionEval = evaluateAbstention(evidencePack);
      if (abstentionEval && abstentionEval.abstained) {
        evidencePack.abstentionTriggered = true;
        evidencePack.abstentionReason = abstentionEval.message;
        evidencePack.abstentionDetail = abstentionEval.detail;
      }
    } catch (err) {
      console.warn("[ConversationService] RAG retrieval exception:", err.message);
    }
  }

  // 5. Server-Side Grounded Synthesis
  const llmService = getLlmService(options.llmOptions);
  const synthesis = await llmService.generateConversationalAnswer({
    userMessage: cleanMessage,
    history: conversationHistory,
    weatherData,
    forecastData,
    riskData,
    xaiData,
    impactData,
    evidencePack,
    intent,
    locationName: locName,
  });

  // 6. Assemble Canonical Phase 9 Response Contract
  const followUps = generateFollowUps(intent, riskData?.riskLevel, hazard);

  return {
    success: true,
    answer: synthesis.answer,
    intent,
    hazard,
    timeTarget,
    isFollowUp,
    location: {
      name: locName,
      latitude: hasCoordinates ? lat : null,
      longitude: hasCoordinates ? lon : null,
      available: hasCoordinates,
    },
    weatherContext: weatherData,
    riskContext: riskData ? {
      riskLevel: riskData.riskLevel,
      riskScore: riskData.riskScore,
      confidence: riskData.confidence,
      isFallback: riskData.isFallback,
    } : null,
    xaiContext: xaiData ? {
      whyThisRisk: xaiData.whyThisRisk,
      featureContributions: xaiData.featureContributions,
      riskFactors: xaiData.riskFactors,
    } : null,
    impactContext: impactData ? {
      hazard: impactData.hazard,
      severity: impactData.severity?.label || impactData.severity,
      impactCategory: impactData.hazard || (impactData.impacts?.[0]?.category) || "General",
      potentialConsequences: Array.isArray(impactData.impacts) && impactData.impacts.length > 0
        ? impactData.impacts.map((imp) => imp.description || imp.category)
        : (impactData.potentialConsequences || []),
      recommendedActions: impactData.recommendedActions || [],
    } : null,
    evidence: evidencePack ? evidencePack.groundedChunks : [],
    citations: synthesis.citations || [],
    abstention: evidencePack ? Boolean(evidencePack.abstentionTriggered) : false,
    suggestedFollowUps: followUps,
    metadata: {
      grounded: synthesis.grounded,
      provider: synthesis.provider,
      model: synthesis.model,
      timestamp: new Date().toISOString(),
    },
  };
}

module.exports = {
  processConversationalMessage,
  generateFollowUps,
};
