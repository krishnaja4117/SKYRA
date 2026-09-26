/**
 * SKYRA – Weather Data Ingestion Layer Verification Suite (Phase 3)
 */
const assert = require("assert");
const mongoose = require("mongoose");
const {
  fetchWeather,
  validateCoordinates,
  clearWeatherCache,
  validateWeatherResponse,
} = require("../services/weatherService");

async function runTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING SKYRA WEATHER DATA INGESTION TEST SUITE");
  console.log("=================================================\n");

  clearWeatherCache();

  // Test A: Chennai (13.0827, 80.2707)
  console.log("Test A: Live Ingestion for Chennai (13.0827, 80.2707)...");
  const chennai = await fetchWeather(13.0827, 80.2707, "Chennai");
  assert.strictEqual(chennai.latitude, 13.0827);
  assert.strictEqual(chennai.longitude, 80.2707);
  assert.strictEqual(chennai.locationName, "Chennai");
  assert.ok(typeof chennai.current.temperature === "number");
  assert.ok(typeof chennai.current.humidity === "number");
  assert.ok(typeof chennai.current.windSpeed === "number");
  assert.ok(typeof chennai.current.pressure === "number");
  assert.ok(Array.isArray(chennai.forecast.hourly));
  assert.ok(Array.isArray(chennai.forecast.daily));
  assert.ok(chennai.forecast.hourly.length > 0);
  assert.ok(chennai.forecast.daily.length > 0);
  assert.strictEqual(chennai.units.temperature, "°C");
  assert.strictEqual(chennai.units.precipitation, "mm");
  assert.strictEqual(chennai.units.windSpeed, "km/h");
  assert.strictEqual(chennai.units.pressure, "hPa");
  assert.strictEqual(chennai.units.humidity, "%");
  assert.ok(chennai.provenance);
  assert.strictEqual(chennai.provenance.provider, "Open-Meteo");
  assert.strictEqual(chennai.provenance.requestedCoordinates.latitude, 13.0827);
  assert.strictEqual(chennai.provenance.requestedCoordinates.longitude, 80.2707);
  assert.ok(chennai.provenance.actualSourceCoordinates.latitude != null);
  assert.ok(chennai.provenance.actualSourceCoordinates.longitude != null);
  assert.strictEqual(chennai.provenance.dataFreshness, "live");
  assert.strictEqual(chennai.provenance.cacheStatus.isCached, false);
  console.log("✅ Test A passed!\n");

  // Test B: Bengaluru (12.9716, 77.5946)
  console.log("Test B: Live Ingestion for Bengaluru (12.9716, 77.5946)...");
  const bengaluru = await fetchWeather(12.9716, 77.5946, "Bengaluru");
  assert.strictEqual(bengaluru.latitude, 12.9716);
  assert.strictEqual(bengaluru.longitude, 77.5946);
  assert.strictEqual(bengaluru.locationName, "Bengaluru");
  assert.ok(typeof bengaluru.current.temperature === "number");
  assert.strictEqual(bengaluru.provenance.dataFreshness, "live");
  console.log("✅ Test B passed!\n");

  // Test C: Mumbai (19.0760, 72.8777)
  console.log("Test C: Live Ingestion for Mumbai (19.0760, 72.8777)...");
  const mumbai = await fetchWeather(19.0760, 72.8777, "Mumbai");
  assert.strictEqual(mumbai.latitude, 19.0760);
  assert.strictEqual(mumbai.longitude, 72.8777);
  assert.strictEqual(mumbai.locationName, "Mumbai");
  assert.ok(typeof mumbai.current.temperature === "number");
  assert.strictEqual(mumbai.provenance.dataFreshness, "live");
  console.log("✅ Test C passed!\n");

  // Test D: Missing coordinates
  console.log("Test D: Explicit Error on Missing Coordinates...");
  assert.throws(
    () => validateCoordinates(undefined, 80.2707),
    (err) => err.statusCode === 400 && err.sourceStatus === "invalid_coordinates"
  );
  assert.throws(
    () => validateCoordinates(13.0827, null),
    (err) => err.statusCode === 400 && err.sourceStatus === "invalid_coordinates"
  );
  assert.throws(
    () => validateCoordinates("", ""),
    (err) => err.statusCode === 400 && err.sourceStatus === "invalid_coordinates"
  );
  console.log("✅ Test D passed!\n");

  // Test E: Invalid coordinates
  console.log("Test E: Explicit Error on Invalid Coordinates...");
  assert.throws(
    () => validateCoordinates(95, 80.2707),
    (err) => err.statusCode === 400 && err.sourceStatus === "invalid_coordinates"
  );
  assert.throws(
    () => validateCoordinates(13.0827, -200),
    (err) => err.statusCode === 400 && err.sourceStatus === "invalid_coordinates"
  );
  assert.throws(
    () => validateCoordinates("invalid_lat", 80.2707),
    (err) => err.statusCode === 400 && err.sourceStatus === "invalid_coordinates"
  );
  console.log("✅ Test E passed!\n");

  // Test validation error on malformed payload
  console.log("Test E2: Explicit Error on Malformed Weather Payload...");
  assert.throws(
    () => validateWeatherResponse({ current: { temperature_2m: "invalid" } }),
    (err) => err.statusCode === 502 && err.sourceStatus === "malformed_response"
  );
  console.log("✅ Test E2 passed!\n");

  // Test F: MongoDB unavailable
  console.log("Test F: Weather Ingestion with MongoDB Offline...");
  assert.strictEqual(mongoose.connection.readyState, 0); // Not connected
  const offlineResult = await fetchWeather(13.0827, 80.2707, "Chennai");
  assert.ok(offlineResult);
  assert.strictEqual(offlineResult.provenance.persistenceStatus, false);
  assert.strictEqual(offlineResult.pipelineMetadata.persistedToDb, false);
  console.log("✅ Test F passed!\n");

  // Test G: Repeat request to verify cache behavior
  console.log("Test G: Verify Cache Behavior on Repeated Request...");
  clearWeatherCache();
  const firstFetch = await fetchWeather(13.0827, 80.2707, "Chennai");
  assert.strictEqual(firstFetch.pipelineMetadata.fromCache, false);
  assert.strictEqual(firstFetch.provenance.dataFreshness, "live");

  const cachedFetch = await fetchWeather(13.0827, 80.2707, "Chennai");
  assert.strictEqual(cachedFetch.pipelineMetadata.fromCache, true);
  assert.strictEqual(cachedFetch.provenance.dataFreshness, "cached");
  assert.strictEqual(cachedFetch.provenance.cacheStatus.isCached, true);
  assert.strictEqual(cachedFetch.latitude, 13.0827);
  assert.strictEqual(cachedFetch.longitude, 80.2707);
  console.log("✅ Test G passed!\n");

  // Test H: Request two different locations and verify no cross-location cache returns
  console.log("Test H: Cache Isolation Across Different Coordinates...");
  clearWeatherCache();
  const chennaiResult = await fetchWeather(13.0827, 80.2707, "Chennai");
  const bengaluruResult = await fetchWeather(12.9716, 77.5946, "Bengaluru");
  assert.strictEqual(chennaiResult.latitude, 13.0827);
  assert.strictEqual(chennaiResult.longitude, 80.2707);
  assert.strictEqual(bengaluruResult.latitude, 12.9716);
  assert.strictEqual(bengaluruResult.longitude, 77.5946);
  assert.notStrictEqual(chennaiResult.latitude, bengaluruResult.latitude);
  assert.notStrictEqual(chennaiResult.longitude, bengaluruResult.longitude);
  console.log("✅ Test H passed!\n");

  console.log("=================================================");
  console.log("🎉 ALL WEATHER DATA INGESTION TESTS PASSED!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
