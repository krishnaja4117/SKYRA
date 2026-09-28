const test = require("node:test");
const assert = require("node:assert");
const { classifyIntent, normalizeQuery } = require("../services/conversationIntentService");
const { processConversationalMessage } = require("../services/conversationService");

test("Multilingual Verification: Unicode query normalization preserves Indic characters", () => {
  const hindiQuery = "क्या आज बारिश होगी?";
  const normHindi = normalizeQuery(hindiQuery);
  assert.ok(normHindi.includes("क्या"), "Hindi letters must be preserved in normalizeQuery");
  assert.ok(normHindi.includes("बारिश"), "Hindi letters must be preserved in normalizeQuery");

  const malQuery = "ഇന്ന് മഴ പെയ്യുമോ?";
  const normMal = normalizeQuery(malQuery);
  assert.ok(normMal.includes("ഇന്ന്"), "Malayalam letters must be preserved in normalizeQuery");
  assert.ok(normMal.includes("മഴ"), "Malayalam letters must be preserved in normalizeQuery");

  const engQuery = "Will it rain today in Mumbai?";
  const normEng = normalizeQuery(engQuery);
  assert.strictEqual(normEng, "will it rain today in mumbai?");
});

test("English Chat API Test: Returns English response and proper metadata", async () => {
  const result = await processConversationalMessage({
    message: "What is the weather now?",
    locationContext: { latitude: 19.076, longitude: 72.8777, locationName: "Mumbai" },
    language: "en-IN",
    customInputs: {
      temperature: 28,
      humidity: 75,
      windSpeed: 15,
      rainfall: 0,
      forecastRainfall: 0,
      historicalRisk: 20,
      terrainSlope: 2,
      pressure: 1012,
      condition: "Clear",
    },
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.intent, "WEATHER_CURRENT");
  assert.ok(result.answer.includes("28°C") || result.answer.includes("28"));
  assert.strictEqual(result.localSynthesizerLanguageLimited, false);
});

test("Hindi Chat API Test: Correctly handles hi-IN language request", async () => {
  const result = await processConversationalMessage({
    message: "मौसम कैसा है?",
    locationContext: { latitude: 28.6139, longitude: 77.2090, locationName: "New Delhi" },
    language: "hi-IN",
    customInputs: {
      temperature: 30,
      humidity: 60,
      windSpeed: 10,
      rainfall: 0,
      forecastRainfall: 0,
      historicalRisk: 25,
      terrainSlope: 1,
      pressure: 1010,
      condition: "Clear",
    },
  });

  assert.strictEqual(result.success, true);
  // Offline local synthesizer produces fallback text with localSynthesizerLanguageLimited = true
  assert.strictEqual(result.localSynthesizerLanguageLimited, true);
  assert.ok(result.answer.length > 0);
});

test("Malayalam Chat API Test: Correctly handles ml-IN language request", async () => {
  const result = await processConversationalMessage({
    message: "ഇന്ന് മഴ പെയ്യുമോ?",
    locationContext: { latitude: 9.9312, longitude: 76.2673, locationName: "Kochi" },
    language: "ml-IN",
    customInputs: {
      temperature: 27,
      humidity: 85,
      windSpeed: 20,
      rainfall: 5,
      forecastRainfall: 10,
      historicalRisk: 40,
      terrainSlope: 3,
      pressure: 1008,
      condition: "Rain",
    },
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.localSynthesizerLanguageLimited, true);
  assert.ok(result.answer.length > 0);
});
