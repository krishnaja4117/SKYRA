/**
 * SKYRA – Hardened Historical Data Ingestion & Chunking Test Suite (Phase 3)
 */
const assert = require("assert");
const mongoose = require("mongoose");
const {
  fetchHistoricalWeather,
  splitDateRangeIntoChunks,
  mergeHistoricalChunks,
  validateCoordinates,
  validateIsoDate,
  validateDateRange,
  validateEra5Response,
  clearEra5Cache,
  MAX_HISTORICAL_CHUNK_YEARS,
} = require("../services/ingestion/era5Service");

const SMALL_START_DATE = "2023-01-01";
const SMALL_END_DATE = "2023-01-05";

async function runTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING HARDENED SKYRA HISTORICAL INGESTION & CHUNKING SUITE");
  console.log("==================================================================\n");

  clearEra5Cache();

  // Test A: Existing small range: 2023-01-01 -> 2023-01-05 (Expected: ONE chunk)
  console.log("Test A: Small date range produces exactly ONE upstream chunk...");
  const smallChunks = splitDateRangeIntoChunks(SMALL_START_DATE, SMALL_END_DATE, 2);
  assert.strictEqual(smallChunks.length, 1);
  assert.strictEqual(smallChunks[0].startDate, SMALL_START_DATE);
  assert.strictEqual(smallChunks[0].endDate, SMALL_END_DATE);

  const smallResult = await fetchHistoricalWeather(13.0827, 80.2707, SMALL_START_DATE, SMALL_END_DATE);
  assert.ok(smallResult);
  assert.strictEqual(smallResult.provenance.chunking.chunked, false);
  assert.strictEqual(smallResult.provenance.chunking.chunkCount, 1);
  assert.strictEqual(smallResult.provenance.chunking.successfulChunks, 1);
  assert.strictEqual(smallResult.recordCount, 5);
  console.log("✅ Test A passed!\n");

  // Test B: Range exactly at chunk boundary (e.g. 2020-01-01 -> 2021-12-31, exactly 2 years)
  console.log("Test B: Range exactly at 2-year chunk boundary produces ONE chunk...");
  const boundaryChunks = splitDateRangeIntoChunks("2020-01-01", "2021-12-31", 2);
  assert.strictEqual(boundaryChunks.length, 1);
  assert.strictEqual(boundaryChunks[0].startDate, "2020-01-01");
  assert.strictEqual(boundaryChunks[0].endDate, "2021-12-31");
  console.log("✅ Test B passed!\n");

  // Test C: Multi-year range requiring multiple chunks (e.g. 2010-01-01 -> 2025-12-31)
  console.log("Test C: Multi-year range splits into consecutive 2-year chunks...");
  const multiChunks = splitDateRangeIntoChunks("2010-01-01", "2025-12-31", 2);
  assert.strictEqual(multiChunks.length, 8);
  assert.strictEqual(multiChunks[0].startDate, "2010-01-01");
  assert.strictEqual(multiChunks[0].endDate, "2011-12-31");
  assert.strictEqual(multiChunks[1].startDate, "2012-01-01");
  assert.strictEqual(multiChunks[1].endDate, "2013-12-31");
  assert.strictEqual(multiChunks[7].startDate, "2024-01-01");
  assert.strictEqual(multiChunks[7].endDate, "2025-12-31");
  console.log("✅ Test C passed!\n");

  // Test D & E & F & G & H: Merging, sorting, deduplication, and sequence validation
  console.log("Test D-H: Chunk merging, chronological sorting, deduplication, and boundaries...");
  const dummyChunk1 = {
    dailyRecords: [
      { date: "2022-01-01", tempMax: 28, precipitation: 0 },
      { date: "2022-01-02", tempMax: 29, precipitation: 1 },
      { date: "2022-01-03", tempMax: 27, precipitation: 0 },
    ],
  };
  const dummyChunk2 = {
    dailyRecords: [
      { date: "2022-01-03", tempMax: 27, precipitation: 0 }, // Duplicate date with identical data
      { date: "2022-01-04", tempMax: 30, precipitation: 2 },
      { date: "2022-01-05", tempMax: 28, precipitation: 0 },
    ],
  };

  const merged = mergeHistoricalChunks([dummyChunk1, dummyChunk2], {
    startDate: "2022-01-01",
    endDate: "2022-01-05",
  });

  // D: Chronologically sorted
  for (let i = 1; i < merged.length; i++) {
    assert.ok(merged[i - 1].date < merged[i].date);
  }
  // E: No duplicate dates
  assert.strictEqual(merged.length, 5);
  // F: No missing dates
  assert.deepStrictEqual(
    merged.map((r) => r.date),
    ["2022-01-01", "2022-01-02", "2022-01-03", "2022-01-04", "2022-01-05"]
  );
  // G: First date equals requested startDate
  assert.strictEqual(merged[0].date, "2022-01-01");
  // H: Last date equals requested endDate
  assert.strictEqual(merged[merged.length - 1].date, "2022-01-05");
  console.log("✅ Test D-H passed!\n");

  // Test Conflict Detection on Duplicate Dates
  console.log("Test Conflict Detection: Conflicting values on same date throw error...");
  const conflictingChunk = {
    dailyRecords: [
      { date: "2022-01-03", tempMax: 99, precipitation: 150 }, // Conflicting data for 2022-01-03
    ],
  };
  assert.throws(
    () => mergeHistoricalChunks([dummyChunk1, conflictingChunk], { startDate: "2022-01-01", endDate: "2022-01-03" }),
    (err) => err.statusCode === 502 && err.sourceStatus === "data_conflict"
  );
  console.log("✅ Test Conflict Detection passed!\n");

  // Test Sequence Gap Detection
  console.log("Test Gap Detection: Missing date in sequence throws error...");
  const gapChunk = {
    dailyRecords: [
      { date: "2022-01-01", tempMax: 28 },
      { date: "2022-01-03", tempMax: 29 }, // Missing 2022-01-02
    ],
  };
  assert.throws(
    () => mergeHistoricalChunks([gapChunk], { startDate: "2022-01-01", endDate: "2022-01-03" }),
    (err) => err.statusCode === 502 && err.sourceStatus === "sequence_gap"
  );
  console.log("✅ Test Gap Detection passed!\n");

  // Test L: Simulate one failed chunk and verify incomplete data is NOT silently returned
  console.log("Test L: Partial failure fails fast with diagnostics, never returns partial data...");
  const simulatedFailureFetcher = async (lat, lon, start, end) => {
    if (start === "2021-01-01") {
      // Chunk 1 succeeds
      return {
        daily: {
          time: ["2021-01-01"],
          temperature_2m_max: [28],
          temperature_2m_min: [20],
          precipitation_sum: [0],
          wind_speed_10m_max: [10],
          relative_humidity_2m_mean: [70],
          surface_pressure_mean: [1013],
        },
      };
    } else {
      // Chunk 2 fails with network timeout
      const timeoutErr = new Error("Simulated upstream network failure on chunk 2");
      timeoutErr.statusCode = 504;
      timeoutErr.sourceStatus = "timeout";
      throw timeoutErr;
    }
  };

  await assert.rejects(
    async () =>
      fetchHistoricalWeather(13.0827, 80.2707, "2021-01-01", "2023-01-05", {
        maxChunkYears: 1, // Produces 3 chunks (2021, 2022, 2023)
        fetcherOverride: simulatedFailureFetcher,
      }),
    (err) => {
      // Must not silently return partial data; must report diagnostics
      assert.strictEqual(err.statusCode, 504);
      assert.strictEqual(err.sourceStatus, "timeout");
      assert.ok(err.details);
      assert.strictEqual(err.details.completedChunks.length, 1);
      assert.strictEqual(err.details.failedChunk.startDate, "2022-01-01");
      return true;
    }
  );
  console.log("✅ Test L passed!\n");

  // Test I & O: Chennai Real Multi-Year Request (2022-01-01 to 2024-01-05 = 2 chunks across 2-year boundary)
  console.log("Test I & O: Real Multi-Year Chunked Ingestion for Chennai (13.0827, 80.2707)...");
  clearEra5Cache();
  const chennaiMulti = await fetchHistoricalWeather(13.0827, 80.2707, "2022-01-01", "2024-01-05");
  assert.ok(chennaiMulti);
  assert.strictEqual(chennaiMulti.requestedCoordinates.latitude, 13.0827);
  assert.strictEqual(chennaiMulti.requestedCoordinates.longitude, 80.2707);
  assert.strictEqual(chennaiMulti.provenance.chunking.chunked, true);
  assert.strictEqual(chennaiMulti.provenance.chunking.chunkCount, 2);
  assert.strictEqual(chennaiMulti.provenance.chunking.successfulChunks, 2);
  assert.strictEqual(chennaiMulti.recordCount, 735); // Exactly 735 days (365 + 365 + 5)
  assert.strictEqual(chennaiMulti.dailyRecords[0].date, "2022-01-01");
  assert.strictEqual(chennaiMulti.dailyRecords[chennaiMulti.recordCount - 1].date, "2024-01-05");
  assert.ok(chennaiMulti.actualSourceCoordinates.latitude != null);
  assert.ok(chennaiMulti.actualSourceCoordinates.longitude != null);
  console.log("✅ Test I & O passed!\n");

  // Test P: Bengaluru Real Multi-Year Request (2022-01-01 to 2024-01-05 = 2 chunks)
  console.log("Test P: Real Multi-Year Chunked Ingestion for Bengaluru (12.9716, 77.5946)...");
  const bengaluruMulti = await fetchHistoricalWeather(12.9716, 77.5946, "2022-01-01", "2024-01-05");
  assert.ok(bengaluruMulti);
  assert.strictEqual(bengaluruMulti.requestedCoordinates.latitude, 12.9716);
  assert.strictEqual(bengaluruMulti.requestedCoordinates.longitude, 77.5946);
  assert.strictEqual(bengaluruMulti.provenance.chunking.chunked, true);
  assert.strictEqual(bengaluruMulti.recordCount, 735);
  console.log("✅ Test P passed!\n");

  // Test J: Cache Isolation Between Chennai and Bengaluru
  console.log("Test J: Cache Isolation between different coordinates...");
  assert.notStrictEqual(chennaiMulti.requestedCoordinates.latitude, bengaluruMulti.requestedCoordinates.latitude);
  assert.notStrictEqual(chennaiMulti.requestedCoordinates.longitude, bengaluruMulti.requestedCoordinates.longitude);
  assert.notStrictEqual(chennaiMulti.dailyRecords[0].tempMax, bengaluruMulti.dailyRecords[0].tempMax);
  console.log("✅ Test J passed!\n");

  // Test K: Cache Isolation Between Different Date Ranges
  console.log("Test K: Cache Isolation between different date ranges for same location...");
  const chennaiSmall = await fetchHistoricalWeather(13.0827, 80.2707, "2023-01-01", "2023-01-05");
  assert.strictEqual(chennaiSmall.recordCount, 5);
  assert.strictEqual(chennaiMulti.recordCount, 735);
  assert.notStrictEqual(chennaiSmall.recordCount, chennaiMulti.recordCount);
  console.log("✅ Test K passed!\n");

  // Test N: MongoDB Unavailable
  console.log("Test N: Ingestion works gracefully when MongoDB is offline...");
  assert.strictEqual(mongoose.connection.readyState, 0); // Offline
  assert.strictEqual(chennaiMulti.provenance.persistenceStatus, false);
  assert.strictEqual(chennaiMulti.pipelineMetadata.persistedToDb, false);
  console.log("✅ Test N passed!\n");

  // Test Q: Verify Zero Silent Fallback to Bhubaneswar
  console.log("Test Q: Verify Zero Silent Fallback to Bhubaneswar across all requests...");
  const BHUBANESWAR_LAT = 20.2961;
  const BHUBANESWAR_LON = 85.8245;
  assert.notStrictEqual(chennaiMulti.requestedCoordinates.latitude, BHUBANESWAR_LAT);
  assert.notStrictEqual(chennaiMulti.requestedCoordinates.longitude, BHUBANESWAR_LON);
  assert.notStrictEqual(bengaluruMulti.requestedCoordinates.latitude, BHUBANESWAR_LAT);
  assert.notStrictEqual(bengaluruMulti.requestedCoordinates.longitude, BHUBANESWAR_LON);
  console.log("✅ Test Q passed!\n");

  // Test Coordinate & Date Validation errors
  console.log("Test Input Validation: Invalid inputs fail fast with HTTP 400...");
  await assert.rejects(
    async () => fetchHistoricalWeather(undefined, 80.2707, "2023-01-01", "2023-01-05"),
    (err) => err.statusCode === 400
  );
  await assert.rejects(
    async () => fetchHistoricalWeather(13.0827, 80.2707, "2023-01-05", "2023-01-01"), // startDate > endDate
    (err) => err.statusCode === 400
  );
  await assert.rejects(
    async () => fetchHistoricalWeather(13.0827, 80.2707, "1920-01-01", "1920-01-05"), // before 1940
    (err) => err.statusCode === 400
  );
  console.log("✅ Test Input Validation passed!\n");

  console.log("==================================================================");
  console.log("🎉 ALL HARDENED HISTORICAL INGESTION & CHUNKING TESTS PASSED!");
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
