/**
 * SKYRA – FAISS Local Vector Search Adapter (Phase 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements local vector indexing and similarity retrieval compatible with
 * FAISS IndexFlatIP (cosine similarity on unit vectors).
 *
 * Guarantees:
 *   • Reproducible, deterministic indexing
 *   • Persistent index serialization to disk
 *   • Metadata mapping: document IDs, chunk IDs, source agency, URLs, and versions
 *   • Metadata filtering: geographicScope, targetRegion, freshness, agency
 *   • Truthful retrieval: never returns fabricated documents on empty search
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_INDEX_DIR = path.resolve(__dirname, "../../../data/faiss_index");
const DEFAULT_INDEX_FILE = path.join(DEFAULT_INDEX_DIR, "index.json");

class FaissVectorAdapter {
  constructor(options = {}) {
    this.dimension = options.dimension || 128;
    this.indexDir = options.indexDir || DEFAULT_INDEX_DIR;
    this.indexFile = options.indexFile || DEFAULT_INDEX_FILE;
    this.chunks = [];
    this.vectors = []; // Array of Float32Arrays
  }

  /**
   * Resets the in-memory index.
   */
  reset() {
    this.chunks = [];
    this.vectors = [];
  }

  /**
   * Adds an array of chunk objects and their corresponding unit vectors to the index.
   *
   * @param {Object[]} chunks
   * @param {Float32Array[]|number[][]} vectors
   */
  add(chunks, vectors) {
    if (!Array.isArray(chunks) || !Array.isArray(vectors)) {
      throw new TypeError("Chunks and vectors must be arrays.");
    }
    if (chunks.length !== vectors.length) {
      throw new Error(`Chunks count (${chunks.length}) does not match vectors count (${vectors.length}).`);
    }

    for (let i = 0; i < chunks.length; i++) {
      const v = vectors[i] instanceof Float32Array ? vectors[i] : new Float32Array(vectors[i]);
      this.chunks.push(chunks[i]);
      this.vectors.push(v);
    }
  }

  /**
   * Performs Inner Product (Cosine Similarity) search against all indexed vectors.
   *
   * @param {Float32Array|number[]} queryVector
   * @param {Object} [options]
   * @param {number} [options.topK=3]
   * @param {string} [options.scope]
   * @param {string} [options.region]
   * @param {string} [options.freshness]
   * @param {string} [options.agency]
   * @returns {Object[]} Top-K results with similarity score and metadata
   */
  search(queryVector, options = {}) {
    if (!queryVector || this.vectors.length === 0) {
      return [];
    }

    const q = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
    const topK = Math.max(Number(options.topK || 3), 1);
    const scored = [];

    for (let i = 0; i < this.vectors.length; i++) {
      const chunk = this.chunks[i];

      // Metadata filters
      if (options.scope && chunk.geographicScope !== "National" && chunk.geographicScope !== options.scope) {
        continue;
      }
      if (options.region && chunk.targetRegion && chunk.targetRegion.toLowerCase() !== options.region.toLowerCase()) {
        continue;
      }
      if (options.freshness && chunk.freshness !== options.freshness) {
        continue;
      }
      if (options.agency && !chunk.sourceAgency.toLowerCase().includes(options.agency.toLowerCase())) {
        continue;
      }
      if (options.hazardType && Array.isArray(chunk.hazardTypes) && chunk.hazardTypes.length > 0 && !chunk.hazardTypes.includes(options.hazardType)) {
        continue;
      }

      // Compute dot product (since vectors are unit-normalized, dot product == cosine similarity)
      const v = this.vectors[i];
      let dot = 0;
      for (let d = 0; d < this.dimension; d++) {
        dot += q[d] * v[d];
      }

      scored.push({
        score: Math.round(dot * 10000) / 10000,
        ...chunk,
      });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  /**
   * Persists index to local disk.
   */
  saveIndex() {
    try {
      if (!fs.existsSync(this.indexDir)) {
        fs.mkdirSync(this.indexDir, { recursive: true });
      }

      const serialized = {
        dimension: this.dimension,
        count: this.chunks.length,
        savedAt: new Date().toISOString(),
        chunks: this.chunks,
        vectors: this.vectors.map((v) => Array.from(v)),
      };

      fs.writeFileSync(this.indexFile, JSON.stringify(serialized, null, 2), "utf8");
      return true;
    } catch (err) {
      console.warn("⚠️ [FaissVectorAdapter] Failed to serialize vector index to disk:", err.message);
      return false;
    }
  }

  /**
   * Loads index from local disk.
   */
  loadIndex() {
    try {
      if (!fs.existsSync(this.indexFile)) {
        return false;
      }

      const content = fs.readFileSync(this.indexFile, "utf8");
      const parsed = JSON.parse(content);

      this.reset();
      this.dimension = parsed.dimension || this.dimension;
      const chunks = parsed.chunks || [];
      const vectors = (parsed.vectors || []).map((v) => new Float32Array(v));

      this.add(chunks, vectors);
      return true;
    } catch (err) {
      console.warn("⚠️ [FaissVectorAdapter] Failed to load vector index from disk:", err.message);
      return false;
    }
  }

  getIndexStats() {
    return {
      backend: "FAISS_LOCAL_INDEX",
      dimension: this.dimension,
      totalChunks: this.chunks.length,
      storageFile: this.indexFile,
      persistedOnDisk: fs.existsSync(this.indexFile),
    };
  }
}

module.exports = {
  FaissVectorAdapter,
};
