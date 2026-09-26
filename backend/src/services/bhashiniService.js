/**
 * SKYRA – Bhashini (MeitY) Multilingual Voice Integration Service (Phase 10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side interface to Government of India / MeitY Bhashini AI platform
 * providing Automatic Speech Recognition (ASR), Neural Machine Translation (NMT),
 * and Text-to-Speech (TTS) for Indian languages.
 *
 * Guarantees:
 *   • Official API Compliance: Strictly follows ULCA / Dhruva pipeline specifications
 *   • Server-Side Credentials: User IDs and API keys NEVER leak to the client
 *   • Zero Fabricated Claims: Explicitly indicates when cloud Bhashini is unconfigured
 *   • Resilient Fallback: Gracefully degrades to browser Web Speech API & local synthesis
 *   • Non-Destructive: Never modifies ML risk engine, XAI, impact, or RAG results
 *   • In-Memory Processing: Audio payloads are processed in RAM; zero audio disk persistence
 */

const env = require("../config/env");
const { resolveLanguage, isLanguageSupported } = require("./languageConfig");

const BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
const BHASHINI_INFERENCE_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";
const DEFAULT_TIMEOUT_MS = 8000;

class BhashiniService {
  /**
   * @param {Object} [options]
   * @param {string} [options.userId]
   * @param {string} [options.apiKey]
   * @param {string} [options.inferenceKey]
   * @param {string} [options.pipelineId]
   * @param {Function} [options.fetcher] - Custom fetch for testing/mocking
   */
  constructor(options = {}) {
    this.userId = options.userId !== undefined ? options.userId : env.bhashiniUserId;
    this.apiKey = options.apiKey !== undefined ? options.apiKey : env.bhashiniApiKey;
    this.inferenceKey = options.inferenceKey !== undefined ? options.inferenceKey : env.bhashiniInferenceApiKey;
    this.pipelineId = options.pipelineId !== undefined ? options.pipelineId : env.bhashiniPipelineId;
    this.fetcher = options.fetcher || globalThis.fetch;
  }

  /**
   * Checks whether live Bhashini credentials are fully configured.
   *
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.userId && this.apiKey && this.inferenceKey);
  }

  /**
   * Transcribes base64-encoded audio using Bhashini ASR.
   *
   * @param {Object} params
   * @param {string} params.audioContent - Base64 encoded audio string
   * @param {string} [params.audioFormat="wav"]
   * @param {string} [params.language="hi"]
   * @returns {Promise<Object>}
   */
  async transcribeAudio({ audioContent, audioFormat = "wav", language = "hi" }) {
    if (!audioContent || typeof audioContent !== "string" || !audioContent.trim()) {
      const err = new Error("Audio content is required for speech recognition.");
      err.statusCode = 400;
      err.code = "ERR_EMPTY_AUDIO";
      throw err;
    }

    const langObj = resolveLanguage(language);
    const bhashiniLang = langObj.bhashiniCode;

    // Graceful offline fallback if credentials are not configured in environment
    if (!this.isConfigured()) {
      return {
        success: true,
        text: `[Recognized speech in ${langObj.name}]`,
        language: langObj.code,
        languageName: langObj.name,
        provider: "OFFLINE_FALLBACK",
        isMock: true,
        message: "Bhashini credentials unconfigured; falling back to offline speech handler.",
      };
    }

    const payload = {
      pipelineTasks: [
        {
          taskType: "asr",
          config: {
            language: { sourceLanguage: bhashiniLang },
            audioFormat: audioFormat.toLowerCase(),
          },
        },
      ],
      inputData: {
        audio: [{ audioContent: audioContent.trim() }],
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await this.fetcher(BHASHINI_INFERENCE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.inferenceKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Bhashini ASR HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }

      const json = await response.json();
      const asrTask = (json.pipelineResponse || []).find((t) => t.taskType === "asr");
      const transcript = asrTask?.output?.[0]?.source || "";

      return {
        success: true,
        text: transcript,
        language: langObj.code,
        languageName: langObj.name,
        provider: "Bhashini (MeitY)",
        isMock: false,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[BhashiniService] ASR exception: ${err.message}`);
      return {
        success: false,
        text: "",
        language: langObj.code,
        error: "BHASHINI_ASR_FAILED",
        diagnostic: err.name === "AbortError" ? "Bhashini request timed out" : err.message,
        provider: "Bhashini (MeitY)",
      };
    }
  }

  /**
   * Translates text from source language to target language.
   *
   * @param {Object} params
   * @param {string} params.text
   * @param {string} params.sourceLanguage
   * @param {string} params.targetLanguage
   * @returns {Promise<Object>}
   */
  async translateText({ text, sourceLanguage = "en", targetLanguage = "hi" }) {
    if (!text || typeof text !== "string" || !text.trim()) {
      return {
        success: true,
        text: "",
        sourceLanguage,
        targetLanguage,
        provider: "PASSTHROUGH",
      };
    }

    const src = resolveLanguage(sourceLanguage).bhashiniCode;
    const tgt = resolveLanguage(targetLanguage).bhashiniCode;

    if (src === tgt) {
      return {
        success: true,
        text,
        sourceLanguage: src,
        targetLanguage: tgt,
        provider: "PASSTHROUGH",
      };
    }

    if (!this.isConfigured()) {
      return {
        success: true,
        text,
        sourceLanguage: src,
        targetLanguage: tgt,
        provider: "OFFLINE_FALLBACK",
        isMock: true,
        message: "Bhashini translation unconfigured; returning source text.",
      };
    }

    const payload = {
      pipelineTasks: [
        {
          taskType: "translation",
          config: {
            language: {
              sourceLanguage: src,
              targetLanguage: tgt,
            },
          },
        },
      ],
      inputData: {
        input: [{ source: text.trim() }],
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await this.fetcher(BHASHINI_INFERENCE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.inferenceKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Bhashini Translation HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }

      const json = await response.json();
      const nmtTask = (json.pipelineResponse || []).find((t) => t.taskType === "translation");
      const translated = nmtTask?.output?.[0]?.target || text;

      return {
        success: true,
        text: translated,
        sourceLanguage: src,
        targetLanguage: tgt,
        provider: "Bhashini (MeitY)",
        isMock: false,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[BhashiniService] Translation exception: ${err.message}`);
      return {
        success: false,
        text, // Fallback to original text on translation failure
        sourceLanguage: src,
        targetLanguage: tgt,
        error: "BHASHINI_TRANSLATION_FAILED",
        diagnostic: err.name === "AbortError" ? "Translation request timed out" : err.message,
        provider: "Bhashini (MeitY)",
      };
    }
  }

  /**
   * Synthesizes text into audio using Bhashini TTS.
   *
   * @param {Object} params
   * @param {string} params.text
   * @param {string} [params.language="hi"]
   * @param {"female"|"male"} [params.gender="female"]
   * @returns {Promise<Object>}
   */
  async synthesizeSpeech({ text, language = "hi", gender = "female" }) {
    if (!text || typeof text !== "string" || !text.trim()) {
      const err = new Error("Text is required for speech synthesis.");
      err.statusCode = 400;
      err.code = "ERR_EMPTY_TEXT";
      throw err;
    }

    const langObj = resolveLanguage(language);
    const bhashiniLang = langObj.bhashiniCode;

    // Graceful offline fallback: signals frontend to use native SpeechSynthesis
    if (!this.isConfigured()) {
      return {
        success: true,
        audioContent: null,
        audioFormat: "wav",
        language: langObj.code,
        provider: "BROWSER_SYNTHESIS_FALLBACK",
        isFallback: true,
        message: "Bhashini credentials unconfigured; client browser speech synthesis will be used.",
      };
    }

    const payload = {
      pipelineTasks: [
        {
          taskType: "tts",
          config: {
            language: { sourceLanguage: bhashiniLang },
            gender: gender.toLowerCase(),
          },
        },
      ],
      inputData: {
        input: [{ source: text.trim() }],
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await this.fetcher(BHASHINI_INFERENCE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.inferenceKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Bhashini TTS HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }

      const json = await response.json();
      const ttsTask = (json.pipelineResponse || []).find((t) => t.taskType === "tts");
      const audioContent = ttsTask?.audio?.[0]?.audioContent || null;

      return {
        success: true,
        audioContent,
        audioFormat: "wav",
        language: langObj.code,
        provider: "Bhashini (MeitY)",
        isFallback: false,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[BhashiniService] TTS exception: ${err.message}`);
      return {
        success: true,
        audioContent: null,
        audioFormat: "wav",
        language: langObj.code,
        provider: "BROWSER_SYNTHESIS_FALLBACK",
        isFallback: true,
        error: "BHASHINI_TTS_FAILED",
        diagnostic: err.name === "AbortError" ? "TTS request timed out" : err.message,
      };
    }
  }

  /**
   * Returns non-sensitive status metadata.
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      provider: "Bhashini (MeitY, Government of India)",
      inferenceUrl: BHASHINI_INFERENCE_URL,
      configUrl: BHASHINI_CONFIG_URL,
      pipelineIdConfigured: Boolean(this.pipelineId),
      supportedTasks: ["asr", "translation", "tts"],
    };
  }
}

// Singleton instance
let _bhashiniServiceInstance = null;

function getBhashiniService(options) {
  if (!_bhashiniServiceInstance || options) {
    _bhashiniServiceInstance = new BhashiniService(options);
  }
  return _bhashiniServiceInstance;
}

module.exports = {
  BhashiniService,
  getBhashiniService,
  BHASHINI_CONFIG_URL,
  BHASHINI_INFERENCE_URL,
};
