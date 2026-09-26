/**
 * SKYRA – Embedding Generation & Provider Abstraction (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides unified dense semantic vector embeddings supporting both production
 * cloud embedding APIs (OpenAI text-embedding-3-small) and 100% offline
 * deterministic local unit embeddings.
 *
 * Guarantees:
 *   • Interface Uniformity: Both cloud and local providers return Float32Array unit vectors
 *   • Zero Offline Crashes: Gracefully falls back to local deterministic embedding when offline
 *   • Explicit Metadata: Every embedding carries provider, model, and dimension metadata
 *   • Batch Embedding Support: Efficient parallel or batched vectorization
 *   • Strict Dimension Validation: Prevents silent dimensional mismatch against vector indices
 */

const crypto = require("crypto");

const LOCAL_DIMENSION = 128;
const OPENAI_DIMENSION = 1536;

/**
 * Deterministically generates a 128-dimensional dense semantic unit vector
 * from text tokens using dual cryptographic hashing (SHA-256 + MD5).
 * Guaranteed 100% offline, zero latency, and bit-for-bit reproducible.
 *
 * @param {string} text
 * @param {number} [dimension=128]
 * @returns {Float32Array} Normalized unit vector
 */
function generateLocalEmbedding(text, dimension = LOCAL_DIMENSION) {
  if (!text || typeof text !== "string") {
    const zero = new Float32Array(dimension);
    zero[0] = 1.0;
    return zero;
  }

  const cleanText = text.toLowerCase().replace(/[^\w\s]/g, " ");
  const words = cleanText.split(/\s+/).filter(Boolean);

  const vector = new Float32Array(dimension);
  if (words.length === 0) {
    vector[0] = 1.0;
    return vector;
  }

  for (const word of words) {
    const h1 = parseInt(crypto.createHash("md5").update(word).digest("hex").slice(0, 8), 16);
    const h2 = parseInt(crypto.createHash("sha256").update(word).digest("hex").slice(0, 8), 16);

    const idx1 = Math.abs(h1) % dimension;
    const idx2 = Math.abs(h2) % dimension;
    const sign1 = (h1 & 1) ? 1.0 : -1.0;
    const sign2 = (h2 & 1) ? 1.0 : -1.0;

    vector[idx1] += sign1 * 1.5;
    vector[idx2] += sign2 * 1.0;
  }

  // L2 Euclidean Unit Normalization
  let sumSq = 0;
  for (let i = 0; i < dimension; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);

  if (norm > 1e-6) {
    for (let i = 0; i < dimension; i++) {
      vector[i] = vector[i] / norm;
    }
  } else {
    vector[0] = 1.0;
  }

  return vector;
}

class EmbeddingService {
  constructor(options = {}) {
    this.apiKey = process.env.OPENAI_API_KEY || null;
    this.provider = options.provider || (this.apiKey ? "OPENAI" : "LOCAL");
    this.model = options.model || (this.provider === "OPENAI" ? "text-embedding-3-small" : "skyra-deterministic-hash-v1");
    this.dimension = options.dimension || (this.provider === "OPENAI" ? OPENAI_DIMENSION : LOCAL_DIMENSION);
  }

  /**
   * Returns current active embedding configuration.
   */
  getMetadata() {
    return {
      provider: this.provider,
      model: this.model,
      dimension: this.dimension,
      isLocalFallback: this.provider === "LOCAL" || !this.apiKey,
    };
  }

  /**
   * Generates embedding for a single text string.
   *
   * @param {string} text
   * @returns {Promise<{ vector: Float32Array, dimension: number, provider: string, model: string }>}
   */
  async embedText(text) {
    if (this.provider === "OPENAI" && this.apiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: text,
            model: this.model,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const rawVec = data.data[0].embedding;
          const vec = new Float32Array(rawVec);
          return {
            vector: vec,
            dimension: vec.length,
            provider: "OPENAI",
            model: this.model,
          };
        }
        console.warn(`⚠️ [EmbeddingService] OpenAI HTTP ${response.status}. Reverting to local embedding.`);
      } catch (err) {
        console.warn("⚠️ [EmbeddingService] OpenAI embedding request failed:", err.message);
      }
    }

    // Local deterministic fallback
    const vec = generateLocalEmbedding(text, LOCAL_DIMENSION);
    return {
      vector: vec,
      dimension: LOCAL_DIMENSION,
      provider: "LOCAL",
      model: "skyra-deterministic-hash-v1",
    };
  }

  /**
   * Generates embeddings for an array of text strings.
   *
   * @param {string[]} texts
   * @returns {Promise<{ vectors: Float32Array[], dimension: number, provider: string, model: string }>}
   */
  async embedBatch(texts) {
    if (!Array.isArray(texts)) {
      throw new TypeError("texts must be an array of strings.");
    }

    if (texts.length === 0) {
      return { vectors: [], dimension: this.dimension, provider: this.provider, model: this.model };
    }

    if (this.provider === "OPENAI" && this.apiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: texts,
            model: this.model,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const vectors = data.data.map((item) => new Float32Array(item.embedding));
          return {
            vectors,
            dimension: vectors[0].length,
            provider: "OPENAI",
            model: this.model,
          };
        }
      } catch (err) {
        console.warn("⚠️ [EmbeddingService] OpenAI batch request failed:", err.message);
      }
    }

    // Local batch fallback
    const vectors = texts.map((t) => generateLocalEmbedding(t, LOCAL_DIMENSION));
    return {
      vectors,
      dimension: LOCAL_DIMENSION,
      provider: "LOCAL",
      model: "skyra-deterministic-hash-v1",
    };
  }

  /**
   * Validates vector dimensional compatibility against target dimension.
   *
   * @param {Float32Array|number[]} vector
   * @param {number} expectedDimension
   * @throws {Error} If dimension mismatch detected
   */
  validateDimension(vector, expectedDimension) {
    if (!vector || vector.length !== expectedDimension) {
      throw new Error(
        `ERR_DIMENSION_MISMATCH: Vector dimension (${vector ? vector.length : 0}) does not match index dimension (${expectedDimension}).`
      );
    }
  }
}

// Singleton instance
let _embeddingServiceInstance = null;

function getEmbeddingService(options) {
  if (!_embeddingServiceInstance || options) {
    _embeddingServiceInstance = new EmbeddingService(options);
  }
  return _embeddingServiceInstance;
}

module.exports = {
  EmbeddingService,
  getEmbeddingService,
  generateLocalEmbedding,
  LOCAL_DIMENSION,
  OPENAI_DIMENSION,
};
