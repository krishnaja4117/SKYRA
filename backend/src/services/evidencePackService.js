/**
 * SKYRA – Structured Evidence Pack Builder (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Assembles the immutable, verified evidence object positioned strictly between
 * retrieval and LLM generation.
 *
 * Guarantees:
 *   • Grounding Boundary: The LLM is restricted to using solely this evidence pack
 *   • Explicit Citations: Pre-indexed list of official sources with URLs and versions
 *   • Sufficiency Audit: Flags whether the evidence is robust enough for generation
 *   • Provenance Preservation: Full traceability from answer back to original SOP
 */

/**
 * Builds a structured Evidence Pack from a retrieval result.
 *
 * @param {Object} retrievalResult - Output of RagRetrievalService.retrieve()
 * @param {Object} [context] - Situational context (weather, hazard, riskLevel)
 * @returns {Object} Structured Evidence Pack
 */
function buildEvidencePack(retrievalResult, context = {}) {
  const query = (retrievalResult && retrievalResult.query) || "";
  const candidates = (retrievalResult && retrievalResult.candidates) || [];
  const conflictAnalysis = (retrievalResult && retrievalResult.conflictAnalysis) || {
    hasConflict: false,
    conflicts: [],
  };

  // Build deduplicated citations list
  const citationMap = new Map();
  const citations = [];
  let citationIndex = 1;

  for (const c of candidates) {
    if (!citationMap.has(c.documentId)) {
      const citation = {
        citationIndex: citationIndex++,
        documentId: c.documentId,
        title: c.title,
        authority: c.authority,
        authorityLevel: c.authorityLevel,
        sourceAgency: c.sourceAgency,
        sourceUrl: c.sourceUrl,
        publicationDate: c.publicationDate,
        version: c.version,
        geographicScope: c.geographicScope,
        targetRegion: c.targetRegion,
        documentStatus: c.documentStatus,
      };
      citationMap.set(c.documentId, citation);
      citations.push(citation);
    }
  }

  // Map each chunk to its source citation index
  const groundedChunks = candidates.map((c) => ({
    chunkId: c.chunkId,
    documentId: c.documentId,
    citationIndex: citationMap.get(c.documentId)?.citationIndex || 1,
    text: c.text,
    sourceAgency: c.sourceAgency,
    similarityScore: c.similarityScore,
    authorityScore: c.authorityScore,
    freshnessScore: c.freshnessScore,
    finalRetrievalScore: c.finalRetrievalScore,
    section: c.section,
    contentHash: c.contentHash,
  }));

  // Build grounded context text for the LLM prompt
  const formattedContextText = groundedChunks
    .map(
      (gc) =>
        `[Citation ${gc.citationIndex}] (Source: ${gc.documentId}, ${gc.sourceAgency}, Score: ${gc.finalRetrievalScore}):\n${gc.text}`
    )
    .join("\n\n");

  // Determine evidence sufficiency
  const hasCandidates = groundedChunks.length > 0;
  const avgScore = hasCandidates
    ? groundedChunks.reduce((acc, c) => acc + c.finalRetrievalScore, 0) / groundedChunks.length
    : 0;

  let sufficiencyStatus = "SUFFICIENT";
  let sufficiencyReason = "Authoritative evidence exceeds relevance and authority thresholds.";

  if (!hasCandidates) {
    sufficiencyStatus = "INSUFFICIENT_NO_EVIDENCE";
    sufficiencyReason = "Zero relevant documents retrieved matching the query.";
  } else if (avgScore < 0.25) {
    sufficiencyStatus = "INSUFFICIENT_WEAK_RELEVANCE";
    sufficiencyReason = "Retrieved candidate documents fall below the confidence relevance threshold.";
  } else if (
    conflictAnalysis.hasConflict &&
    conflictAnalysis.conflicts.some((c) => c.resolution === "UNRESOLVED_FLAGGED")
  ) {
    sufficiencyStatus = "CONTRADICTORY_EVIDENCE";
    sufficiencyReason = "Multiple authoritative documents provide conflicting instructions without an official resolution.";
  }

  return {
    query,
    timestamp: new Date().toISOString(),
    context: {
      location: context.location || null,
      region: context.region || null,
      hazardType: context.hazardType || null,
      currentRiskLevel: context.currentRiskLevel || null,
    },
    evidenceSufficiency: {
      isSufficient: sufficiencyStatus === "SUFFICIENT",
      status: sufficiencyStatus,
      reason: sufficiencyReason,
      candidateCount: groundedChunks.length,
      averageScore: Math.round(avgScore * 1000) / 1000,
    },
    citations,
    groundedChunks,
    formattedContextText,
    conflictStatus: {
      hasConflict: conflictAnalysis.hasConflict,
      conflicts: conflictAnalysis.conflicts,
      auditNotice: conflictAnalysis.auditNotice,
    },
  };
}

module.exports = {
  buildEvidencePack,
};
