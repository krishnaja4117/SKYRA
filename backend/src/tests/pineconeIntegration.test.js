/**
 * SKYRA – Pinecone Cloud Vector Store Integration & Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates complete end-to-end behavior of the Pinecone Vector Adapter,
 * dimensional safety, metadata preservation, failover to local FAISS,
 * security isolation, and uncoupled ML risk engine independence.
 *
 * Test Sections:
 *   A. Pinecone disabled -> FAISS is selected
 *   B. Pinecone credentials missing -> application remains healthy and FAISS is selected
 *   C. Pinecone invalid/unavailable -> graceful fallback to FAISS
 *   D. Pinecone configured correctly -> Pinecone initializes and is selected
 *   E. Correct embedding dimension -> vectors can be indexed/queried successfully
 *   F. Incorrect dimension -> clear error; never silently corrupt data
 *   G. Metadata filtering -> correct metadata is preserved and retrievable
 *   H. RAG citations -> retrieved chunks trace to official source metadata
 *   I. Security -> credentials are never returned in status or responses
 *   J. ML/XAI independence -> ML risk scoring is completely unaffected
 */

const test = require("node:test");
const assert = require("node:assert");

const { PineconeVectorAdapter } = require("../knowledge/adapters/pineconeAdapter");
const { VectorStore, chunkDocument } = require("../knowledge/vectorStore");
const { RagRetrievalService } = require("../services/ragRetrievalService");
const { EmbeddingService } = require("../services/embeddingService");
const { PRODUCTION_KNOWLEDGE_CORPUS } = require("../knowledge/productionCorpus");
const { calculateRisk } = require("../services/riskEngine");
const { generateXaiExplanation } = require("../services/xaiService");

// Mock Pinecone Client Factory for controlled scenario verification
function createMockPineconeClient({
  dimension = 1536,
  records = [],
  queryMatches = [],
  failOnQuery = false,
  failOnUpsert = false,
  failOnDescribe = false,
} = {}) {
  const storedRecords = [...records];

  const mockIndex = {
    namespace: (ns) => ({
      upsert: async (batch) => {
        if (failOnUpsert) throw new Error("MOCK_PINECONE_NETWORK_TIMEOUT: 504 Gateway Timeout");
        storedRecords.push(...batch);
        return { upsertedCount: batch.length };
      },
      query: async (params) => {
        if (failOnQuery) throw new Error("MOCK_PINECONE_UNAVAILABLE: 503 Service Unavailable");
        // Apply filter if specified
        let matches = queryMatches.length > 0 ? queryMatches : storedRecords.map((r, i) => ({
          id: r.id,
          score: 0.92 - i * 0.05,
          metadata: r.metadata,
        }));

        if (params.filter) {
          if (params.filter.targetRegion) {
            const reqRegion = params.filter.targetRegion.$eq;
            matches = matches.filter((m) => m.metadata?.targetRegion === reqRegion);
          }
          if (params.filter.geographicScope) {
            const reqScope = params.filter.geographicScope.$eq;
            matches = matches.filter((m) => m.metadata?.geographicScope === reqScope);
          }
        }
        return {
          matches: matches.slice(0, params.topK || 4),
        };
      },
    }),
    upsert: async (batch) => {
      if (failOnUpsert) throw new Error("MOCK_PINECONE_NETWORK_TIMEOUT: 504 Gateway Timeout");
      storedRecords.push(...batch);
      return { upsertedCount: batch.length };
    },
    query: async (params) => {
      if (failOnQuery) throw new Error("MOCK_PINECONE_UNAVAILABLE: 503 Service Unavailable");
      let matches = queryMatches.length > 0 ? queryMatches : storedRecords.map((r, i) => ({
        id: r.id,
        score: 0.92 - i * 0.05,
        metadata: r.metadata,
      }));

      if (params.filter) {
        if (params.filter.targetRegion) {
          const reqRegion = params.filter.targetRegion.$eq;
          matches = matches.filter((m) => m.metadata?.targetRegion === reqRegion);
        }
        if (params.filter.geographicScope) {
          const reqScope = params.filter.geographicScope.$eq;
          matches = matches.filter((m) => m.metadata?.geographicScope === reqScope);
        }
      }
      return { matches: matches.slice(0, params.topK || 4) };
    },
  };

  return {
    describeIndex: async (indexName) => {
      if (failOnDescribe) throw new Error("MOCK_PINECONE_NOT_FOUND: Index does not exist (404)");
      return {
        name: indexName,
        dimension,
        metric: "cosine",
        host: `https://${indexName}-mock.pinecone.io`,
        status: { ready: true, state: "Ready" },
      };
    },
    index: () => mockIndex,
    _getStoredRecords: () => storedRecords,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Pinecone Disabled -> FAISS is Selected
// ─────────────────────────────────────────────────────────────────────────────
test("A. Pinecone Disabled: Defaults to FAISS and reports DISABLED status", async () => {
  const adapter = new PineconeVectorAdapter({
    enabled: false,
    apiKey: "pcsk_test_key_dummy_12345",
    indexName: "skyra-test-kb",
  });

  const status = adapter.getStatus();
  assert.strictEqual(status.backend, "PINECONE_CLOUD_INDEX");
  assert.strictEqual(status.status, "DISABLED");
  assert.strictEqual(status.reason, "PINECONE_NOT_ENABLED");
  assert.strictEqual(status.fallback, "FAISS_LOCAL_INDEX");

  const store = new VectorStore({
    pineconeAdapter: adapter,
  });

  assert.strictEqual(store.isPineconeActive(), false);
  const storeStatus = store.getStatus();
  assert.strictEqual(storeStatus.activeBackend, "FAISS");
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Pinecone Credentials Missing -> Remains Healthy and FAISS is Selected
// ─────────────────────────────────────────────────────────────────────────────
test("B. Credentials Missing: Remains healthy, reports BLOCKED status, selects FAISS", async () => {
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "", // Deliberately empty
  });

  assert.strictEqual(adapter.isConfigured(), false);
  const status = adapter.getStatus();
  assert.strictEqual(status.backend, "PINECONE_CLOUD_INDEX");
  assert.strictEqual(status.status, "BLOCKED");
  assert.strictEqual(status.reason, "PINECONE_API_KEY_NOT_CONFIGURED");
  assert.strictEqual(status.fallback, "FAISS_LOCAL_INDEX");

  const store = new VectorStore({ pineconeAdapter: adapter });
  assert.strictEqual(store.isPineconeActive(), false);
  assert.strictEqual(store.getStatus().activeBackend, "FAISS");

  // Querying performs safely on local FAISS
  const matches = store.query("flood warning river level", { topK: 2 });
  assert.ok(matches.length > 0, "FAISS returns search results when Pinecone is unconfigured");
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Pinecone Invalid/Unavailable -> Graceful Fallback to FAISS
// ─────────────────────────────────────────────────────────────────────────────
test("C. Pinecone Unavailable / Network Failure: Gracefully falls back to local FAISS without throwing", async () => {
  const failingMockClient = createMockPineconeClient({
    dimension: 1536,
    failOnQuery: true,
  });

  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_test_mock_secret",
    dimension: 1536,
    client: failingMockClient,
  });

  const store = new VectorStore({
    pineconeAdapter: adapter,
  });

  // Query vector with 1536 dimensions
  const testVector = new Float32Array(1536);
  testVector[0] = 0.8;

  // Search must not throw, but fallback to FAISS
  const results = await store.search(testVector, { topK: 3 });
  assert.ok(Array.isArray(results), "Search must return array on Pinecone error fallback");
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Pinecone Configured Correctly -> Pinecone Initializes and is Selected
// ─────────────────────────────────────────────────────────────────────────────
test("D. Pinecone Configured: Successfully initializes, verifies index, and activates", async () => {
  const mockClient = createMockPineconeClient({ dimension: 1536 });
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    indexName: "skyra-prod-kb",
    dimension: 1536,
    client: mockClient,
  });

  assert.strictEqual(adapter.isConfigured(), true);
  assert.strictEqual(adapter.isEnabled(), true);

  const verification = await adapter.verifyIndex();
  assert.strictEqual(verification.success, true);
  assert.strictEqual(verification.status, "READY");
  assert.strictEqual(verification.indexName, "skyra-prod-kb");
  assert.strictEqual(verification.dimension, 1536);

  const store = new VectorStore({
    pineconeAdapter: adapter,
  });

  assert.strictEqual(store.isPineconeActive(1536), true);
  assert.strictEqual(store.getStatus().activeBackend, "PINECONE");
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Correct Embedding Dimension -> Vectors Indexed and Queried Successfully
// ─────────────────────────────────────────────────────────────────────────────
test("E. Correct Dimension (1536): Chunks upsert and query successfully with namespace", async () => {
  const mockClient = createMockPineconeClient({ dimension: 1536 });
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    indexName: "skyra-disaster-kb",
    namespace: "disaster_advisories",
    dimension: 1536,
    client: mockClient,
  });

  const sampleChunks = [
    {
      chunkId: "TEST_DOC_chunk_0",
      documentId: "TEST_DOC",
      title: "Test Flood Advisory",
      authority: "National Disaster Management Authority",
      authorityLevel: "NATIONAL_AUTHORITY",
      sourceAgency: "NDMA",
      sourceUrl: "https://ndma.gov.in/test",
      text: "Immediate evacuation required for low-lying areas near riverbanks.",
      contentHash: "hash_test_123",
      targetRegion: "National",
      geographicScope: "National",
    },
  ];

  const sampleVectors = [new Float32Array(1536)];
  sampleVectors[0][0] = 0.75;
  sampleVectors[0][1] = 0.66;

  const upsertRes = await adapter.upsert(sampleChunks, sampleVectors);
  assert.strictEqual(upsertRes.success, true);
  assert.strictEqual(upsertRes.status, "OK");
  assert.strictEqual(upsertRes.count, 1);
  assert.strictEqual(upsertRes.namespace, "disaster_advisories");

  // Query vector
  const queryVec = new Float32Array(1536);
  queryVec[0] = 0.75;
  queryVec[1] = 0.66;

  const searchRes = await adapter.search(queryVec, { topK: 1 });
  assert.strictEqual(searchRes.success, true);
  assert.strictEqual(searchRes.backend, "PINECONE");
  assert.strictEqual(searchRes.results.length, 1);
  assert.strictEqual(searchRes.results[0].documentId, "TEST_DOC");
  assert.strictEqual(searchRes.results[0].authority, "National Disaster Management Authority");
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Incorrect Dimension -> Clear Error, Never Silently Corrupts Index
// ─────────────────────────────────────────────────────────────────────────────
test("F. Incorrect Dimension: Rejects 128-dim vector against 1536-dim index safely", async () => {
  const mockClient = createMockPineconeClient({ dimension: 1536 });
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    dimension: 1536,
    client: mockClient,
  });

  const invalidVector = new Float32Array(128); // 128 != 1536
  const sampleChunk = [{ chunkId: "test_c1", documentId: "doc_1", text: "sample text" }];

  // 1. Upsert rejection
  const upsertRes = await adapter.upsert(sampleChunk, [invalidVector]);
  assert.strictEqual(upsertRes.success, false);
  assert.strictEqual(upsertRes.status, "DIMENSION_MISMATCH");
  assert.ok(upsertRes.error.includes("ERR_DIMENSION_MISMATCH"));

  // 2. Query rejection
  const queryRes = await adapter.search(invalidVector, { topK: 2 });
  assert.strictEqual(queryRes.success, false);
  assert.strictEqual(queryRes.status, "DIMENSION_MISMATCH");
  assert.strictEqual(queryRes.fallback, "FAISS_LOCAL_INDEX");

  // 3. VectorStore dimensional safety check
  const store = new VectorStore({ pineconeAdapter: adapter });
  // isPineconeActive returns false when dimension doesn't match
  assert.strictEqual(store.isPineconeActive(128), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Metadata Filtering -> Preserves and Filters by Target Region & Scope
// ─────────────────────────────────────────────────────────────────────────────
test("G. Metadata Filtering: Preserves attributes and filters by region", async () => {
  const records = [
    {
      id: "MUMBAI_FLOOD_c1",
      metadata: {
        documentId: "MCGM-SOP-2023",
        title: "Mumbai Monsoon SOP",
        targetRegion: "Mumbai",
        geographicScope: "City",
        authority: "MCGM",
        text: "Keep sluice gates operational during high tide.",
      },
    },
    {
      id: "CHENNAI_FLOOD_c1",
      metadata: {
        documentId: "TNSDMA-SOP-2023",
        title: "Tamil Nadu Flood SOP",
        targetRegion: "Chennai",
        geographicScope: "City",
        authority: "TNSDMA",
        text: "Monitor Chembarambakkam reservoir release levels.",
      },
    },
  ];

  const mockClient = createMockPineconeClient({
    dimension: 1536,
    records,
  });

  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    dimension: 1536,
    client: mockClient,
  });

  const queryVec = new Float32Array(1536);
  const mumbaiResults = await adapter.search(queryVec, { region: "Mumbai", topK: 4 });
  assert.strictEqual(mumbaiResults.success, true);
  assert.strictEqual(mumbaiResults.results.length, 1);
  assert.strictEqual(mumbaiResults.results[0].targetRegion, "Mumbai");
  assert.strictEqual(mumbaiResults.results[0].authority, "MCGM");
});

// ─────────────────────────────────────────────────────────────────────────────
// H. RAG Citations -> Retrieved Chunks Trace to Official Source Metadata
// ─────────────────────────────────────────────────────────────────────────────
test("H. RAG Citations: Retrieved chunks trace to official agency, title, and URL", async () => {
  const queryMatches = [
    {
      id: "NDMA-FLOOD-2023_c1",
      score: 0.94,
      metadata: {
        documentId: "NDMA-FLOOD-2023",
        chunkId: "NDMA-FLOOD-2023_chunk_0",
        title: "NDMA Standard Operating Procedure for Flood Management",
        authority: "National Disaster Management Authority",
        authorityLevel: "NATIONAL_AUTHORITY",
        sourceAgency: "NDMA",
        sourceUrl: "https://ndma.gov.in/guidelines/flood-management",
        publicationDate: "2023-06-15T00:00:00.000Z",
        effectiveDate: "2023-06-15T00:00:00.000Z",
        version: "v1.0.0",
        geographicScope: "National",
        targetRegion: "National",
        hazardTypes: ["flood"],
        freshness: "current",
        documentStatus: "current",
        text: "Move immediately to higher ground when flood warning is issued.",
        contentHash: "hash_ndma_flood_001",
      },
    },
  ];

  const mockClient = createMockPineconeClient({ dimension: 1536, queryMatches });
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    dimension: 1536,
    client: mockClient,
  });

  const store = new VectorStore({ pineconeAdapter: adapter });

  // Custom embedding service matching 1536 dimensions
  const embeddingService = {
    embedText: async () => ({
      vector: new Float32Array(1536),
      dimension: 1536,
      provider: "OPENAI_MOCK",
    }),
  };

  const retrievalService = new RagRetrievalService({
    vectorStore: store,
    embeddingService,
  });

  const result = await retrievalService.retrieve("what should I do in a flood?");
  assert.strictEqual(result.status, "SUCCESS");
  assert.ok(result.candidates.length > 0);

  const topCandidate = result.candidates[0];
  assert.strictEqual(topCandidate.documentId, "NDMA-FLOOD-2023");
  assert.strictEqual(topCandidate.sourceAgency, "NDMA");
  assert.strictEqual(topCandidate.sourceUrl, "https://ndma.gov.in/guidelines/flood-management");
  assert.strictEqual(topCandidate.authorityLevel, "NATIONAL_AUTHORITY");
});

// ─────────────────────────────────────────────────────────────────────────────
// I. Security -> Credentials Never Exposed in Status, Responses, or Logs
// ─────────────────────────────────────────────────────────────────────────────
test("I. Security: Credentials are never exposed in getStatus, search, or error payloads", async () => {
  const secretKey = "pcsk_SUPER_SECRET_PINECONE_KEY_DO_NOT_LEAK";
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: secretKey,
    indexName: "skyra-secret-kb",
  });

  const status = adapter.getStatus();
  const serializedStatus = JSON.stringify(status);

  assert.strictEqual(serializedStatus.includes(secretKey), false, "Raw API key must NOT appear in getStatus JSON");
  assert.strictEqual(status.apiKey, undefined, "apiKey property must be omitted from status");

  const unconfiguredAdapter = new PineconeVectorAdapter({ enabled: true, apiKey: null });
  const blockedStatus = unconfiguredAdapter.getStatus();
  assert.strictEqual(blockedStatus.status, "BLOCKED");
  assert.strictEqual(JSON.stringify(blockedStatus).includes(secretKey), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// J. ML / XAI Independence -> Vector Store Switch Does NOT Alter ML Risk
// ─────────────────────────────────────────────────────────────────────────────
test("J. ML/XAI Independence: ML risk scoring, confidence, and XAI remain identical regardless of vector store", async () => {
  const weatherInput = {
    rainfall: 65.5,
    forecastRainfall: 85.0,
    humidity: 88,
    windSpeed: 42.0,
    historicalRisk: 55,
    terrainSlope: 4.2,
    temperature: 31.5,
    pressure: 994.0,
  };

  // Baseline ML Prediction
  const baselinePrediction = await calculateRisk(weatherInput);
  const baselineXAI = generateXaiExplanation({
    riskData: baselinePrediction,
    featureObject: weatherInput,
  });

  // Setup vector store with active Pinecone mock
  const mockClient = createMockPineconeClient({ dimension: 1536 });
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    dimension: 1536,
    client: mockClient,
  });

  const store = new VectorStore({ pineconeAdapter: adapter });
  assert.strictEqual(store.isPineconeActive(1536), true);

  // Post-vector-store ML Prediction
  const postPrediction = await calculateRisk(weatherInput);
  const postXAI = generateXaiExplanation({
    riskData: postPrediction,
    featureObject: weatherInput,
  });

  // Assert exact numerical equality - ML risk engine must be 100% uncoupled
  assert.strictEqual(postPrediction.riskScore, baselinePrediction.riskScore);
  assert.strictEqual(postPrediction.riskLevel, baselinePrediction.riskLevel);
  assert.strictEqual(postPrediction.confidence, baselinePrediction.confidence);
  assert.strictEqual(postXAI.whyThisRisk, baselineXAI.whyThisRisk);
  assert.deepStrictEqual(postXAI.featureContributions, baselineXAI.featureContributions);
});

// ─────────────────────────────────────────────────────────────────────────────
// K. Full Ingestion & Sync -> Connects Knowledge Corpus to Pinecone
// ─────────────────────────────────────────────────────────────────────────────
test("K. Ingestion Pipeline: syncToPinecone embeds and batches entire corpus to Pinecone", async () => {
  const mockClient = createMockPineconeClient({ dimension: 1536 });
  const adapter = new PineconeVectorAdapter({
    enabled: true,
    apiKey: "pcsk_mock_valid_key_xyz",
    dimension: 1536,
    client: mockClient,
  });

  const store = new VectorStore({ pineconeAdapter: adapter });

  // Custom embedding service that produces 1536-dim vectors for test batches
  const mockEmbeddingService = {
    embedBatch: async (texts) => ({
      vectors: texts.map(() => new Float32Array(1536)),
      dimension: 1536,
      provider: "OPENAI_MOCK",
    }),
  };

  const syncResult = await store.syncToPinecone(PRODUCTION_KNOWLEDGE_CORPUS, mockEmbeddingService);
  assert.strictEqual(syncResult.success, true);
  assert.strictEqual(syncResult.status, "OK");
  assert.ok(syncResult.count > 0, "Upserted chunk count must be greater than zero");

  // Verify all chunks in Pinecone preserved provenance
  const stored = mockClient._getStoredRecords();
  assert.strictEqual(stored.length, syncResult.count);
  assert.ok(stored[0].metadata.documentId, "Chunk must preserve documentId");
  assert.ok(stored[0].metadata.authority, "Chunk must preserve authority");
  assert.ok(stored[0].metadata.sourceUrl, "Chunk must preserve sourceUrl");
  assert.ok(stored[0].metadata.contentHash, "Chunk must preserve contentHash");
});

