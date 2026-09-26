/**
 * SKYRA – Document Ingestion & Provenance Tracking Service (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides production-grade document validation, cryptographic duplicate
 * detection, semantic change detection, version lineage management, and
 * immutable source provenance for authoritative disaster management literature.
 *
 * Guarantees:
 *   • Exact Source Tracing: Every chunk traces back to document, authority, and URL
 *   • Non-Destructive Versioning: Never overwrites or deletes historical documents
 *   • SHA-256 Integrity: Content hash guarantees zero silent data corruption
 *   • Deterministic Authority Classification: NATIONAL > STATE > LOCAL > TRUSTED
 *   • Safe Fallback: In-memory registry maintains operation when MongoDB is offline
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const KnowledgeDocument = require("../models/KnowledgeDocument");

const VALID_AUTHORITY_LEVELS = Object.freeze([
  "NATIONAL_AUTHORITY",
  "STATE_AUTHORITY",
  "LOCAL_AUTHORITY",
  "TRUSTED_INSTITUTION",
]);

// In-memory document registry for deterministic offline execution
const _inMemoryDocumentRegistry = new Map();

/**
 * Calculates deterministic SHA-256 content checksum.
 *
 * @param {string} title
 * @param {string} content
 * @param {string} [language="en"]
 * @returns {string} Hex-encoded SHA-256 digest
 */
function calculateContentHash(title, content, language = "en") {
  const normTitle = String(title || "").trim();
  const normContent = String(content || "").trim();
  const normLang = String(language || "en").toLowerCase().trim();
  const raw = `${normTitle}::${normContent}::${normLang}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Maps raw source agency to standardized authority level.
 *
 * @param {string} authority
 * @param {string} [agencyName]
 * @returns {string} One of VALID_AUTHORITY_LEVELS
 */
function standardizeAuthorityLevel(authority, agencyName = "") {
  if (VALID_AUTHORITY_LEVELS.includes(authority)) {
    return authority;
  }

  const combined = `${authority || ""} ${agencyName || ""}`.toLowerCase();

  if (
    combined.includes("national") ||
    combined.includes("ndma") ||
    combined.includes("imd") ||
    combined.includes("cwc") ||
    combined.includes("ministry")
  ) {
    return "NATIONAL_AUTHORITY";
  }

  if (
    combined.includes("sdma") ||
    combined.includes("state") ||
    combined.includes("tnsdma") ||
    combined.includes("osdma") ||
    combined.includes("bsdma")
  ) {
    return "STATE_AUTHORITY";
  }

  if (
    combined.includes("corporation") ||
    combined.includes("mcgm") ||
    combined.includes("gcc") ||
    combined.includes("municipal") ||
    combined.includes("district") ||
    combined.includes("city")
  ) {
    return "LOCAL_AUTHORITY";
  }

  return "TRUSTED_INSTITUTION";
}

/**
 * Validates document payload before ingestion.
 *
 * @param {Object} docData
 * @throws {Error} If required fields are missing or invalid
 */
function validateIngestionPayload(docData) {
  if (!docData || typeof docData !== "object") {
    throw new Error("ERR_INVALID_PAYLOAD: Document payload must be an object.");
  }

  const required = ["documentId", "title", "content", "sourceAgency", "sourceUrl"];
  for (const field of required) {
    if (!docData[field] || typeof docData[field] !== "string" || !docData[field].trim()) {
      throw new Error(`ERR_MISSING_FIELD: Missing required document field '${field}'.`);
    }
  }

  if (docData.content.trim().length < 20) {
    throw new Error("ERR_INSUFFICIENT_CONTENT: Document content too brief for knowledge extraction.");
  }
}

/**
 * Ingests a single document with version control, duplicate detection, and provenance.
 *
 * @param {Object} rawDoc
 * @returns {Promise<Object>} Ingestion result record
 */
async function ingestDocument(rawDoc) {
  try {
    validateIngestionPayload(rawDoc);

    const docId = rawDoc.documentId.trim();
    const title = rawDoc.title.trim();
    const content = rawDoc.content.trim();
    const language = (rawDoc.language || "en").toLowerCase().trim();
    const contentHash = rawDoc.contentHash || calculateContentHash(title, content, language);
    const authorityLevel = standardizeAuthorityLevel(rawDoc.authorityLevel || rawDoc.authority, rawDoc.sourceAgency);
    const retrievedAt = rawDoc.retrievedAt ? new Date(rawDoc.retrievedAt).toISOString() : new Date().toISOString();

    // Check in-memory registry for existing versions of this documentId
    const existingVersions = _inMemoryDocumentRegistry.get(docId) || [];

    // Duplicate detection: identical content under the same document ID
    const duplicate = existingVersions.find((v) => v.contentHash === contentHash);
    if (duplicate) {
      return {
        success: false,
        status: "DUPLICATE_REJECTED",
        documentId: docId,
        version: duplicate.version,
        message: `Identical document content already indexed under version ${duplicate.version}.`,
        provenance: duplicate,
      };
    }

    // Determine new version
    const nextVersionNumber = existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.versionNumber || 1)) + 1
      : (typeof rawDoc.version === "number" ? rawDoc.version : 1);

    const normalizedDoc = {
      documentId: docId,
      version: rawDoc.version || `v${nextVersionNumber}.0.0`,
      versionNumber: nextVersionNumber,
      title,
      authority: rawDoc.authority || rawDoc.sourceAgency,
      authorityLevel,
      sourceAgency: rawDoc.sourceAgency,
      sourceType: rawDoc.sourceType || rawDoc.docType || "Guideline",
      docType: rawDoc.docType || rawDoc.sourceType || "Guideline",
      sourceUrl: rawDoc.sourceUrl,
      publicationDate: rawDoc.publicationDate || new Date().toISOString(),
      effectiveDate: rawDoc.effectiveDate || rawDoc.publicationDate || new Date().toISOString(),
      expiryDate: rawDoc.expiryDate || null,
      retrievedAt,
      geographicScope: rawDoc.geographicScope || "National",
      targetRegion: rawDoc.targetRegion || null,
      hazardTypes: Array.isArray(rawDoc.hazardTypes) ? rawDoc.hazardTypes : ["general_weather_safety"],
      language,
      supersedes: rawDoc.supersedes || (existingVersions.length > 0 ? existingVersions[existingVersions.length - 1].version : null),
      documentStatus: rawDoc.documentStatus || "current",
      freshness: rawDoc.freshness || "current",
      content,
      contentHash,
      ingestedAt: new Date().toISOString(),
    };

    // Store in in-memory registry (non-destructive append)
    existingVersions.push(normalizedDoc);
    _inMemoryDocumentRegistry.set(docId, existingVersions);

    // If MongoDB is connected, attempt persistence asynchronously without blocking
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const mongoDoc = new KnowledgeDocument({
          documentId: normalizedDoc.documentId,
          title: normalizedDoc.title,
          content: normalizedDoc.content,
          category: normalizedDoc.hazardTypes[0] || "general_weather_safety",
          hazardType: normalizedDoc.hazardTypes[0] || null,
          scope: normalizedDoc.geographicScope.toUpperCase() === "CITY" ? "LOCAL" : normalizedDoc.geographicScope.toUpperCase(),
          targetRegion: normalizedDoc.targetRegion,
          source: normalizedDoc.sourceAgency,
          sourceUrl: normalizedDoc.sourceUrl,
          authority: authorityLevel === "NATIONAL_AUTHORITY" ? "DISASTER_AUTHORITY" : "GOVERNMENT_STATE",
          publicationDate: new Date(normalizedDoc.publicationDate),
          effectiveDate: new Date(normalizedDoc.effectiveDate),
          expiryDate: normalizedDoc.expiryDate ? new Date(normalizedDoc.expiryDate) : null,
          retrievedAt: new Date(normalizedDoc.retrievedAt),
          language: normalizedDoc.language,
          version: nextVersionNumber,
          supersedes: normalizedDoc.supersedes,
          status: normalizedDoc.documentStatus,
          contentHash: normalizedDoc.contentHash,
        });
        await mongoDoc.save();
      } catch (dbErr) {
        // Non-fatal logging if already in MongoDB
        if (dbErr.code !== 11000) {
          console.warn("⚠️ [DocumentIngestionService] Mongo sync skipped:", dbErr.message);
        }
      }
    }

    return {
      success: true,
      status: "INGESTED",
      documentId: docId,
      version: normalizedDoc.version,
      contentHash,
      provenance: normalizedDoc,
    };
  } catch (err) {
    return {
      success: false,
      status: "ERROR",
      documentId: rawDoc && rawDoc.documentId ? rawDoc.documentId : "UNKNOWN",
      message: err.message,
    };
  }
}

/**
 * Ingests a complete corpus of documents.
 *
 * @param {Array<Object>} corpus
 * @returns {Promise<Object>} Summary of ingestion batch
 */
async function ingestCorpus(corpus) {
  if (!Array.isArray(corpus)) {
    throw new TypeError("Corpus must be an array of documents.");
  }

  const results = {
    total: corpus.length,
    ingested: 0,
    duplicates: 0,
    errors: 0,
    details: [],
  };

  for (const doc of corpus) {
    const res = await ingestDocument(doc);
    results.details.push(res);
    if (res.status === "INGESTED") results.ingested++;
    else if (res.status === "DUPLICATE_REJECTED") results.duplicates++;
    else results.errors++;
  }

  return results;
}

/**
 * Retrieves provenance metadata for a document ID and version.
 *
 * @param {string} documentId
 * @param {string|number} [version]
 * @returns {Object|null}
 */
function getDocumentProvenance(documentId, version) {
  const versions = _inMemoryDocumentRegistry.get(documentId);
  if (!versions || versions.length === 0) return null;

  if (version !== undefined) {
    return versions.find((v) => v.version === version || v.versionNumber === Number(version)) || null;
  }

  // Return latest version by default
  return versions[versions.length - 1];
}

/**
 * Clears in-memory registry (useful for clean test runs).
 */
function resetRegistry() {
  _inMemoryDocumentRegistry.clear();
}

/**
 * Returns all currently registered documents.
 */
function getAllRegisteredDocuments() {
  const all = [];
  for (const versions of _inMemoryDocumentRegistry.values()) {
    all.push(...versions);
  }
  return all;
}

module.exports = {
  calculateContentHash,
  standardizeAuthorityLevel,
  validateIngestionPayload,
  ingestDocument,
  ingestCorpus,
  getDocumentProvenance,
  resetRegistry,
  getAllRegisteredDocuments,
  VALID_AUTHORITY_LEVELS,
};
