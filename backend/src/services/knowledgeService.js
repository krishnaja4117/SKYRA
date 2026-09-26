/**
 * SKYRA – Knowledge Base Ingestion & Retrieval Service (Phase 4 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides structured ingestion, cryptographic duplicate detection, versioning,
 * freshness evaluation, and scope-safe querying for authoritative disaster
 * management and weather safety knowledge.
 *
 * Guarantees:
 *   • Traceable: Preserves author, source agency, publication dates, and checksums
 *   • Versioned: Multi-version history tracking with supersedes relationships
 *   • Freshness-aware: Evaluates current vs expired vs stale status
 *   • Location-safe: Explicit scope matching prevents cross-region contamination
 *   • Non-blocking: Degrades gracefully when MongoDB is disconnected
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const KnowledgeDocument = require("../models/KnowledgeDocument");
const {
  VALID_CATEGORIES,
  VALID_SCOPES,
  VALID_AUTHORITIES,
  VALID_STATUSES,
} = KnowledgeDocument;

/**
 * Calculates deterministic SHA-256 content checksum for data integrity.
 *
 * @param {string} title
 * @param {string} content
 * @param {string} [language="en"]
 * @returns {string} Hex-encoded SHA-256 digest
 */
function calculateContentHash(title, content, language = "en") {
  const normalizedTitle = String(title || "").trim();
  const normalizedContent = String(content || "").trim();
  const normalizedLang = String(language || "en").toLowerCase().trim();
  const raw = `${normalizedTitle}::${normalizedContent}::${normalizedLang}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Validates knowledge input data structure and constraints.
 *
 * @param {Object} data
 * @throws {Error} If required fields are missing or invalid
 */
function validateKnowledgeInput(data) {
  if (!data || typeof data !== "object") {
    const err = new Error("Knowledge document data must be a valid object.");
    err.statusCode = 400;
    throw err;
  }

  if (!data.documentId || typeof data.documentId !== "string" || !data.documentId.trim()) {
    const err = new Error("Missing required field: 'documentId'.");
    err.statusCode = 400;
    throw err;
  }

  if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
    const err = new Error("Missing required field: 'title'.");
    err.statusCode = 400;
    throw err;
  }

  if (!data.content || typeof data.content !== "string" || !data.content.trim()) {
    const err = new Error("Missing required field: 'content'.");
    err.statusCode = 400;
    throw err;
  }

  if (!data.category || !VALID_CATEGORIES.includes(data.category)) {
    const err = new Error(
      `Invalid or missing category '${data.category}'. Allowed categories: ${VALID_CATEGORIES.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  if (data.scope && !VALID_SCOPES.includes(data.scope)) {
    const err = new Error(
      `Invalid scope '${data.scope}'. Allowed scopes: ${VALID_SCOPES.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  if (data.authority && !VALID_AUTHORITIES.includes(data.authority)) {
    const err = new Error(
      `Invalid authority '${data.authority}'. Allowed authorities: ${VALID_AUTHORITIES.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  if (!data.source || typeof data.source !== "string" || !data.source.trim()) {
    const err = new Error("Missing required field: 'source' (e.g. NDMA, IMD, SDMA).");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Evaluates document freshness based on expiry date and age.
 *
 * @param {Object} doc - KnowledgeDocument instance or plain object
 * @returns {"current"|"expired"|"stale"|"archived"}
 */
function checkFreshness(doc) {
  if (!doc) return "stale";
  if (doc.status === "archived") return "archived";

  const now = new Date();

  // Explicit expiry date passed
  if (doc.expiryDate && new Date(doc.expiryDate) < now) {
    return "expired";
  }

  // Stale check: Document older than 2 years without review
  const retrievedOrUpdated = doc.updatedAt || doc.retrievedAt || doc.createdAt;
  if (retrievedOrUpdated) {
    const ageMs = now.getTime() - new Date(retrievedOrUpdated).getTime();
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    if (ageMs > twoYearsMs) {
      return "stale";
    }
  }

  return "current";
}

/**
 * Stores a knowledge document to MongoDB with duplicate detection and versioning.
 *
 * @param {Object} docData
 * @returns {Promise<{ saved: boolean, id?: string, documentId?: string, version?: number, reason?: string }>}
 */
async function saveKnowledgeDocument(docData) {
  validateKnowledgeInput(docData);

  if (mongoose.connection.readyState !== 1) {
    return { saved: false, reason: "mongodb_disconnected" };
  }

  try {
    const lang = docData.language || "en";
    const contentHash = docData.contentHash || calculateContentHash(docData.title, docData.content, lang);

    // Duplicate detection: check if identical content already exists under same documentId
    const existingExact = await KnowledgeDocument.findOne({
      documentId: docData.documentId,
      contentHash,
    }).lean();

    if (existingExact) {
      return {
        saved: false,
        reason: "duplicate_content",
        documentId: existingExact.documentId,
        version: existingExact.version,
        id: existingExact._id.toString(),
      };
    }

    // Versioning: Check if previous version exists under this documentId
    const latestVersion = await KnowledgeDocument.findOne({ documentId: docData.documentId })
      .sort({ version: -1 })
      .lean();

    const version = latestVersion ? latestVersion.version + 1 : (docData.version || 1);
    const supersedes = latestVersion ? latestVersion.documentId : null;

    // Create document
    const doc = new KnowledgeDocument({
      ...docData,
      version,
      supersedes,
      contentHash,
      language: lang,
      retrievedAt: docData.retrievedAt ? new Date(docData.retrievedAt) : new Date(),
    });

    const saved = await doc.save();
    return {
      saved: true,
      id: saved._id.toString(),
      documentId: saved.documentId,
      version: saved.version,
    };
  } catch (err) {
    if (err.code === 11000) {
      return { saved: false, reason: "duplicate_key_error" };
    }
    console.warn("⚠️ [SKYRA KnowledgeService] Non-fatal document save failure:", err.message);
    return { saved: false, reason: err.message };
  }
}

/**
 * Queries knowledge documents with location scope, category, and freshness filtering.
 *
 * @param {Object} [filter]
 * @param {string} [filter.category]
 * @param {string} [filter.hazardType]
 * @param {string} [filter.scope] - "GLOBAL" | "NATIONAL" | "STATE" | "DISTRICT" | "LOCAL"
 * @param {string} [filter.targetRegion] - e.g. "Tamil Nadu", "Odisha"
 * @param {string} [filter.language="en"]
 * @param {string} [filter.status="current"]
 * @param {number} [filter.limit=20]
 * @returns {Promise<Array>} Array of matching knowledge documents
 */
async function queryKnowledgeDocuments(filter = {}) {
  if (mongoose.connection.readyState !== 1) return [];

  try {
    const query = {};

    if (filter.category) query.category = filter.category;
    if (filter.hazardType) query.hazardType = filter.hazardType;
    if (filter.language) query.language = filter.language.toLowerCase();
    if (filter.status) query.status = filter.status;

    // Scope and Region isolation:
    // If a specific region is requested, match documents for that region OR broader scope (NATIONAL, GLOBAL)
    if (filter.targetRegion) {
      query.$or = [
        { targetRegion: filter.targetRegion },
        { scope: { $in: ["GLOBAL", "NATIONAL"] } },
      ];
    } else if (filter.scope) {
      query.scope = filter.scope;
    }

    const limit = Math.min(Math.max(Number(filter.limit || 20), 1), 100);

    const docs = await KnowledgeDocument.find(query)
      .sort({ updatedAt: -1, version: -1 })
      .limit(limit)
      .lean();

    return docs;
  } catch (err) {
    console.warn("⚠️ [SKYRA KnowledgeService] Error querying knowledge documents:", err.message);
    return [];
  }
}

/**
 * Retrieves a single knowledge document by its business documentId and optional version.
 *
 * @param {string} documentId
 * @param {number} [version]
 * @returns {Promise<Object|null>}
 */
async function getDocumentById(documentId, version) {
  if (mongoose.connection.readyState !== 1) return null;

  try {
    const query = { documentId };
    if (version !== undefined) query.version = Number(version);

    return await KnowledgeDocument.findOne(query)
      .sort({ version: -1 })
      .lean();
  } catch (err) {
    console.warn("⚠️ [SKYRA KnowledgeService] Error fetching document by ID:", err.message);
    return null;
  }
}

const { getVectorStore } = require("../knowledge/vectorStore");

/**
 * Executes vector search across authoritative disaster SOPs using FAISS / Pinecone.
 *
 * @param {string} queryText
 * @param {Object} [options]
 * @returns {Object[]}
 */
function queryVectorKnowledge(queryText, options = {}) {
  const store = getVectorStore();
  return store.query(queryText, options);
}

/**
 * Returns operational status of vector database backends.
 */
function getVectorStoreStatus() {
  const store = getVectorStore();
  return store.getStatus();
}

module.exports = {
  calculateContentHash,
  validateKnowledgeInput,
  checkFreshness,
  saveKnowledgeDocument,
  queryKnowledgeDocuments,
  getDocumentById,
  queryVectorKnowledge,
  getVectorStoreStatus,
};
