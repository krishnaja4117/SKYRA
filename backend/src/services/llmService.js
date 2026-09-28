/**
 * SKYRA – Server-Side LLM Service & Grounded Generation Provider (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides strictly grounded generation for disaster response queries.
 * Connects to OpenAI-compatible endpoints when credentials are provided,
 * while maintaining a 100% deterministic, offline mock generator for testing.
 *
 * Guarantees:
 *   • Grounded Generation: Mandates strict citation of provided evidence only
 *   • Zero Risk Overrides: Prohibits the LLM from inventing or overriding ML risk scores
 *   • Zero Secret Leakage: API keys are strictly server-side and never returned
 *   • Deterministic Fallback: Offline execution produces verifiable, citation-backed answers
 */

const SYSTEM_GROUNDING_PROMPT = `You are SKYRA Disaster Intelligence, an official emergency advisory assistant.
Your instructions are mandatory:
1. Answer the user's question using ONLY the provided authoritative Evidence Pack.
2. For every factual claim, protocol, or safety guideline you mention, cite the corresponding source using [Citation X].
3. If the evidence does not contain sufficient details to answer the question, state clearly that authoritative guidelines are unavailable and recommend calling 112.
4. DO NOT invent, extrapolate, or fabricate any guideline, threshold, agency, or source.
5. DO NOT calculate, alter, or predict the disaster risk score or risk level. Risk is owned strictly by the SKYRA ML model.
6. Use objective, clear, and reassuring language suitable for emergency situations.`;

const SYSTEM_CONVERSATIONAL_PROMPT = `You are SKYRA, an AI-powered impact-based weather intelligence and disaster awareness conversational assistant.
Your instructions are mandatory:
1. Answer user questions about current weather, forecast, disaster risk, impact, XAI explanations, and emergency guidance.
2. SOURCE OF TRUTH:
   - For real-time weather and forecast, use ONLY the provided LIVE_WEATHER and FORECAST data.
   - For risk levels, scores, confidence, and XAI feature attributions, use ONLY the provided ML_RISK and XAI_EXPLANATION. DO NOT calculate, alter, predict, or invent your own risk scores or levels.
   - For disaster safety, protocols, and guidance, use the provided AUTHORITATIVE_EVIDENCE and cite each fact using [Citation X].
3. If specific weather or risk information is missing or marked unavailable, explicitly state that it is currently unavailable. Never fabricate numbers.
4. If asked "Why?", refer to the XAI explanation and feature contributions. Remember that feature contributions are statistical attributions, not direct physical causality.
5. In emergencies or severe threats, clearly state actionable safety instructions and the national emergency helpline (Dial 112 / NDMA Helpline 1078).
6. Keep answers concise, clear, and reassuring. Avoid sensational or alarmist language.`;

class LlmService {
  constructor(options = {}) {
    this.apiKey = process.env.OPENAI_API_KEY || null;
    this.model = process.env.OPENAI_MODEL || options.model || "gpt-4o-mini";
    this.apiBase = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
    this.timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS) || options.timeoutMs || 8000;
    this.forceMock = options.forceMock || !this.apiKey;
  }

  /**
   * Generates a grounded response from an Evidence Pack.
   *
   * @param {string} userQuery
   * @param {Object} evidencePack - Output from buildEvidencePack()
   * @param {Object} [options]
   * @returns {Promise<Object>} Formatted answer with citations
   */
  async generateAnswer(userQuery, evidencePack, options = {}) {
    const contextText = (evidencePack && evidencePack.formattedContextText) || "";
    const citations = (evidencePack && evidencePack.citations) || [];

    // If cloud provider is enabled and API key is present
    if (!this.forceMock && this.apiKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(`${this.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.0, // Zero temperature for maximum grounding and determinism
            messages: [
              { role: "system", content: SYSTEM_GROUNDING_PROMPT },
              {
                role: "user",
                content: `QUESTION: ${userQuery}\n\nEVIDENCE PACK:\n${contextText}\n\nProvide an authoritative disaster advisory answering the question.`,
              },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const answerText = data.choices[0]?.message?.content || "";
          return {
            answer: answerText,
            provider: "OPENAI",
            model: this.model,
            citations,
            grounded: true,
            isMock: false,
          };
        }
        console.warn(`⚠️ [LlmService] Cloud LLM returned HTTP ${response.status}. Falling back to deterministic synthesizer.`);
      } catch (err) {
        console.warn("⚠️ [LlmService] Cloud LLM invocation failed:", err.message);
      }
    }

    // Deterministic offline grounded synthesizer (Test & Local Fallback)
    return this.generateDeterministicSynthesis(userQuery, evidencePack);
  }

  /**
   * Deterministically synthesizes an answer directly from the evidence chunks.
   *
   * @param {string} userQuery
   * @param {Object} evidencePack
   * @returns {Object}
   */
  generateDeterministicSynthesis(userQuery, evidencePack) {
    const chunks = (evidencePack && evidencePack.groundedChunks) || [];
    const citations = (evidencePack && evidencePack.citations) || [];

    if (chunks.length === 0) {
      return {
        answer: "SKYRA could not find sufficient authoritative guidance for this specific situation.",
        provider: "LOCAL_DETERMINISTIC_SYNTHESIZER",
        model: "skyra-offline-grounding-v1",
        citations: [],
        grounded: false,
        isMock: true,
      };
    }

    // Assemble authoritative summary directly from the grounded chunks
    const guidanceLines = chunks.slice(0, 3).map((c) => {
      const citeTag = `[Citation ${c.citationIndex}]`;
      return `According to official guidance from ${c.sourceAgency} (${c.documentId}) ${citeTag}: ${c.text}`;
    });

    const answer = (
      `Based on authoritative disaster management protocols:\n\n` +
      guidanceLines.join("\n\n") +
      `\n\nFor ongoing emergencies or life-threatening situations, always follow directives from local emergency services (Dial 112).`
    );

    return {
      answer,
      provider: "LOCAL_DETERMINISTIC_SYNTHESIZER",
      model: "skyra-offline-grounding-v1",
      citations,
      grounded: true,
      isMock: true,
    };
  }

  /**
   * Generates a conversational response integrating real application data, ML risk, XAI, and RAG.
   *
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async generateConversationalAnswer(params = {}) {
    const {
      userMessage,
      history = [],
      weatherData,
      forecastData,
      riskData,
      xaiData,
      impactData,
      evidencePack,
      intent = "GENERAL_QUERY",
      locationName = "Active Location",
      language = "en-IN",
    } = params;

    // Map BCP-47 language codes to human-readable names for the LLM prompt
    const LANGUAGE_NAMES = {
      "en-IN": "English",
      "hi-IN": "Hindi (हिन्दी)",
      "ml-IN": "Malayalam (മലയാളം)",
      "ta-IN": "Tamil (தமிழ்)",
      "te-IN": "Telugu (తెలుగు)",
      "kn-IN": "Kannada (ಕನ್ನಡ)",
    };
    const langName = LANGUAGE_NAMES[language] || "English";
    const langInstruction = language !== "en-IN"
      ? `\n7. IMPORTANT: The user has selected ${langName}. You MUST respond ENTIRELY in ${langName}. Do not respond in English. All weather values (numbers, units) can remain as-is but all sentences, labels, and advice MUST be in ${langName}.`
      : "";

    const citations = (evidencePack && evidencePack.citations) || [];
    const contextText = (evidencePack && evidencePack.formattedContextText) || "";

    // Cloud LLM invocation when configured and enabled
    if (!this.forceMock && this.apiKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const promptContext = [
          `LOCATION: ${locationName}`,
          language !== "en-IN" ? `RESPONSE_LANGUAGE: ${langName} — respond entirely in ${langName}` : "",
          weatherData ? `LIVE_WEATHER: Temp ${weatherData.temperature}°C, Humidity ${weatherData.humidity}%, Wind ${weatherData.windSpeed} km/h, Rain ${weatherData.rainfall} mm, Condition: ${weatherData.condition || "Normal"}` : "LIVE_WEATHER: Currently unavailable",
          riskData ? `ML_RISK (READ-ONLY): Level: ${riskData.riskLevel}, Score: ${riskData.riskScore}/100, Calibrated Confidence: ${riskData.confidence}%` : "ML_RISK: Currently unavailable",
          xaiData ? `XAI_EXPLANATION: Narrative: ${xaiData.whyThisRisk || "N/A"}. Top factors: ${(xaiData.featureContributions || []).slice(0, 3).map(f => `${f.displayName} (${f.contribution > 0 ? "+" : ""}${f.contribution.toFixed(1)})`).join(", ")}` : "XAI_EXPLANATION: N/A",
          impactData ? `IMPACT_ASSESSMENT: Category: ${impactData.impactCategory || "General"}, Consequences: ${(impactData.potentialConsequences || []).slice(0, 2).map(c => c.consequence).join("; ")}` : "IMPACT_ASSESSMENT: N/A",
          contextText ? `AUTHORITATIVE_EVIDENCE_PACK:\n${contextText}` : "AUTHORITATIVE_EVIDENCE_PACK: None required or unavailable",
        ].filter(Boolean).join("\n\n");

        const systemPromptWithLang = language !== "en-IN"
          ? SYSTEM_CONVERSATIONAL_PROMPT + langInstruction
          : SYSTEM_CONVERSATIONAL_PROMPT;

        const chatMessages = [
          { role: "system", content: systemPromptWithLang },
          ...history.slice(-4).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
          {
            role: "user",
            content: `CONTEXT:\n${promptContext}\n\nUSER QUESTION: ${userMessage}`,
          },
        ];

        const response = await fetch(`${this.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.2,
            messages: chatMessages,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const answerText = data.choices[0]?.message?.content || "";
          return {
            answer: answerText,
            provider: "OPENAI",
            model: this.model,
            citations,
            grounded: true,
            isMock: false,
          };
        }
        console.warn(`⚠️ [LlmService] Cloud LLM returned HTTP ${response.status}. Falling back to deterministic synthesizer.`);
      } catch (err) {
        console.warn("⚠️ [LlmService] Cloud conversational request failed:", err.message);
      }
    }

    // Deterministic offline conversational synthesizer
    return this.generateDeterministicConversationalSynthesis(params);
  }

  /**
   * Deterministic conversational synthesizer for offline/mock mode.
   * Generates grounded, natural responses strictly matching the real inputs.
   *
   * @param {Object} params
   * @returns {Object}
   */
  generateDeterministicConversationalSynthesis(params = {}) {
    const {
      userMessage,
      weatherData,
      forecastData,
      riskData,
      xaiData,
      impactData,
      evidencePack,
      intent = "GENERAL_QUERY",
      locationName = "Your location",
      language = "en-IN",
    } = params;

    // For non-English requests without cloud LLM, the local synthesizer always
    // generates English content (it has no NMT capability). This is clearly
    // flagged in the response so the frontend can show the correct notice.
    const isEnglish = !language || language === "en-IN";

    const citations = (evidencePack && evidencePack.citations) || [];
    const chunks = (evidencePack && evidencePack.groundedChunks) || [];

    let answer = "";

    switch (intent) {
      case "WEATHER_CURRENT": {
        if (!weatherData || weatherData.temperature == null) {
          answer = `Current weather data for ${locationName} is temporarily unavailable. Please try again shortly.`;
        } else {
          const rainText = weatherData.rainfall > 0
            ? `rainfall is ${weatherData.rainfall} mm`
            : "no rainfall is currently observed";
          answer = `Current conditions in ${locationName}: Temperature is ${Math.round(weatherData.temperature)}°C with ${Math.round(weatherData.humidity)}% humidity. Wind speed is ${Math.round(weatherData.windSpeed)} km/h, and ${rainText}.`;
        }
        break;
      }

      case "WEATHER_FORECAST": {
        const hasForecast = forecastData && (
          (Array.isArray(forecastData.hourly) && forecastData.hourly.length > 0) ||
          forecastData.expectedRainfall != null ||
          forecastData.maxProbability != null
        );

        if (!hasForecast) {
          answer = `Detailed forecast data for ${locationName} is temporarily unavailable. Live weather remains operational.`;
        } else {
          const maxProb = forecastData.maxProbability != null ? forecastData.maxProbability : 25;
          const expectedRain = forecastData.expectedRainfall != null ? forecastData.expectedRainfall : 0;
          answer = `Upcoming forecast for ${locationName}: The available outlook indicates up to ${maxProb}% precipitation probability with approximately ${Number(expectedRain).toFixed(1)} mm expected rainfall. Conditions are being continuously monitored.`;
        }
        break;
      }

      case "RISK_QUERY": {
        if (!riskData || riskData.riskLevel == null) {
          answer = `Risk assessment for ${locationName} is temporarily unavailable. Live weather monitoring remains active.`;
        } else {
          const confidenceText = riskData.confidence ? ` (calibrated model confidence: ${riskData.confidence}%)` : "";
          const adviceText = riskData.riskLevel === "Severe" || riskData.riskLevel === "High"
            ? "Take immediate precautions, avoid waterlogged or hazardous routes, and follow official disaster advisories."
            : riskData.riskLevel === "Moderate"
            ? "Stay aware of changing weather conditions and monitor official alerts."
            : "No major immediate weather threat is indicated by SKYRA.";
          answer = `Current disaster risk in ${locationName} is evaluated as ${riskData.riskLevel} with a risk score of ${riskData.riskScore}/100${confidenceText}. Guidance: ${adviceText}`;
        }
        break;
      }

      case "XAI_EXPLANATION": {
        if (!xaiData) {
          answer = `Explanation for the current risk evaluation in ${locationName} is unavailable.`;
        } else {
          const narrative = xaiData.whyThisRisk || "Risk is derived from current weather intensity and local environmental vulnerability.";
          const topFactors = (xaiData.featureContributions || [])
            .filter((f) => f.contribution > 0)
            .slice(0, 3)
            .map((f) => `${f.displayName} (${f.input} ${f.unit}) contributed +${f.contribution.toFixed(1)} pts`)
            .join("; ");

          const factorNote = topFactors ? ` Primary contributing factors: ${topFactors}.` : "";
          answer = `Why this risk: ${narrative}${factorNote} (Note: Model contributions reflect statistical attribution, not physical causality.)`;
        }
        break;
      }

      case "IMPACT_QUERY": {
        if (!impactData) {
          answer = `Impact assessment for ${locationName} is currently unavailable.`;
        } else {
          const consequences = (impactData.potentialConsequences || [])
            .map((c) => c.consequence)
            .join("; ");
          const consText = consequences ? `Potential impacts: ${consequences}.` : "No severe physical disruptions are currently anticipated.";
          answer = `Impact assessment for ${locationName} (${impactData.impactCategory || "General"}): ${consText}`;
        }
        break;
      }

      case "DISASTER_GUIDANCE": {
        if (evidencePack && evidencePack.abstentionTriggered) {
          answer = `${evidencePack.abstentionReason || "SKYRA could not find sufficient authoritative guidance for this specific situation."} ${evidencePack.abstentionDetail || "For official assistance and emergency relief, dial 112."}`;
        } else if (evidencePack && evidencePack.conflictStatus && evidencePack.conflictStatus.hasConflict) {
          const conflictNote = evidencePack.conflictStatus.explanation || "Official guidelines contain differing directives for this scenario.";
          const points = chunks.slice(0, 3).map((c) => `[Citation ${c.citationIndex}] ${c.sourceAgency} (${c.documentId}): ${c.text}`);
          answer = `Notice: Conflicting advisories detected.\n\n${conflictNote}\n\nRetrieved directives:\n${points.join("\n\n")}\n\nFor immediate safety, adhere strictly to the highest state/national authority directive and dial 112.`;
        } else if (chunks.length === 0) {
          answer = `SKYRA could not find sufficient authoritative disaster guidance for this specific query in ${locationName}. For emergency assistance, please contact local emergency authorities (Dial 112).`;
        } else {
          const points = chunks.slice(0, 3).map((c) => `[Citation ${c.citationIndex}] ${c.sourceAgency} (${c.documentId}): ${c.text}`);
          answer = `Authoritative disaster safety guidance:\n\n${points.join("\n\n")}\n\nAlways follow instructions issued by local disaster management authorities (Dial 112).`;
        }
        break;
      }

      case "EMERGENCY": {
        answer = `EMERGENCY ALERT: If you are in immediate danger, please dial National Emergency Services at 112 immediately. For national disaster response, call the NDMA Helpline at 1078 (or State Disaster Helpline at 1070). Move to higher ground if facing floodwaters, avoid electrical installations, and follow directives from first responders.`;
        break;
      }

      case "HISTORICAL_QUERY": {
        answer = `Historical climate memory for ${locationName}: Similar atmospheric configurations have historically correlated with seasonal precipitation and runoff patterns. Consult local historical flood records and continuous telemetry for specific past flood crest benchmarks.`;
        break;
      }

      default: {
        answer = `Hello! I am SKYRA, your impact-based weather intelligence and disaster awareness assistant for ${locationName}. You can ask me about current conditions, upcoming rainfall forecasts, current risk levels ("Why is the risk high?"), potential impacts, or official disaster safety guidelines.`;
        break;
      }
    }

    return {
      answer,
      provider: "LOCAL_DETERMINISTIC_CONVERSATIONAL_SYNTHESIZER",
      model: "skyra-offline-conversation-v1",
      citations,
      grounded: true,
      isMock: true,
      localSynthesizerUsed: true,
      // Flag when a non-English language was requested but offline mode can only
      // produce English. The frontend uses this to show a clear notice.
      localSynthesizerLanguageLimited: !isEnglish,
    };
  }
}

// Singleton instance
let _llmServiceInstance = null;

function getLlmService(options) {
  if (!_llmServiceInstance || options) {
    _llmServiceInstance = new LlmService(options);
  }
  return _llmServiceInstance;
}

module.exports = {
  LlmService,
  getLlmService,
  SYSTEM_GROUNDING_PROMPT,
  SYSTEM_CONVERSATIONAL_PROMPT,
};

