/**
 * SKYRA – RAG Multi-Factor Retrieval Service (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates dense vector similarity search, metadata filtering, multi-factor
 * scoring (similarity + authority + freshness), deduplication, and conflict
 * detection to assemble the authoritative knowledge candidates for a query.
 *
 * Guarantees:
 *   • Gated Thresholding: Rejects irrelevant queries below similarity threshold
 *   • Multi-Factor Ranking: Authority and freshness break ties and prevent stale dominance
 *   • Deduplication: Prevents repeated identical paragraphs in LLM context
 *   • Full Provenance: Every chunk includes issuing agency, URL, version, and contentHash
 *   • Conflict Transparency: Flags superseded or competing guidance
 */

const { getVectorStore } = require("../knowledge/vectorStore");
const { getEmbeddingService } = require("./embeddingService");
const { scoreRetrievalCandidate } = require("./authorityFreshnessScorer");
const { analyzeConflicts } = require("./conflictDetectionService");

const DEFAULT_SIMILARITY_THRESHOLD = 0.15; // Minimum similarity to consider candidate relevant
const DEFAULT_TOP_K = 4;

class RagRetrievalService {
  constructor(options = {}) {
    this.vectorStore = options.vectorStore || getVectorStore();
    this.embeddingService = options.embeddingService || getEmbeddingService();
    this.similarityThreshold = options.similarityThreshold || DEFAULT_SIMILARITY_THRESHOLD;
  }

  /**
   * Retrieves, scores, ranks, and validates candidate chunks for a disaster query.
   *
   * @param {string} queryText - User question or situational query
   * @param {Object} [context] - Contextual filters and situational parameters
   * @param {string} [context.region] - e.g. "Chennai", "Mumbai"
   * @param {string} [context.hazardType] - e.g. "flood", "cyclone", "heat"
   * @param {string} [context.scope] - e.g. "National", "State", "City"
   * @param {number} [context.topK=4]
   * @param {number} [context.similarityThreshold]
   * @returns {Promise<Object>} Structured retrieval result
   */
  async retrieve(queryText, context = {}) {
    if (!queryText || typeof queryText !== "string" || !queryText.trim()) {
      return {
        query: "",
        totalCandidatesFound: 0,
        candidates: [],
        conflictAnalysis: { hasConflict: false, conflicts: [] },
        thresholdApplied: this.similarityThreshold,
        status: "EMPTY_QUERY",
      };
    }

    const cleanQuery = queryText.trim();
    const threshold = context.similarityThreshold !== undefined
      ? Number(context.similarityThreshold)
      : this.similarityThreshold;
    const topK = Math.max(Number(context.topK || DEFAULT_TOP_K), 1);

    // 1. Generate query embedding
    const queryEmb = await this.embeddingService.embedText(cleanQuery);

    // 2. Query vector store
    // Pass optional region/scope/agency filters
    const searchOptions = {
      topK: topK * 3, // Over-fetch to allow post-filtering & deduplication
      region: context.region,
      scope: context.scope,
    };

    const rawMatches = await this.vectorStore.search(queryEmb.vector, searchOptions);

    // 3. Multi-factor scoring and threshold gating
    const scoredCandidates = [];
    const seenHashes = new Set();

    for (const match of rawMatches) {
      // Gate by minimum similarity threshold
      if (match.score < threshold) {
        continue;
      }

      // Deduplicate identical text chunks
      if (match.contentHash && seenHashes.has(match.contentHash)) {
        continue;
      }
      if (match.contentHash) {
        seenHashes.add(match.contentHash);
      }

      // Multi-factor scoring
      const scoreBreakdown = scoreRetrievalCandidate(
        match.score,
        match.authorityLevel,
        match
      );

      scoredCandidates.push({
        chunkId: match.chunkId,
        documentId: match.documentId,
        title: match.title,
        authority: match.authority || match.sourceAgency,
        authorityLevel: match.authorityLevel || "NATIONAL_AUTHORITY",
        sourceAgency: match.sourceAgency,
        sourceType: match.sourceType || match.docType || "Guideline",
        sourceUrl: match.sourceUrl,
        publicationDate: match.publicationDate,
        effectiveDate: match.effectiveDate,
        version: match.version,
        supersedes: match.supersedes || null,
        geographicScope: match.geographicScope,
        targetRegion: match.targetRegion,
        hazardTypes: match.hazardTypes || [],
        freshness: match.freshness,
        documentStatus: match.documentStatus,
        text: match.text,
        contentHash: match.contentHash,
        ...scoreBreakdown,
      });
    }

    // 4. Sort descending by composite finalRetrievalScore
    scoredCandidates.sort((a, b) => b.finalRetrievalScore - a.finalRetrievalScore);

    // 5. Detect and resolve conflicts across top candidates
    const preTopK = scoredCandidates.slice(0, topK * 2);
    const conflictAnalysis = analyzeConflicts(preTopK, context);

    // Filter out superseded documents and slice to final topK
    const finalCandidates = conflictAnalysis.filteredChunks.slice(0, topK);

    return {
      query: cleanQuery,
      totalCandidatesFound: finalCandidates.length,
      candidates: finalCandidates,
      conflictAnalysis: {
        hasConflict: conflictAnalysis.hasConflict,
        conflictCount: conflictAnalysis.conflictCount,
        conflicts: conflictAnalysis.conflicts,
        auditNotice: conflictAnalysis.auditNotice,
      },
      thresholdApplied: threshold,
      status: finalCandidates.length > 0 ? "SUCCESS" : "NO_RELEVANT_EVIDENCE",
    };
  }
}

// Singleton instance
let _retrievalServiceInstance = null;

function getRagRetrievalService(options) {
  if (!_retrievalServiceInstance || options) {
    _retrievalServiceInstance = new RagRetrievalService(options);
  }
  return _retrievalServiceInstance;
}

module.exports = {
  RagRetrievalService,
  getRagRetrievalService,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_TOP_K,
};
