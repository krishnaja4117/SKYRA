/**
 * SKYRA – Pinecone Vector Database Cloud Adapter (Phase 4 & Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Production cloud vector backend adapter using official @pinecone-database/pinecone SDK.
 *
 * Guarantees:
 *   • Environment variable credentials only (PINECONE_API_KEY, PINECONE_INDEX_NAME, PINECONE_NAMESPACE, PINECONE_ENABLED)
 *   • ZERO exposure of secrets in frontend, API responses, or logs
 *   • Compatible with FAISS and vectorStore unified interface
 *   • Full metadata & provenance preservation across chunks (authority, agency, citations, URLs, hashes)
 *   • Strict Dimension Validation: Prevents corrupted upserts/queries on dimensional mismatch
 *   • Graceful Degradation: Defaults to local FAISS when unconfigured, disabled, offline, or mismatched
 *   • Never crashes SKYRA on network, authentication, or index errors
 */

let PineconeSDK = null;
try {
  const pineconeModule = require("@pinecone-database/pinecone");
  PineconeSDK = pineconeModule.Pinecone || pineconeModule.default?.Pinecone || pineconeModule;
} catch (e) {
  // SDK not present in offline/stripped environments; graceful fallback remains active
}

class PineconeVectorAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.PINECONE_API_KEY || null;
    this.indexName = options.indexName || process.env.PINECONE_INDEX_NAME || "skyra-disaster-kb";
    this.namespace = options.namespace !== undefined ? options.namespace : (process.env.PINECONE_NAMESPACE || "");
    this.dimension = options.dimension || (process.env.PINECONE_DIMENSION ? parseInt(process.env.PINECONE_DIMENSION, 10) : 1536);
    this.environment = options.environment || process.env.PINECONE_ENVIRONMENT || "default";

    // Pinecone is only active if explicitly enabled or if options.enabled is true
    this.enabled = options.enabled !== undefined
      ? Boolean(options.enabled)
      : (process.env.PINECONE_ENABLED === "true");

    this._client = options.client || null;
    this._index = null;
    this._isVerified = false;
    this._lastError = null;
  }

  /**
   * Lazily initializes and returns the Pinecone client.
   *
   * @returns {Object|null}
   */
  getClient() {
    if (this._client) return this._client;
    if (!this.apiKey || !this.apiKey.trim()) return null;
    if (!PineconeSDK) return null;

    try {
      this._client = new PineconeSDK({ apiKey: this.apiKey.trim() });
      return this._client;
    } catch (err) {
      this._lastError = err.message;
      return null;
    }
  }

  /**
   * Returns index instance from client.
   *
   * @returns {Object|null}
   */
  getIndex() {
    if (this._index) return this._index;
    const client = this.getClient();
    if (!client) return null;

    try {
      this._index = client.index(this.indexName);
      return this._index;
    } catch (err) {
      this._lastError = err.message;
      return null;
    }
  }

  /**
   * Returns true if valid Pinecone API key is configured.
   *
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim());
  }

  /**
   * Returns true if Pinecone is explicitly enabled.
   *
   * @returns {boolean}
   */
  isEnabled() {
    return Boolean(this.enabled);
  }

  /**
   * Evaluates current configuration status without exposing credentials.
   *
   * @returns {Object}
   */
  getStatus() {
    if (!this.isConfigured()) {
      return {
        backend: "PINECONE_CLOUD_INDEX",
        status: "BLOCKED",
        reason: "PINECONE_API_KEY_NOT_CONFIGURED",
        fallback: "FAISS_LOCAL_INDEX",
        diagnosticMessage: "Pinecone credentials not found in environment; queries automatically routed to local FAISS index.",
      };
    }

    if (!this.isEnabled()) {
      return {
        backend: "PINECONE_CLOUD_INDEX",
        status: "DISABLED",
        reason: "PINECONE_NOT_ENABLED",
        fallback: "FAISS_LOCAL_INDEX",
        indexName: this.indexName,
        dimension: this.dimension,
        namespace: this.namespace,
        diagnosticMessage: "Pinecone is configured but PINECONE_ENABLED is false; queries routed to local FAISS index.",
      };
    }

    return {
      backend: "PINECONE_CLOUD_INDEX",
      status: this._lastError ? "ERROR" : "CONFIGURED",
      indexName: this.indexName,
      dimension: this.dimension,
      namespace: this.namespace,
      enabled: this.enabled,
      error: this._lastError || null,
      fallback: "FAISS_LOCAL_INDEX",
    };
  }

  /**
   * Verifies connectivity and index availability against the live Pinecone API.
   *
   * @returns {Promise<Object>}
   */
  async verifyIndex() {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: "BLOCKED",
        reason: "PINECONE_API_KEY_NOT_CONFIGURED",
        fallback: "FAISS_LOCAL_INDEX",
      };
    }

    if (!this.isEnabled()) {
      return {
        success: false,
        status: "DISABLED",
        reason: "PINECONE_NOT_ENABLED",
        fallback: "FAISS_LOCAL_INDEX",
      };
    }

    try {
      const client = this.getClient();
      if (!client) {
        return {
          success: false,
          status: "ERROR",
          error: "Could not initialize Pinecone client.",
          fallback: "FAISS_LOCAL_INDEX",
        };
      }

      // describeIndex checks index existence and configured dimension
      const indexModel = await client.describeIndex(this.indexName);
      if (indexModel && indexModel.dimension) {
        this.dimension = indexModel.dimension;
      }

      this._isVerified = true;
      this._lastError = null;

      return {
        success: true,
        status: "READY",
        indexName: this.indexName,
        dimension: this.dimension,
        metric: indexModel?.metric || "cosine",
        host: indexModel?.host || undefined,
      };
    } catch (err) {
      this._lastError = err.message;
      this._isVerified = false;
      return {
        success: false,
        status: "UNAVAILABLE",
        error: err.message,
        fallback: "FAISS_LOCAL_INDEX",
        diagnostic: "Pinecone index unreachable. Operating safely on local FAISS fallback.",
      };
    }
  }

  /**
   * Upserts knowledge chunks and embedding vectors to Pinecone.
   *
   * @param {Array<Object>} chunks
   * @param {Array<Float32Array|number[]>} vectors
   * @returns {Promise<Object>}
   */
  async upsert(chunks, vectors) {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: "BLOCKED",
        reason: "PINECONE_API_KEY_NOT_CONFIGURED",
        fallback: "FAISS_LOCAL_INDEX",
      };
    }

    if (!Array.isArray(chunks) || !Array.isArray(vectors)) {
      throw new TypeError("chunks and vectors must be arrays.");
    }

    if (chunks.length !== vectors.length) {
      throw new Error(`Chunks count (${chunks.length}) does not match vectors count (${vectors.length}).`);
    }

    if (chunks.length === 0) {
      return { success: true, count: 0, status: "OK" };
    }

    // Strict Dimension Verification
    const sampleVector = vectors[0];
    if (!sampleVector || sampleVector.length !== this.dimension) {
      return {
        success: false,
        status: "DIMENSION_MISMATCH",
        error: `ERR_DIMENSION_MISMATCH: Vector dimension (${sampleVector ? sampleVector.length : 0}) does not match Pinecone index dimension (${this.dimension}).`,
        fallback: "FAISS_LOCAL_INDEX",
      };
    }

    try {
      const index = this.getIndex();
      if (!index) {
        throw new Error("Failed to acquire Pinecone index instance.");
      }

      const target = this.namespace ? index.namespace(this.namespace) : index;

      // Transform chunks to Pinecone records preserving full metadata & provenance
      const records = chunks.map((chunk, idx) => {
        const vec = vectors[idx];
        return {
          id: String(chunk.chunkId || `${chunk.documentId || "doc"}_chunk_${idx}`),
          values: Array.from(vec),
          metadata: {
            documentId: String(chunk.documentId || ""),
            chunkId: String(chunk.chunkId || `${chunk.documentId || "doc"}_chunk_${idx}`),
            title: String(chunk.title || ""),
            authority: String(chunk.authority || chunk.sourceAgency || ""),
            authorityLevel: String(chunk.authorityLevel || "NATIONAL_AUTHORITY"),
            sourceAgency: String(chunk.sourceAgency || ""),
            sourceType: String(chunk.sourceType || chunk.docType || "Guideline"),
            sourceUrl: String(chunk.sourceUrl || ""),
            publicationDate: String(chunk.publicationDate || ""),
            effectiveDate: String(chunk.effectiveDate || chunk.publicationDate || ""),
            version: String(chunk.version || "1.0.0"),
            supersedes: chunk.supersedes ? String(chunk.supersedes) : "",
            geographicScope: String(chunk.geographicScope || "National"),
            targetRegion: String(chunk.targetRegion || ""),
            hazardTypes: Array.isArray(chunk.hazardTypes) ? chunk.hazardTypes : [],
            freshness: String(chunk.freshness || "current"),
            documentStatus: String(chunk.documentStatus || "current"),
            text: String(chunk.text || ""),
            contentHash: String(chunk.contentHash || ""),
          },
        };
      });

      // Batch upsert in chunks of 50 to prevent HTTP payload overflow
      const batchSize = 50;
      let totalUpserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await target.upsert(batch);
        totalUpserted += batch.length;
      }

      this._lastError = null;
      return {
        success: true,
        status: "OK",
        count: totalUpserted,
        indexName: this.indexName,
        namespace: this.namespace,
      };
    } catch (err) {
      this._lastError = err.message;
      return {
        success: false,
        status: "ERROR",
        error: err.message,
        fallback: "FAISS_LOCAL_INDEX",
      };
    }
  }

  /**
   * Queries Pinecone index with query vector and optional metadata filters.
   *
   * @param {Float32Array|number[]} queryVector
   * @param {Object} [options]
   * @param {number} [options.topK=4]
   * @param {string} [options.region]
   * @param {string} [options.scope]
   * @param {string} [options.hazardType]
   * @param {string} [options.freshness]
   * @returns {Promise<Object>}
   */
  async search(queryVector, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: "BLOCKED",
        reason: "PINECONE_API_KEY_NOT_CONFIGURED",
        fallback: "FAISS_LOCAL_INDEX",
        results: [],
      };
    }

    if (!queryVector || queryVector.length !== this.dimension) {
      return {
        success: false,
        status: "DIMENSION_MISMATCH",
        error: `ERR_DIMENSION_MISMATCH: Query vector dimension (${queryVector ? queryVector.length : 0}) does not match Pinecone dimension (${this.dimension}).`,
        fallback: "FAISS_LOCAL_INDEX",
        results: [],
      };
    }

    try {
      const index = this.getIndex();
      if (!index) {
        throw new Error("Failed to acquire Pinecone index instance.");
      }

      const target = this.namespace ? index.namespace(this.namespace) : index;

      // Construct Pinecone metadata filter
      const filter = {};
      if (options.region) {
        filter.targetRegion = { $eq: options.region };
      }
      if (options.scope) {
        filter.geographicScope = { $eq: options.scope };
      }
      if (options.hazardType) {
        filter.hazardTypes = { $in: [options.hazardType] };
      }
      if (options.freshness) {
        filter.freshness = { $eq: options.freshness };
      }

      const queryParams = {
        vector: Array.from(queryVector),
        topK: options.topK || 4,
        includeMetadata: true,
      };

      if (Object.keys(filter).length > 0) {
        queryParams.filter = filter;
      }

      const response = await target.query(queryParams);
      const matches = (response && response.matches) ? response.matches : [];

      this._lastError = null;
      return {
        success: true,
        status: "OK",
        backend: "PINECONE",
        results: matches.map((m) => ({
          score: typeof m.score === "number" ? m.score : 0,
          ...(m.metadata || {}),
        })),
      };
    } catch (err) {
      this._lastError = err.message;
      return {
        success: false,
        status: "ERROR",
        error: err.message,
        fallback: "FAISS_LOCAL_INDEX",
        results: [],
      };
    }
  }
}

module.exports = {
  PineconeVectorAdapter,
};
