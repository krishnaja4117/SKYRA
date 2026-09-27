/**
 * SKYRA – Frontend Multilingual Voice Service (Phase 10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Communicates with backend Bhashini voice endpoints for Speech-to-Text (ASR),
 * Neural Machine Translation (NMT), and Text-to-Speech (TTS).
 *
 * Guarantees:
 *   • Never sends or receives private cloud secrets (backend proxy architecture)
 *   • Graceful fallback to native Web Speech API if backend voice fails
 *   • Audio playback via HTML5 Web Audio / AudioContext for base64 WAV streams
 */

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api/voice`;

/**
 * Transcribes base64-encoded audio using backend Bhashini ASR.
 *
 * @param {Object} params
 * @param {string} params.audio - Base64 audio string
 * @param {string} [params.language="hi"] - Language code
 * @param {string} [params.format="wav"] - Audio format
 * @returns {Promise<{ success: boolean, text: string, language: string, provider: string }>}
 */
export async function transcribeVoice({ audio, language = "hi", format = "wav" }) {
  try {
    const response = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio,
        language,
        format,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Voice transcription HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn("SKYRA voice transcription warning:", err.message);
    return {
      success: false,
      text: "",
      error: err.message,
    };
  }
}

/**
 * Translates text between Indian languages and English using backend Bhashini NMT.
 *
 * @param {Object} params
 * @param {string} params.text
 * @param {string} [params.sourceLanguage="en"]
 * @param {string} [params.targetLanguage="hi"]
 * @returns {Promise<{ success: boolean, text: string, provider: string }>}
 */
export async function translateVoiceText({ text, sourceLanguage = "en", targetLanguage = "hi" }) {
  try {
    const response = await fetch(`${API_BASE}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Translation HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn("SKYRA translation warning:", err.message);
    return {
      success: false,
      text, // Safe fallback: return original text
      error: err.message,
    };
  }
}

/**
 * Synthesizes text into Indian-language audio using backend Bhashini TTS.
 *
 * @param {Object} params
 * @param {string} params.text
 * @param {string} [params.language="hi"]
 * @param {string} [params.gender="female"]
 * @returns {Promise<{ success: boolean, audioContent: string|null, audioFormat: string, isFallback: boolean }>}
 */
export async function synthesizeVoice({ text, language = "hi", gender = "female" }) {
  try {
    const response = await fetch(`${API_BASE}/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language,
        gender,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Speech synthesis HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn("SKYRA speech synthesis warning:", err.message);
    return {
      success: true,
      audioContent: null,
      isFallback: true,
      error: err.message,
    };
  }
}

/**
 * Plays base64-encoded audio in the browser.
 *
 * @param {string} base64Audio
 * @param {string} [format="audio/wav"]
 * @returns {Promise<HTMLAudioElement>}
 */
export function playAudioBase64(base64Audio, format = "audio/wav") {
  return new Promise((resolve, reject) => {
    if (!base64Audio) {
      return reject(new Error("No audio content to play"));
    }

    const audioUrl = `data:${format};base64,${base64Audio}`;
    const audio = new Audio(audioUrl);

    audio.onended = () => resolve(audio);
    audio.onerror = (err) => reject(err);

    audio.play().catch(reject);
  });
}
