/**
 * SKYRA – RAG & Disaster Intelligence API Controller (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP endpoints exposing grounded disaster knowledge retrieval, evidence pack
 * inspection, and citation-backed question answering.
 *
 * Endpoints:
 *   POST /api/rag/ask      - End-to-end grounded RAG answer generation
 *   POST /api/rag/evidence - Retrieval and structured Evidence Pack inspection
 *
 * Guarantees:
 *   • Strict Input Validation (HTTP 400 on missing or invalid queries)
 *   • Safe Error Handling (HTTP 500 with sanitized diagnostics)
 *   • Zero Secret Leakage (Never exposes API keys or internal stack traces)
 *   • Machine-Readable Abstention State (Explicit abstained flag)
 */

const { getRagPipeline } = require("../services/langchainRAGService");
const { getRagRetrievalService } = require("../services/ragRetrievalService");
const { buildEvidencePack } = require("../services/evidencePackService");
const { evaluateAbstention } = require("../services/abstentionService");

/**
 * Handles RAG question answering requests.
 */
async function postRagAsk(req, res) {
  try {
    const { query, location, region, hazardType, currentRiskLevel, topK, similarityThreshold } = req.body || {};

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({
        error: "Missing required field: 'query' must be a non-empty string.",
        code: "ERR_MISSING_QUERY",
      });
    }

    const context = {
      location: location ? String(location).trim() : null,
      region: region ? String(region).trim() : null,
      hazardType: hazardType ? String(hazardType).trim() : null,
      currentRiskLevel: currentRiskLevel ? String(currentRiskLevel).trim() : null,
      topK: topK ? Number(topK) : undefined,
      similarityThreshold: similarityThreshold ? Number(similarityThreshold) : undefined,
    };

    const pipeline = getRagPipeline();
    const result = await pipeline.execute(query.trim(), context);

    return res.status(200).json(result);
  } catch (err) {
    console.error("⚠️ [RAG Controller] Error processing ask request:", err.message);
    return res.status(500).json({
      error: "Internal error processing disaster intelligence query.",
      code: "ERR_RAG_PROCESSING_FAILED",
      status: "ERROR",
    });
  }
}

/**
 * Handles Evidence Pack extraction requests without LLM synthesis.
 */
async function postRagEvidence(req, res) {
  try {
    const { query, location, region, hazardType, topK, similarityThreshold } = req.body || {};

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({
        error: "Missing required field: 'query' must be a non-empty string.",
        code: "ERR_MISSING_QUERY",
      });
    }

    const context = {
      location: location ? String(location).trim() : null,
      region: region ? String(region).trim() : null,
      hazardType: hazardType ? String(hazardType).trim() : null,
      topK: topK ? Number(topK) : undefined,
      similarityThreshold: similarityThreshold ? Number(similarityThreshold) : undefined,
    };

    const retrievalService = getRagRetrievalService();
    const retrievalResult = await retrievalService.retrieve(query.trim(), context);
    const evidencePack = buildEvidencePack(retrievalResult, context);
    const abstentionDecision = evaluateAbstention(evidencePack, context);

    return res.status(200).json({
      query: query.trim(),
      evidencePack,
      abstentionDecision,
      status: "SUCCESS",
    });
  } catch (err) {
    console.error("⚠️ [RAG Controller] Error processing evidence request:", err.message);
    return res.status(500).json({
      error: "Internal error retrieving evidence pack.",
      code: "ERR_EVIDENCE_RETRIEVAL_FAILED",
      status: "ERROR",
    });
  }
}

module.exports = {
  postRagAsk,
  postRagEvidence,
};
