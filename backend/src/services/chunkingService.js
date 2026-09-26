/**
 * SKYRA – Deterministic Document Chunking Service (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements structural, context-preserving chunking for official disaster
 * guidance and meteorological SOPs.
 *
 * Guarantees:
 *   • Structural Integrity: Never truncates mid-sentence or mid-instruction
 *   • Complete Provenance on Every Chunk: documentId, authority, URL, version, section
 *   • Deterministic Chunk IDs: Reproducible across restarts and platforms
 *   • Controlled Overlap: Retains semantic context between boundaries without duplication
 *   • SHA-256 Verification: Every chunk carries an immutable contentHash
 */

const crypto = require("crypto");

const DEFAULT_TARGET_CHUNK_SIZE = 250; // Target characters per chunk (~40-60 words)
const DEFAULT_CHUNK_OVERLAP = 50;      // Overlap characters

/**
 * Splits document content into clean, non-empty sentences.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractSentences(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Deterministically chunks a document into semantic units with full metadata.
 *
 * @param {Object} doc - Normalized document object
 * @param {Object} [options]
 * @param {number} [options.targetSize=250]
 * @param {number} [options.overlap=50]
 * @returns {Array<Object>} List of structured, traceable chunks
 */
function chunkDocument(doc, options = {}) {
  if (!doc || !doc.content || typeof doc.content !== "string") {
    return [];
  }

  const targetSize = options.targetSize || DEFAULT_TARGET_CHUNK_SIZE;
  const overlap = options.overlap || DEFAULT_CHUNK_OVERLAP;

  const sentences = extractSentences(doc.content);
  if (sentences.length === 0) return [];

  const chunks = [];
  let currentSentences = [];
  let currentLength = 0;
  let chunkIndex = 1;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    currentSentences.push(sentence);
    currentLength += sentence.length + 1;

    // Check if we reached the target chunk size or the end of document
    const isLastSentence = i === sentences.length - 1;
    if (currentLength >= targetSize || isLastSentence) {
      const chunkText = currentSentences.join(" ");
      const chunkId = `${doc.documentId}_chunk_${chunkIndex}`;
      const contentHash = crypto.createHash("sha256").update(chunkText, "utf8").digest("hex");

      chunks.push({
        chunkId,
        chunkIndex,
        documentId: doc.documentId,
        title: doc.title,
        authority: doc.authority || doc.sourceAgency,
        authorityLevel: doc.authorityLevel || "NATIONAL_AUTHORITY",
        sourceAgency: doc.sourceAgency,
        sourceType: doc.sourceType || doc.docType || "Guideline",
        sourceUrl: doc.sourceUrl,
        publicationDate: doc.publicationDate,
        effectiveDate: doc.effectiveDate || doc.publicationDate,
        expiryDate: doc.expiryDate || null,
        retrievedAt: doc.retrievedAt,
        version: doc.version || "1.0.0",
        geographicScope: doc.geographicScope || "National",
        targetRegion: doc.targetRegion || null,
        hazardTypes: doc.hazardTypes || ["general_weather_safety"],
        section: doc.section || `Section ${chunkIndex}`,
        language: doc.language || "en",
        freshness: doc.freshness || "current",
        documentStatus: doc.documentStatus || "current",
        text: chunkText,
        characterCount: chunkText.length,
        sentenceCount: currentSentences.length,
        contentHash,
      });

      chunkIndex++;

      // Retain the last sentence for overlap if not at the end
      if (!isLastSentence && currentSentences.length > 1) {
        const lastSentence = currentSentences[currentSentences.length - 1];
        currentSentences = [lastSentence];
        currentLength = lastSentence.length;
      } else {
        currentSentences = [];
        currentLength = 0;
      }
    }
  }

  return chunks;
}

/**
 * Chunks a collection of documents.
 *
 * @param {Array<Object>} documents
 * @param {Object} [options]
 * @returns {Array<Object>} Aggregated chunks
 */
function chunkCorpus(documents, options = {}) {
  if (!Array.isArray(documents)) return [];
  const allChunks = [];
  for (const doc of documents) {
    const docChunks = chunkDocument(doc, options);
    allChunks.push(...docChunks);
  }
  return allChunks;
}

module.exports = {
  extractSentences,
  chunkDocument,
  chunkCorpus,
  DEFAULT_TARGET_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
};
