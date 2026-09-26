/**
 * SKYRA – LangChain-Compatible RAG Orchestration Pipeline (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements a composable, modular RAG execution chain aligning with LangChain
 * architectural patterns (Document, BaseRetriever, PromptTemplate, RunnableChain).
 *
 * Architecture Flow:
 *   Query + Context
 *        ↓
 *   1. Vector Retriever (FAISS / Pinecone with metadata filter)
 *        ↓
 *   2. Evidence Assembly & Multi-Factor Scoring
 *        ↓
 *   3. Conflict Detection & Reconciler
 *        ↓
 *   4. Safety Gating & Abstention Evaluator (Halts if evidence is weak or contradictory)
 *        ↓
 *   5. Grounded Prompt Assembly
 *        ↓
 *   6. LLM Generation (OpenAI / Deterministic Mock)
 *        ↓
 *   7. Verifiable Citations & Provenance Pack
 *
 * Guarantees:
 *   • Modular Isolation: Every step is independently testable
 *   • Strict Safety Gate: Bypasses LLM generation immediately upon abstention
 *   • Decoupled Risk: Completely isolated from ML risk calculation
 */

const { getRagRetrievalService } = require("./ragRetrievalService");
const { buildEvidencePack } = require("./evidencePackService");
const { evaluateAbstention } = require("./abstentionService");
const { getLlmService, SYSTEM_GROUNDING_PROMPT } = require("./llmService");

/**
 * Standard LangChain Document representation.
 */
class Document {
  constructor({ pageContent, metadata = {} }) {
    this.pageContent = String(pageContent || "");
    this.metadata = metadata;
  }
}

/**
 * LangChain-compatible BaseRetriever implementation for SKYRA.
 */
class SkyraRetriever {
  constructor(retrievalService = getRagRetrievalService()) {
    this.retrievalService = retrievalService;
  }

  async getRelevantDocuments(query, context = {}) {
    const result = await this.retrievalService.retrieve(query, context);
    return (result.candidates || []).map(
      (c) =>
        new Document({
          pageContent: c.text,
          metadata: {
            chunkId: c.chunkId,
            documentId: c.documentId,
            title: c.title,
            authority: c.authority,
            authorityLevel: c.authorityLevel,
            sourceAgency: c.sourceAgency,
            sourceUrl: c.sourceUrl,
            version: c.version,
            similarityScore: c.similarityScore,
            finalRetrievalScore: c.finalRetrievalScore,
          },
        })
    );
  }
}

/**
 * LangChain-compatible PromptTemplate for grounded disaster answering.
 */
class PromptTemplate {
  constructor({ template, inputVariables = [] }) {
    this.template = template;
    this.inputVariables = inputVariables;
  }

  format(values = {}) {
    let result = this.template;
    for (const variable of this.inputVariables) {
      const val = values[variable] !== undefined ? String(values[variable]) : "";
      result = result.replace(new RegExp(`\\{${variable}\\}`, "g"), val);
    }
    return result;
  }
}

/**
 * LangChain RunnableSequence chaining Retriever -> Evidence -> Safety -> Generator.
 */
class RunnableSequence {
  constructor(steps = []) {
    this.steps = steps;
  }

  async invoke(input) {
    let current = input;
    for (const step of this.steps) {
      if (typeof step === "function") {
        current = await step(current);
      } else if (step && typeof step.invoke === "function") {
        current = await step.invoke(current);
      }
    }
    return current;
  }
}

class LangChainRAGPipeline {
  constructor(options = {}) {
    this.retrievalService = options.retrievalService || getRagRetrievalService();
    this.llmService = options.llmService || getLlmService();
    this.retriever = new SkyraRetriever(this.retrievalService);
    this.promptTemplate = new PromptTemplate({
      template: `${SYSTEM_GROUNDING_PROMPT}\n\nQUESTION: {query}\n\nEVIDENCE:\n{context}\n\nADVISORY:`,
      inputVariables: ["query", "context"],
    });
  }

  /**
   * Executes the full RAG pipeline end-to-end.
   *
   * @param {string} query - Natural language query
   * @param {Object} [context] - Situational context (location, hazardType, riskLevel)
   * @returns {Promise<Object>} Unified RAG intelligence response
   */
  async execute(query, context = {}) {
    const startTime = Date.now();

    // Step 1: Vector Retrieval & Multi-factor Scoring
    const retrievalResult = await this.retrievalService.retrieve(query, context);

    // Step 2: Assemble Structured Evidence Pack
    const evidencePack = buildEvidencePack(retrievalResult, context);

    // Step 3: Safety Gating & Abstention Check
    const abstentionDecision = evaluateAbstention(evidencePack, context);

    if (abstentionDecision.abstained) {
      return {
        query,
        status: "ABSTAINED",
        abstained: true,
        reason: abstentionDecision.reason,
        answer: abstentionDecision.message,
        detail: abstentionDecision.detail,
        emergencyContacts: abstentionDecision.emergencyContacts,
        citations: abstentionDecision.citations,
        evidencePack: {
          sufficiency: evidencePack.evidenceSufficiency,
          citationsCount: 0,
          candidateCount: 0,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Step 4: Grounded LLM Generation
    const llmResult = await this.llmService.generateAnswer(query, evidencePack, context);

    return {
      query,
      status: "SUCCESS",
      abstained: false,
      answer: llmResult.answer,
      citations: llmResult.citations,
      evidencePack: {
        sufficiency: evidencePack.evidenceSufficiency,
        citationsCount: evidencePack.citations.length,
        candidateCount: evidencePack.groundedChunks.length,
        conflictStatus: evidencePack.conflictStatus,
      },
      metadata: {
        provider: llmResult.provider,
        model: llmResult.model,
        isMock: llmResult.isMock,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

// Singleton instance
let _ragPipelineInstance = null;

function getRagPipeline(options) {
  if (!_ragPipelineInstance || options) {
    _ragPipelineInstance = new LangChainRAGPipeline(options);
  }
  return _ragPipelineInstance;
}

module.exports = {
  LangChainRAGPipeline,
  getRagPipeline,
  Document,
  SkyraRetriever,
  PromptTemplate,
  RunnableSequence,
};
