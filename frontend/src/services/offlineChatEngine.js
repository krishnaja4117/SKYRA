/**
 * SKYRA – Offline Conversational Chat Engine (Phase 5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous offline query interpreter & safety knowledge base retriever.
 * Runs completely in-browser without network access.
 *
 * Guarantees:
 *   • Never leaves responses hanging or stuck on "Thinking...".
 *   • Strictly truthful: Never hallucinates live radar observations or synthetic evacuation orders.
 *   • Multi-hazard verified SOP coverage: Floods, Landslides, Cyclones, Heatwaves, Kits, Helplines.
 *   • Official traceable citations (NDMA / IMD / GSI).
 *   • Context-aware follow-up suggestion chips.
 */

import { SAFETY_TOPICS, VERIFIED_HELPLINES, SAFETY_CORPUS_VERSION } from "../data/safetyKnowledgeBase";
import { getCachedWeather, getCachedRisk } from "./idbStorage";
import { predictOfflineRisk } from "./offlineRiskEngine";

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Evaluates an incoming user question against the offline knowledge base & cached telemetry.
 *
 * @param {Object} params
 * @param {string} params.message - User prompt
 * @param {string} [params.language="en-IN"] - Selected language
 * @param {Object} [params.locationContext] - Location name and coordinates
 * @returns {Promise<Object>} Structured conversational response
 */
export async function queryOfflineChat({
  message,
  language = "en-IN",
  locationContext = {},
} = {}) {
  const clean = String(message || "").trim();
  const tokens = tokenize(clean);
  const locationName = locationContext?.locationName || "your area";

  // 1. Helpline & Emergency Contact Query
  const isHelplineQuery = tokens.some((t) =>
    ["helpline", "emergency", "call", "police", "ambulance", "fire", "number", "contact", "phone", "sos"].includes(t)
  );

  if (isHelplineQuery && tokens.some((t) => ["number", "call", "helpline", "contact", "phone"].includes(t))) {
    const list = VERIFIED_HELPLINES.map((h) => `• ${h.service}: ${h.number} (${h.description})`).join("\n");
    return {
      answer: `Here are the verified official emergency helplines for ${locationName}:\n\n${list}\n\n⚠️ Note: These are official emergency toll-free numbers accessible across India even without mobile data or internet.`,
      intent: "emergency_guidance",
      citations: [
        { source: "National Disaster Management Authority (NDMA)", title: "National Emergency Control Directory" },
      ],
      suggestedFollowUps: [
        "What should I do during a flood?",
        "What are landslide warning signs?",
        "What goes in an emergency survival kit?",
      ],
      isOfflineKnowledge: true,
      corpusVersion: SAFETY_CORPUS_VERSION,
    };
  }

  // 2. Disaster SOP Keyword Match (Flood, Landslide, Cyclone, Kit, Heatwave)
  let bestTopic = null;
  let highestScore = 0;

  for (const [key, topic] of Object.entries(SAFETY_TOPICS)) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (clean.toLowerCase().includes(kw)) {
        score += 3;
      }
      if (tokens.includes(kw)) {
        score += 2;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestTopic = topic;
    }
  }

  if (bestTopic && highestScore >= 2) {
    const guidelinesText = bestTopic.guidelines.map((g, i) => `${i + 1}. ${g}`).join("\n");
    return {
      answer: `📋 ${bestTopic.title} (Official Guidance):\n\n${guidelinesText}\n\n(Source: ${bestTopic.source})`,
      intent: "safety_guidance",
      citations: [
        { source: bestTopic.source, title: bestTopic.title },
      ],
      suggestedFollowUps: [
        "What emergency numbers should I call?",
        "What should I put in an emergency kit?",
        "What is the current weather risk?",
      ],
      isOfflineKnowledge: true,
      corpusVersion: SAFETY_CORPUS_VERSION,
    };
  }

  // 3. Current Weather Inquiry via Offline Cache
  const isWeatherQuery = tokens.some((t) =>
    ["weather", "rain", "temperature", "temp", "wind", "humidity", "hot", "cold"].includes(t)
  );

  if (isWeatherQuery) {
    const cached = await getCachedWeather("current_location").catch(() => null);
    if (cached && cached.data?.current) {
      const cur = cached.data.current;
      const t = Math.round(cur.temperature_2m ?? 0);
      const h = Math.round(cur.relative_humidity_2m ?? 0);
      const w = Math.round(cur.wind_speed_10m ?? 0);
      const r = cur.precipitation ?? cur.rain ?? 0;
      return {
        answer: `Offline Weather Snapshot for ${cached.locationName || locationName} (recorded ${cached.ageMinutes}m ago):\n• Temperature: ${t}°C\n• Humidity: ${h}%\n• Wind Speed: ${w} km/h\n• Rainfall: ${r} mm\n\n⚠️ Note: This is cached offline telemetry from your last active connection. Real-time updates resume automatically when connection returns.`,
        intent: "weather",
        citations: [
          { source: "Local Offline Storage", title: `Cached at ${cached.timestamp}` },
        ],
        suggestedFollowUps: [
          "What is the current weather risk?",
          "What should I do during a flood?",
          "What emergency numbers are available?",
        ],
        isOfflineKnowledge: true,
      };
    }
  }

  // 4. Current Risk Inquiry via Offline ML Engine
  const isRiskQuery = tokens.some((t) =>
    ["risk", "danger", "safe", "threat", "hazard", "score"].includes(t)
  );

  if (isRiskQuery) {
    const cachedWeather = await getCachedWeather("current_location").catch(() => null);
    if (cachedWeather?.data?.current) {
      const cur = cachedWeather.data.current;
      const hourly = cachedWeather.data.hourly || {};
      const rainfall = Number(cur.precipitation ?? cur.rain ?? 0);
      const forecastRainfall = Array.isArray(hourly.precipitation)
        ? hourly.precipitation.slice(0, 24).reduce((a, b) => a + (Number(b) || 0), 0)
        : 0;
      const humidity = Number(cur.relative_humidity_2m ?? 50);
      const windSpeed = Number(cur.wind_speed_10m ?? 10);
      const temperature = Number(cur.temperature_2m ?? 25);
      const pressure = Number(cur.surface_pressure ?? 1012);

      const prediction = await predictOfflineRisk({
        rainfall,
        forecastRainfall,
        humidity,
        windSpeed,
        historicalRisk: 25,
        terrainSlope: 5,
        temperature,
        pressure,
      }).catch(() => null);

      if (prediction) {
        return {
          answer: `Offline ML Risk Estimate for ${locationName}:\n• Evaluated Risk Level: ${prediction.riskLevel.toUpperCase()}\n• Risk Score: ${prediction.riskScore}/100\n• Model Confidence: ${prediction.confidence}%\n\n${prediction.xai.explanation}\n\n⚠️ Evaluated locally on-device using SKYRA's validated XGBoost model against latest cached observations.`,
          intent: "risk",
          riskContext: {
            riskLevel: prediction.riskLevel,
            riskScore: prediction.riskScore,
          },
          citations: [
            { source: "SKYRA On-Device XGBoost Engine", title: "Model v2.0.0 (ERA5 Reanalysis)" },
          ],
          suggestedFollowUps: [
            "Why is the risk evaluated this way?",
            "What should I do during a flood?",
            "What emergency numbers should I call?",
          ],
          isOfflineKnowledge: true,
        };
      }
    }
  }

  // 5. Honest Transparent Fallback for Out-of-Scope or Live-Dependent Queries
  return {
    answer: `📡 Offline Mode Active:\n\nI am currently operating disconnected from SKYRA's central conversational cloud. I can assist you with:\n• Verified disaster safety protocols (floods, landslides, cyclones, heatwaves)\n• Official emergency helpline numbers (112, 1078, 1070)\n• 72-hour emergency survival bag checklist\n• Cached weather & offline ML risk estimations\n\nQuestions about real-time road closures, dynamic Doppler radar, or general non-disaster topics require an internet connection.`,
    intent: "unsupported_offline",
    citations: [
      { source: "SKYRA Offline Resilience Architecture", title: `Safety Knowledge Base v${SAFETY_CORPUS_VERSION}` },
    ],
    suggestedFollowUps: [
      "What emergency numbers should I call?",
      "What should I do during a flood?",
      "What are landslide warning signs?",
      "What should I put in an emergency kit?",
    ],
    isOfflineKnowledge: true,
  };
}
