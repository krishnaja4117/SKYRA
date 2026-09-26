/**
 * SKYRA – Multilingual Voice Controller (Phase 10)
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP endpoints for Bhashini Speech-to-Text, Translation, and Text-to-Speech.
 *
 * Endpoints:
 *   • POST /api/voice/transcribe  – Transcribes user voice audio (ASR)
 *   • POST /api/voice/translate   – Translates text between Indian languages and English (NMT)
 *   • POST /api/voice/synthesize  – Synthesizes response text into Indian language audio (TTS)
 *   • GET  /api/voice/languages   – Returns list of supported languages
 *   • GET  /api/voice/status      – Returns non-sensitive provider configuration status
 */

const { getBhashiniService } = require("../services/bhashiniService");
const { SUPPORTED_LANGUAGES, resolveLanguage } = require("../services/languageConfig");

/**
 * Handles ASR speech recognition request.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function postTranscribe(req, res) {
  try {
    const { audio, audioContent, format = "wav", language = "hi" } = req.body || {};
    const audioData = audio || audioContent;

    if (!audioData || typeof audioData !== "string" || !audioData.trim()) {
      return res.status(400).json({
        error: "Missing or invalid 'audio' base64 payload.",
        status: 400,
      });
    }

    const bhashini = getBhashiniService();
    const result = await bhashini.transcribeAudio({
      audioContent: audioData,
      audioFormat: format,
      language,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("⚠️ [VoiceController] Transcribe error:", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || "Failed to transcribe audio.",
      status,
    });
  }
}

/**
 * Handles NMT machine translation request.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function postTranslate(req, res) {
  try {
    const { text, sourceLanguage = "en", targetLanguage = "hi" } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "Missing or invalid 'text' payload for translation.",
        status: 400,
      });
    }

    const bhashini = getBhashiniService();
    const result = await bhashini.translateText({
      text,
      sourceLanguage,
      targetLanguage,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("⚠️ [VoiceController] Translate error:", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || "Failed to translate text.",
      status,
    });
  }
}

/**
 * Handles TTS speech synthesis request.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function postSynthesize(req, res) {
  try {
    const { text, language = "hi", gender = "female" } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "Missing or invalid 'text' payload for speech synthesis.",
        status: 400,
      });
    }

    const bhashini = getBhashiniService();
    const result = await bhashini.synthesizeSpeech({
      text,
      language,
      gender,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("⚠️ [VoiceController] Synthesize error:", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || "Failed to synthesize speech.",
      status,
    });
  }
}

/**
 * Returns supported languages.
 *
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
function getLanguages(_req, res) {
  return res.status(200).json({
    success: true,
    languages: SUPPORTED_LANGUAGES,
    defaultLanguage: "en-IN",
  });
}

/**
 * Returns non-sensitive service status.
 *
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
function getVoiceStatus(_req, res) {
  const bhashini = getBhashiniService();
  return res.status(200).json({
    success: true,
    status: bhashini.getStatus(),
  });
}

module.exports = {
  postTranscribe,
  postTranslate,
  postSynthesize,
  getLanguages,
  getVoiceStatus,
};
