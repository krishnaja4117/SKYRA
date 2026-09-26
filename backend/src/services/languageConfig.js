/**
 * SKYRA – Centralized Language Configuration (Phase 10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical definitions for all supported Indian and global languages, mapping
 * UI display names, ISO 639-1 language codes, Bhashini language tags,
 * and Web Speech API (BCP 47) identifiers.
 *
 * Guarantees:
 *   • Single source of truth for language codes across backend & frontend
 *   • Seamless normalization between Bhashini ("hi") and Web Speech ("hi-IN")
 *   • Safe fallback to English ("en" / "en-IN") for unsupported codes
 */

const SUPPORTED_LANGUAGES = Object.freeze([
  {
    code: "en",
    webSpeechCode: "en-IN",
    name: "English",
    nativeName: "English",
    bhashiniCode: "en",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "hi",
    webSpeechCode: "hi-IN",
    name: "Hindi",
    nativeName: "हिन्दी",
    bhashiniCode: "hi",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "ml",
    webSpeechCode: "ml-IN",
    name: "Malayalam",
    nativeName: "മലയാളം",
    bhashiniCode: "ml",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "ta",
    webSpeechCode: "ta-IN",
    name: "Tamil",
    nativeName: "தமிழ்",
    bhashiniCode: "ta",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "te",
    webSpeechCode: "te-IN",
    name: "Telugu",
    nativeName: "తెలుగు",
    bhashiniCode: "te",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "kn",
    webSpeechCode: "kn-IN",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ",
    bhashiniCode: "kn",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "bn",
    webSpeechCode: "bn-IN",
    name: "Bengali",
    nativeName: "বাংলা",
    bhashiniCode: "bn",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "mr",
    webSpeechCode: "mr-IN",
    name: "Marathi",
    nativeName: "मराठी",
    bhashiniCode: "mr",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "gu",
    webSpeechCode: "gu-IN",
    name: "Gujarati",
    nativeName: "ગુજરાતી",
    bhashiniCode: "gu",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "or",
    webSpeechCode: "or-IN",
    name: "Odia",
    nativeName: "ଓଡ଼ିଆ",
    bhashiniCode: "or",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
  {
    code: "pa",
    webSpeechCode: "pa-IN",
    name: "Punjabi",
    nativeName: "ਪੰਜਾਬੀ",
    bhashiniCode: "pa",
    isSupportedByBhashini: true,
    hasBrowserFallback: true,
  },
]);

/**
 * Normalizes any language code (ISO 639-1, BCP 47, or Bhashini) to standard descriptor.
 *
 * @param {string} inputCode - e.g. "hi-IN", "hi", "hindi", "ta"
 * @returns {Object} Language descriptor (defaults to English if unrecognized)
 */
function resolveLanguage(inputCode) {
  if (!inputCode || typeof inputCode !== "string") {
    return SUPPORTED_LANGUAGES[0]; // English
  }

  const clean = inputCode.trim().toLowerCase();

  const found = SUPPORTED_LANGUAGES.find(
    (lang) =>
      lang.code.toLowerCase() === clean ||
      lang.webSpeechCode.toLowerCase() === clean ||
      lang.bhashiniCode.toLowerCase() === clean ||
      lang.name.toLowerCase() === clean
  );

  return found || SUPPORTED_LANGUAGES[0];
}

/**
 * Checks whether a language is supported.
 *
 * @param {string} code
 * @returns {boolean}
 */
function isLanguageSupported(code) {
  if (!code || typeof code !== "string") return false;
  const clean = code.trim().toLowerCase();
  return SUPPORTED_LANGUAGES.some(
    (lang) =>
      lang.code.toLowerCase() === clean ||
      lang.webSpeechCode.toLowerCase() === clean ||
      lang.bhashiniCode.toLowerCase() === clean
  );
}

module.exports = {
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  isLanguageSupported,
};
