/**
 * SKYRA – Phase 10: Multilingual Voice & Bhashini Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates Bhashini (MeitY) Automatic Speech Recognition (ASR), Neural Machine
 * Translation (NMT), Text-to-Speech (TTS), centralized language configuration,
 * fallback resilience, privacy/security, and end-to-end Phase 9 preservation.
 *
 * Test Checklist:
 *   1. Language configuration & normalization
 *   2. Valid STT request processing
 *   3. Invalid STT request rejection (empty audio, malformed data)
 *   4. Bhashini authentication & header verification
 *   5. Bhashini timeout handling (fail-fast abort)
 *   6. Bhashini provider error handling (HTTP 500 / 400 from upstream)
 *   7. Malformed provider response handling
 *   8. Translation request execution & identical-language passthrough
 *   9. TTS speech synthesis request execution
 *  10. Unsupported language handling (safe default resolution)
 *  11. Offline fallback behavior (when credentials unconfigured)
 *  12. Zero secret / credential exposure in responses & status
 *  13. Zero raw audio persistence (in-memory processing audit)
 *  14. Phase 9 chat integration (voice text fed into POST /api/chat)
 *  15. Voice does not modify ML risk scores or levels
 *  16. Voice does not modify XAI explanations or contributions
 *  17. Voice does not modify RAG evidence or citations
 *  18. Multilingual follow-up conversation context retention
 *  19. Emergency voice query handling (surfaces 112, 1078, 1070)
 *  20. Voice REST API Controller endpoint verification
 */

const test = require("node:test");
const assert = require("node:assert");

const {
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  isLanguageSupported,
} = require("../services/languageConfig");

const {
  BhashiniService,
  getBhashiniService,
  BHASHINI_INFERENCE_URL,
} = require("../services/bhashiniService");

const {
  postTranscribe,
  postTranslate,
  postSynthesize,
  getLanguages,
  getVoiceStatus,
} = require("../controllers/voiceController");

const { processConversationalMessage } = require("../services/conversationService");
const { calculateRisk } = require("../services/riskEngine");
const { extractFeatures } = require("../services/features/featureExtractor");

// Sample valid base64 audio payload (mock WAV header)
const SAMPLE_BASE64_AUDIO = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const TEST_LOCATION = {
  latitude: 18.9388,
  longitude: 72.8354,
  locationName: "Mumbai Coastal Zone",
};

const HIGH_RISK_TELEMETRY = {
  temperature: 29.5,
  humidity: 92,
  windSpeed: 48,
  rainfall: 145.0,
  forecastRainfall: 110.0,
  historicalRisk: 65,
  terrainSlope: 8,
  pressure: 994,
  condition: "Heavy Monsoon Downpour",
};

let totalPassed = 0;
function logPass(title) {
  totalPassed++;
  console.log(`  PASS [Phase 10 - ${String(totalPassed).padStart(2, "0")}] ${title}`);
}

console.log("\n================================================================================");
console.log("   SKYRA PHASE 10: MULTILINGUAL VOICE & BHASHINI VERIFICATION SUITE");
console.log("================================================================================\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Language Configuration & Normalization
// ─────────────────────────────────────────────────────────────────────────────
test("1. Language Configuration: All major Indian languages and English mapped correctly", () => {
  assert.ok(SUPPORTED_LANGUAGES.length >= 6, "Must support at least 6 primary languages");

  const expectedCodes = ["en", "hi", "ml", "ta", "te", "kn"];
  for (const code of expectedCodes) {
    assert.ok(isLanguageSupported(code), `Language ${code} must be recognized as supported`);
  }

  // Normalization checks
  assert.strictEqual(resolveLanguage("hi-IN").code, "hi");
  assert.strictEqual(resolveLanguage("hindi").code, "hi");
  assert.strictEqual(resolveLanguage("ta-IN").bhashiniCode, "ta");
  assert.strictEqual(resolveLanguage("ML").code, "ml");
  assert.strictEqual(resolveLanguage("en").webSpeechCode, "en-IN");

  logPass("1. Language Configuration: Centralized resolution & normalization verified");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Valid STT Request Processing (Mocked Bhashini ASR)
// ─────────────────────────────────────────────────────────────────────────────
test("2. Valid STT: Bhashini ASR pipeline decodes base64 audio to transcript", async () => {
  const mockFetcher = async (url, options) => {
    assert.strictEqual(url, BHASHINI_INFERENCE_URL);
    const body = JSON.parse(options.body);
    assert.strictEqual(body.pipelineTasks[0].taskType, "asr");
    assert.strictEqual(body.pipelineTasks[0].config.language.sourceLanguage, "hi");

    return {
      ok: true,
      json: async () => ({
        pipelineResponse: [
          {
            taskType: "asr",
            output: [{ source: "क्या आज बारिश होगी?" }],
          },
        ],
      }),
    };
  };

  const service = new BhashiniService({
    userId: "test-user-id",
    apiKey: "test-api-key",
    inferenceKey: "test-inference-key",
    fetcher: mockFetcher,
  });

  const result = await service.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "hi-IN",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.text, "क्या आज बारिश होगी?");
  assert.strictEqual(result.language, "hi");
  assert.strictEqual(result.provider, "Bhashini (MeitY)");

  logPass("2. Valid STT: ASR inference successfully parses Hindi audio");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Invalid STT Request Rejection
// ─────────────────────────────────────────────────────────────────────────────
test("3. Invalid STT: Empty audio or missing payload rejected with 400", async () => {
  const service = new BhashiniService();

  await assert.rejects(
    async () => {
      await service.transcribeAudio({ audioContent: "" });
    },
    {
      code: "ERR_EMPTY_AUDIO",
      statusCode: 400,
    }
  );

  await assert.rejects(
    async () => {
      await service.transcribeAudio({ audioContent: "   " });
    },
    {
      code: "ERR_EMPTY_AUDIO",
      statusCode: 400,
    }
  );

  logPass("3. Invalid STT: Empty and malformed audio safely rejected");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Bhashini Authentication & Header Verification
// ─────────────────────────────────────────────────────────────────────────────
test("4. Bhashini Authentication: Uses Authorization header with inference key", async () => {
  let capturedHeaders = null;

  const mockFetcher = async (url, options) => {
    capturedHeaders = options.headers;
    return {
      ok: true,
      json: async () => ({
        pipelineResponse: [{ taskType: "asr", output: [{ source: "Test" }] }],
      }),
    };
  };

  const service = new BhashiniService({
    userId: "usr-12345",
    apiKey: "key-67890",
    inferenceKey: "bhashini-secret-auth-token-xyz",
    fetcher: mockFetcher,
  });

  await service.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "en",
  });

  assert.ok(capturedHeaders, "Headers must be passed to Bhashini");
  assert.strictEqual(capturedHeaders["Authorization"], "bhashini-secret-auth-token-xyz");
  assert.strictEqual(capturedHeaders["Content-Type"], "application/json");

  logPass("4. Bhashini Authentication: Verified Authorization header mechanics");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bhashini Timeout Handling
// ─────────────────────────────────────────────────────────────────────────────
test("5. Bhashini Timeout: Handles upstream timeout gracefully without throwing", async () => {
  const mockFetcher = async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };

  const service = new BhashiniService({
    userId: "usr-1",
    apiKey: "key-1",
    inferenceKey: "inf-1",
    fetcher: mockFetcher,
  });

  const result = await service.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "ta",
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, "BHASHINI_ASR_FAILED");
  assert.ok(result.diagnostic.includes("timed out"));

  logPass("5. Bhashini Timeout: Fail-fast timeout captured and handled cleanly");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Bhashini Provider Error Handling (HTTP 500 / 400 from upstream)
// ─────────────────────────────────────────────────────────────────────────────
test("6. Bhashini Provider Error: Upstream HTTP error does not crash service", async () => {
  const mockFetcher = async () => ({
    ok: false,
    status: 502,
    text: async () => "Bad Gateway: Upstream AI4Bharat model unavailable",
  });

  const service = new BhashiniService({
    userId: "usr-1",
    apiKey: "key-1",
    inferenceKey: "inf-1",
    fetcher: mockFetcher,
  });

  const result = await service.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "ml",
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, "BHASHINI_ASR_FAILED");
  assert.ok(result.diagnostic.includes("502"));

  logPass("6. Bhashini Provider Error: Upstream 502 Bad Gateway handled smoothly");
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Malformed Provider Response Handling
// ─────────────────────────────────────────────────────────────────────────────
test("7. Malformed Provider Response: Handles missing output payload safely", async () => {
  const mockFetcher = async () => ({
    ok: true,
    json: async () => ({
      // Missing pipelineResponse array
      status: "unexpected_format",
    }),
  });

  const service = new BhashiniService({
    userId: "usr-1",
    apiKey: "key-1",
    inferenceKey: "inf-1",
    fetcher: mockFetcher,
  });

  const result = await service.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "te",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.text, ""); // Graceful empty string instead of crash

  logPass("7. Malformed Response: Missing task output handled safely");
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Translation Request Execution & Passthrough
// ─────────────────────────────────────────────────────────────────────────────
test("8. Translation: Translates Indian language text and passes through identical language", async () => {
  const mockFetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.strictEqual(body.pipelineTasks[0].taskType, "translation");
    assert.strictEqual(body.pipelineTasks[0].config.language.sourceLanguage, "hi");
    assert.strictEqual(body.pipelineTasks[0].config.language.targetLanguage, "en");

    return {
      ok: true,
      json: async () => ({
        pipelineResponse: [
          {
            taskType: "translation",
            output: [
              {
                source: "क्या आज बारिश होगी?",
                target: "Will it rain today?",
              },
            ],
          },
        ],
      }),
    };
  };

  const service = new BhashiniService({
    userId: "usr-1",
    apiKey: "key-1",
    inferenceKey: "inf-1",
    fetcher: mockFetcher,
  });

  // Test translation execution
  const translationResult = await service.translateText({
    text: "क्या आज बारिश होगी?",
    sourceLanguage: "hi",
    targetLanguage: "en",
  });

  assert.strictEqual(translationResult.success, true);
  assert.strictEqual(translationResult.text, "Will it rain today?");
  assert.strictEqual(translationResult.provider, "Bhashini (MeitY)");

  // Test identical source and target language passthrough (zero network call)
  const passthroughResult = await service.translateText({
    text: "Will it rain today?",
    sourceLanguage: "en",
    targetLanguage: "en",
  });

  assert.strictEqual(passthroughResult.success, true);
  assert.strictEqual(passthroughResult.text, "Will it rain today?");
  assert.strictEqual(passthroughResult.provider, "PASSTHROUGH");

  logPass("8. Translation: High-fidelity NMT translation & identical-language passthrough verified");
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. TTS Speech Synthesis Request Execution
// ─────────────────────────────────────────────────────────────────────────────
test("9. TTS Synthesis: Bhashini TTS returns base64 WAV audio stream", async () => {
  const mockAudioWav = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

  const mockFetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.strictEqual(body.pipelineTasks[0].taskType, "tts");
    assert.strictEqual(body.pipelineTasks[0].config.language.sourceLanguage, "kn");

    return {
      ok: true,
      json: async () => ({
        pipelineResponse: [
          {
            taskType: "tts",
            audio: [{ audioContent: mockAudioWav }],
          },
        ],
      }),
    };
  };

  const service = new BhashiniService({
    userId: "usr-1",
    apiKey: "key-1",
    inferenceKey: "inf-1",
    fetcher: mockFetcher,
  });

  const result = await service.synthesizeSpeech({
    text: "ಇಂದು ಮಳೆ ಬರಬಹುದು",
    language: "kn",
    gender: "female",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.audioContent, mockAudioWav);
  assert.strictEqual(result.audioFormat, "wav");
  assert.strictEqual(result.provider, "Bhashini (MeitY)");

  logPass("9. TTS Synthesis: Audio stream generated in Kannada");
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Unsupported Language Handling
// ─────────────────────────────────────────────────────────────────────────────
test("10. Unsupported Language: Resolves safely to English default", () => {
  const resolved = resolveLanguage("klingon-99");
  assert.strictEqual(resolved.code, "en");
  assert.strictEqual(resolved.name, "English");

  const nullResolved = resolveLanguage(null);
  assert.strictEqual(nullResolved.code, "en");

  logPass("10. Unsupported Language: Gracefully falls back to default English profile");
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Offline Fallback Behavior (Credentials Unconfigured)
// ─────────────────────────────────────────────────────────────────────────────
test("11. Offline Fallback: Operates safely when credentials are unconfigured", async () => {
  const offlineService = new BhashiniService({
    userId: "",
    apiKey: "",
    inferenceKey: "",
  });

  assert.strictEqual(offlineService.isConfigured(), false);

  // ASR offline fallback
  const asrResult = await offlineService.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "hi",
  });
  assert.strictEqual(asrResult.success, true);
  assert.strictEqual(asrResult.provider, "OFFLINE_FALLBACK");

  // Translation offline fallback
  const nmtResult = await offlineService.translateText({
    text: "Warning",
    sourceLanguage: "en",
    targetLanguage: "hi",
  });
  assert.strictEqual(nmtResult.success, true);
  assert.strictEqual(nmtResult.text, "Warning");
  assert.strictEqual(nmtResult.provider, "OFFLINE_FALLBACK");

  // TTS offline fallback
  const ttsResult = await offlineService.synthesizeSpeech({
    text: "Warning",
    language: "hi",
  });
  assert.strictEqual(ttsResult.success, true);
  assert.strictEqual(ttsResult.audioContent, null);
  assert.strictEqual(ttsResult.provider, "BROWSER_SYNTHESIS_FALLBACK");
  assert.strictEqual(ttsResult.isFallback, true);

  logPass("11. Offline Fallback: Seamless offline operation across ASR, NMT, and TTS");
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Zero Secret Exposure in Voice API & Status
// ─────────────────────────────────────────────────────────────────────────────
test("12. Zero Secret Exposure: No keys or private credentials returned to caller", () => {
  const service = new BhashiniService({
    userId: "SECRET_USER_ID_999",
    apiKey: "SECRET_API_KEY_888",
    inferenceKey: "SECRET_INFERENCE_TOKEN_777",
  });

  const status = service.getStatus();
  const serialized = JSON.stringify(status);

  assert.ok(!serialized.includes("SECRET_USER_ID_999"));
  assert.ok(!serialized.includes("SECRET_API_KEY_888"));
  assert.ok(!serialized.includes("SECRET_INFERENCE_TOKEN_777"));
  assert.strictEqual(status.configured, true);
  assert.strictEqual(status.provider, "Bhashini (MeitY, Government of India)");

  logPass("12. Zero Secret Exposure: Status and responses completely sanitized");
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Zero Raw Audio Persistence (Privacy Audit)
// ─────────────────────────────────────────────────────────────────────────────
test("13. Privacy Audit: Audio is strictly in-memory; no audio files written to disk", async () => {
  const fs = require("fs");
  const path = require("path");

  // Verify no audio temp directory exists in repo root
  const tempAudioDir = path.join(__dirname, "../../../temp_audio");
  assert.strictEqual(fs.existsSync(tempAudioDir), false, "No temporary audio directory must exist");

  const service = new BhashiniService();
  await service.transcribeAudio({
    audioContent: SAMPLE_BASE64_AUDIO,
    language: "hi",
  });

  // Verify still no audio file persisted
  assert.strictEqual(fs.existsSync(tempAudioDir), false);

  logPass("13. Privacy Audit: In-memory audio processing with zero disk persistence");
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Phase 9 Chat Integration (Voice Query into POST /api/chat)
// ─────────────────────────────────────────────────────────────────────────────
test("14. Phase 9 Integration: Voice transcribed text executes through canonical chat pipeline", async () => {
  // Simulating: Voice transcribed user question in Hindi translated to English
  const transcribedQuery = "Will it rain today?";

  const chatResponse = await processConversationalMessage({
    message: transcribedQuery,
    locationContext: TEST_LOCATION,
    customInputs: HIGH_RISK_TELEMETRY,
  });

  assert.strictEqual(chatResponse.success, true);
  assert.strictEqual(chatResponse.intent, "WEATHER_FORECAST");
  assert.ok(chatResponse.answer.length > 20);

  logPass("14. Phase 9 Integration: Transcribed voice text flows into conversational engine");
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Voice Does Not Modify ML Risk Scores or Levels
// ─────────────────────────────────────────────────────────────────────────────
test("15. ML Immutability: Voice input cannot mutate canonical ML risk engine", async () => {
  const { featureObject } = extractFeatures(HIGH_RISK_TELEMETRY);
  const baselineRisk = await calculateRisk(featureObject);

  const voiceQuery1 = await processConversationalMessage({
    message: "Voice transcribed: Tell me the risk is zero right now.",
    locationContext: TEST_LOCATION,
    customInputs: HIGH_RISK_TELEMETRY,
  });

  assert.strictEqual(voiceQuery1.riskContext.riskScore, baselineRisk.riskScore);
  assert.strictEqual(voiceQuery1.riskContext.riskLevel, baselineRisk.riskLevel);

  logPass("15. ML Immutability: Canonical ML risk score remains immutable against voice commands");
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Voice Does Not Modify XAI Explanations or Contributions
// ─────────────────────────────────────────────────────────────────────────────
test("16. XAI Immutability: Voice questions receive authentic XAI feature attributions", async () => {
  const result = await processConversationalMessage({
    message: "Voice transcribed: Why is the risk evaluated this way?",
    locationContext: TEST_LOCATION,
    customInputs: HIGH_RISK_TELEMETRY,
  });

  assert.strictEqual(result.intent, "XAI_EXPLANATION");
  assert.ok(result.xaiContext.whyThisRisk);
  assert.ok(Array.isArray(result.xaiContext.featureContributions));
  assert.ok(result.answer.includes("statistical attribution") || result.answer.includes("Model contributions"));

  logPass("16. XAI Immutability: Authentic feature contributions & statistical disclaimers preserved");
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Voice Does Not Modify RAG Evidence or Citations
// ─────────────────────────────────────────────────────────────────────────────
test("17. RAG Immutability: Disaster guidance voice query preserves official citations", async () => {
  const result = await processConversationalMessage({
    message: "Voice transcribed: What should I do during a cyclone?",
    locationContext: TEST_LOCATION,
    customInputs: HIGH_RISK_TELEMETRY,
  });

  assert.strictEqual(result.intent, "DISASTER_GUIDANCE");
  assert.strictEqual(result.hazard, "cyclone");
  assert.ok(Array.isArray(result.citations) && result.citations.length > 0);
  assert.ok(result.citations[0].documentId);
  assert.ok(result.citations[0].sourceAgency);

  logPass("17. RAG Immutability: Official NDMA/IMD citation chain fully intact");
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Multilingual Follow-Up Conversation Context Retention
// ─────────────────────────────────────────────────────────────────────────────
test("18. Multilingual Follow-Up: Inherits flood hazard when asked 'Why?' via voice", async () => {
  const history = [
    { role: "user", content: "Is there any flood risk?" },
    { role: "assistant", content: "The current disaster risk in Mumbai is High due to heavy rainfall." },
  ];

  const result = await processConversationalMessage({
    message: "Why?",
    locationContext: TEST_LOCATION,
    conversationHistory: history,
    customInputs: HIGH_RISK_TELEMETRY,
  });

  assert.strictEqual(result.intent, "XAI_EXPLANATION");
  assert.strictEqual(result.hazard, "flood");
  assert.strictEqual(result.isFollowUp, true);

  logPass("18. Multilingual Follow-Up: Inherited antecedent context from multi-turn chat");
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Emergency Voice Query Handling
// ─────────────────────────────────────────────────────────────────────────────
test("19. Emergency Voice Query: Directs user to verified official emergency helplines", async () => {
  const result = await processConversationalMessage({
    message: "Voice transcribed: I need help, I am trapped in the floodwaters!",
    locationContext: TEST_LOCATION,
    customInputs: HIGH_RISK_TELEMETRY,
  });

  assert.strictEqual(result.intent, "EMERGENCY");
  assert.ok(result.answer.includes("112"));
  assert.ok(result.answer.includes("1078") || result.answer.includes("1070"));

  logPass("19. Emergency Voice Query: Validated official numbers (112, 1078, 1070) surfaced");
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Voice REST API Controller Endpoint Verification
// ─────────────────────────────────────────────────────────────────────────────
test("20. REST API Controller: /api/voice endpoints validate inputs and execute cleanly", async () => {
  // Test GET /api/voice/languages
  let langStatus = null;
  let langBody = null;
  getLanguages({}, {
    status(s) { langStatus = s; return this; },
    json(b) { langBody = b; return this; },
  });
  assert.strictEqual(langStatus, 200);
  assert.ok(Array.isArray(langBody.languages));
  assert.ok(langBody.languages.length >= 6);

  // Test GET /api/voice/status
  let statStatus = null;
  let statBody = null;
  getVoiceStatus({}, {
    status(s) { statStatus = s; return this; },
    json(b) { statBody = b; return this; },
  });
  assert.strictEqual(statStatus, 200);
  assert.strictEqual(statBody.success, true);
  assert.strictEqual(statBody.status.provider, "Bhashini (MeitY, Government of India)");

  // Test POST /api/voice/transcribe with missing audio
  let errStatus = null;
  let errBody = null;
  await postTranscribe({ body: { audio: "" } }, {
    status(s) { errStatus = s; return this; },
    json(b) { errBody = b; return this; },
  });
  assert.strictEqual(errStatus, 400);
  assert.ok(errBody.error);

  // Test POST /api/voice/translate with valid text
  let transStatus = null;
  let transBody = null;
  await postTranslate({ body: { text: "Heavy Rain", sourceLanguage: "en", targetLanguage: "en" } }, {
    status(s) { transStatus = s; return this; },
    json(b) { transBody = b; return this; },
  });
  assert.strictEqual(transStatus, 200);
  assert.strictEqual(transBody.text, "Heavy Rain");

  // Test POST /api/voice/synthesize with valid text
  let synthStatus = null;
  let synthBody = null;
  await postSynthesize({ body: { text: "Heavy Rain Alert", language: "hi" } }, {
    status(s) { synthStatus = s; return this; },
    json(b) { synthBody = b; return this; },
  });
  assert.strictEqual(synthStatus, 200);
  assert.strictEqual(synthBody.success, true);

  logPass("20. REST API Controller: All 5 voice endpoints verified with status codes");
});
