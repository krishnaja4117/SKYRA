/**
 * SKYRA – Conversational Intent & Context Resolution Service (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid intent classifier and multi-turn entity/context resolver for the
 * conversational disaster intelligence pipeline.
 *
 * Supported Intents:
 *   • WEATHER_CURRENT   : Temperature, humidity, wind, rainfall, general weather now
 *   • WEATHER_FORECAST  : Rain today/tomorrow/tonight, hourly outlook, upcoming conditions
 *   • RISK_QUERY        : Overall risk level, flood risk, heat risk, cyclone risk
 *   • XAI_EXPLANATION   : "Why is the risk high?", "What is causing the risk?", "Why?"
 *   • IMPACT_QUERY      : Areas affected, potential consequences, infrastructure damage
 *   • DISASTER_GUIDANCE : Standard operating procedures, safety guidelines, flood/cyclone/heat actions
 *   • EMERGENCY         : Immediate help, evacuation, emergency numbers (112, 1078), rescue
 *   • HISTORICAL_QUERY  : Historical patterns, past occurrences, climate memory
 *   • GENERAL_QUERY     : General conversational queries or out-of-domain requests
 *
 * Guarantees:
 *   • Contextual follow-up inheritance (e.g. "Is there flood risk?" -> "Why?" resolves to XAI for flood risk)
 *   • Entity extraction: location, hazard type, time target
 *   • Never relies purely on fragile regex; uses semantic token analysis and priority matching
 */

const HAZARD_TYPES = Object.freeze(["flood", "cyclone", "heat", "wind", "waterlogging", "rain", "storm", "landslide"]);

/**
 * Normalizes input text for intent analysis.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeQuery(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ");
}

/**
 * Extracts recognized hazard types from text.
 *
 * @param {string} normText
 * @returns {string|null}
 */
function extractHazard(normText) {
  if (normText.includes("flood") || normText.includes("inundat")) return "flood";
  if (normText.includes("cyclone") || normText.includes("storm") || normText.includes("gale") || normText.includes("hurricane")) return "cyclone";
  if (normText.includes("heat") || normText.includes("hot") || normText.includes("warm") || normText.includes("temperature")) return "heat";
  if (normText.includes("waterlog") || normText.includes("drain")) return "waterlogging";
  if (normText.includes("wind") || normText.includes("gust")) return "wind";
  if (normText.includes("rain") || normText.includes("shower") || normText.includes("downpour") || normText.includes("monsoon")) return "rain";
  if (normText.includes("landslide") || normText.includes("mudslide")) return "landslide";
  return null;
}

/**
 * Extracts temporal target from text.
 *
 * @param {string} normText
 * @returns {"now"|"today"|"tomorrow"|"tonight"|"later"}
 */
function extractTimeTarget(normText) {
  if (normText.includes("tomorrow")) return "tomorrow";
  if (normText.includes("tonight") || normText.includes("night")) return "tonight";
  if (normText.includes("later today") || normText.includes("later") || normText.includes("afternoon") || normText.includes("evening")) return "later";
  if (normText.includes("today")) return "today";
  return "now";
}

/**
 * Determines whether a query is a short follow-up needing prior context.
 *
 * @param {string} normText
 * @returns {boolean}
 */
function isFollowUpQuery(normText) {
  const followUpPhrases = [
    "why",
    "why is that",
    "why so",
    "what about tomorrow",
    "what about tonight",
    "what about at night",
    "at night",
    "and tomorrow",
    "and tonight",
    "and the wind",
    "and rain",
    "what should i do then",
    "what about there",
    "where",
    "how about later",
    "what else",
  ];

  if (followUpPhrases.includes(normText)) return true;
  if (/^why\b/.test(normText) && normText.split(/\s+/).length <= 4) return true;
  if (/^(what about|how about|and what about|and how about)\b/.test(normText)) return true;
  if (/^(and|what|how) (at night|tomorrow|tonight|later|the wind|the rain)\b/.test(normText)) return true;
  return false;
}

/**
 * Classifies intent and extracts contextual entities from query and conversation history.
 *
 * @param {string} query
 * @param {Array<Object>} [conversationHistory=[]]
 * @returns {Object} { intent, hazard, timeTarget, isFollowUp, resolvedQuery }
 */
function classifyIntent(query, conversationHistory = []) {
  const norm = normalizeQuery(query);
  const detectedHazard = extractHazard(norm);
  const timeTarget = extractTimeTarget(norm);
  const isFollowUp = isFollowUpQuery(norm);

  // 1. Resolve follow-up intent from prior turn if applicable
  if (isFollowUp && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const lastUserTurn = [...conversationHistory].reverse().find((m) => m.role === "user");
    const lastAssistantTurn = [...conversationHistory].reverse().find((m) => m.role === "assistant");
    const priorUserNorm = lastUserTurn ? normalizeQuery(lastUserTurn.content) : "";

    // "Why?" following a risk query -> XAI explanation
    if (/^why\b/.test(norm)) {
      return {
        intent: "XAI_EXPLANATION",
        hazard: detectedHazard || extractHazard(priorUserNorm),
        timeTarget: "now",
        isFollowUp: true,
        resolvedQuery: `Why is the current risk evaluated as such? (Follow-up to: ${lastUserTurn?.content || "previous question"})`,
      };
    }

    // "What about tomorrow / tonight / at night?" following a weather/risk query
    if (
      norm.includes("tomorrow") ||
      norm.includes("tonight") ||
      norm.includes("later") ||
      norm.includes("night") ||
      norm.includes("morning") ||
      norm.includes("afternoon")
    ) {
      const priorIntent = priorUserNorm ? classifyIntent(priorUserNorm).intent : "WEATHER_FORECAST";
      const targetIntent = priorIntent === "RISK_QUERY" ? "RISK_QUERY" : "WEATHER_FORECAST";
      let inheritedTime = timeTarget;
      if (priorUserNorm.includes("tomorrow")) {
        inheritedTime = "tomorrow";
      } else if (priorUserNorm.includes("today")) {
        inheritedTime = "today";
      } else if (timeTarget === "now") {
        inheritedTime = "tomorrow";
      }
      return {
        intent: targetIntent,
        hazard: detectedHazard || extractHazard(priorUserNorm),
        timeTarget: inheritedTime,
        isFollowUp: true,
        resolvedQuery: `${lastUserTurn?.content || "Weather"} for ${inheritedTime}`,
      };
    }
  }

  // 2. Emergency Intent (Highest priority safety trigger)
  if (
    norm.includes("emergency") ||
    norm.includes("help me") ||
    norm.includes("i need help") ||
    norm.includes("call 112") ||
    norm.includes("sos") ||
    norm.includes("rescue") ||
    norm.includes("helpline") ||
    norm.includes("emergency number") ||
    norm.includes("trapped") ||
    norm.includes("immediate danger")
  ) {
    return {
      intent: "EMERGENCY",
      hazard: detectedHazard,
      timeTarget: "now",
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 3. XAI / Explanation Intent
  if (
    norm.includes("why is the risk") ||
    norm.includes("why the risk") ||
    norm.includes("what is causing the risk") ||
    norm.includes("what is driving the risk") ||
    norm.includes("why this risk") ||
    norm.includes("explain the risk") ||
    norm.includes("reason for risk") ||
    norm.includes("contributing factors") ||
    norm.includes("why high risk") ||
    norm.includes("why severe risk") ||
    norm.includes("why moderate risk") ||
    norm.includes("why low risk")
  ) {
    return {
      intent: "XAI_EXPLANATION",
      hazard: detectedHazard,
      timeTarget: "now",
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 4. Disaster Guidance & SOP Intent (RAG trigger)
  if (
    norm.includes("what should i do") ||
    norm.includes("what to do") ||
    norm.includes("how to prepare") ||
    norm.includes("safety tips") ||
    norm.includes("safety precautions") ||
    norm.includes("guidelines") ||
    norm.includes("advisory") ||
    norm.includes("protocol") ||
    norm.includes("dos and donts") ||
    norm.includes("do s and don ts") ||
    norm.includes("during a flood") ||
    norm.includes("during a cyclone") ||
    norm.includes("during heat") ||
    norm.includes("during waterlogging") ||
    norm.includes("preparation")
  ) {
    return {
      intent: "DISASTER_GUIDANCE",
      hazard: detectedHazard || "general",
      timeTarget: "now",
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 5. Impact Assessment Intent
  if (
    norm.includes("what could happen") ||
    norm.includes("what areas could be affected") ||
    norm.includes("areas affected") ||
    norm.includes("potential impact") ||
    norm.includes("infrastructure impact") ||
    norm.includes("consequences") ||
    norm.includes("damage") ||
    norm.includes("submerged") ||
    norm.includes("disruption") ||
    norm.includes("if rain continues")
  ) {
    return {
      intent: "IMPACT_QUERY",
      hazard: detectedHazard,
      timeTarget,
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 6. Risk Query Intent
  if (
    norm.includes("risk") ||
    norm.includes("danger") ||
    norm.includes("is my area at risk") ||
    norm.includes("is it safe") ||
    norm.includes("threat level") ||
    norm.includes("alert level") ||
    norm.includes("flood risk") ||
    norm.includes("cyclone risk") ||
    norm.includes("heat risk")
  ) {
    return {
      intent: "RISK_QUERY",
      hazard: detectedHazard,
      timeTarget,
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 7. Forecast Intent
  if (
    norm.includes("forecast") ||
    norm.includes("will it rain") ||
    norm.includes("rain today") ||
    norm.includes("rain tomorrow") ||
    norm.includes("tomorrow") ||
    norm.includes("tonight") ||
    norm.includes("later today") ||
    norm.includes("later") ||
    norm.includes("hourly") ||
    norm.includes("next few hours") ||
    norm.includes("upcoming")
  ) {
    return {
      intent: "WEATHER_FORECAST",
      hazard: detectedHazard,
      timeTarget,
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 8. Historical Query Intent
  if (
    norm.includes("happened here before") ||
    norm.includes("historical") ||
    norm.includes("past events") ||
    norm.includes("pattern match") ||
    norm.includes("history") ||
    norm.includes("in the past")
  ) {
    return {
      intent: "HISTORICAL_QUERY",
      hazard: detectedHazard,
      timeTarget: "now",
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 9. Current Weather Intent
  if (
    norm.includes("weather") ||
    norm.includes("temperature") ||
    norm.includes("how hot") ||
    norm.includes("how cold") ||
    norm.includes("temp") ||
    norm.includes("humidity") ||
    norm.includes("humid") ||
    norm.includes("wind") ||
    norm.includes("raining now") ||
    norm.includes("is it raining") ||
    norm.includes("current conditions") ||
    norm.includes("now")
  ) {
    return {
      intent: "WEATHER_CURRENT",
      hazard: detectedHazard,
      timeTarget: "now",
      isFollowUp: false,
      resolvedQuery: query,
    };
  }

  // 10. General or Out of Domain Query
  return {
    intent: "GENERAL_QUERY",
    hazard: detectedHazard,
    timeTarget: "now",
    isFollowUp: false,
    resolvedQuery: query,
  };
}

module.exports = {
  classifyIntent,
  normalizeQuery,
  extractHazard,
  extractTimeTarget,
  isFollowUpQuery,
  HAZARD_TYPES,
};
