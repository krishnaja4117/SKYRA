# SKYRA — Phase 8: RAG + Intelligence Infrastructure Audit

**Document Status:** Complete & Verified Baseline  
**Phase Target:** Phase 8 — RAG + Intelligence (Prompt 1/2)  
**Corpus / Problem Statement:** Smart India Hackathon 2026, Problem Statement 26068  

---

## 1. Executive Summary

This audit assesses the existing Phase 4 knowledge base, vector search adapters, persistence models, and data contracts to establish an authoritative baseline for Phase 8. Phase 8 builds an end-to-end, trustworthy **Retrieval-Augmented Generation (RAG)** pipeline answering user queries with verified disaster management protocols while strictly avoiding hallucinations, fabricated citations, or ungrounded risk assessments.

---

## 2. Inventory of Existing Phase 4 Assets

### 2.1 Mongoose Persistence Model (`backend/src/models/KnowledgeDocument.js`)
* **Status:** Complete production foundation.
* **Fields:** `documentId`, `title`, `content`, `summary`, `category`, `hazardType`, `scope` (`GLOBAL`, `NATIONAL`, `REGIONAL`, `STATE`, `DISTRICT`, `LOCAL`), `targetRegion`, `coordinates` (GeoJSON Point), `source`, `sourceUrl`, `authority` (`GOVERNMENT_NATIONAL`, `GOVERNMENT_STATE`, `METEOROLOGICAL_AGENCY`, `DISASTER_AUTHORITY`, `ACADEMIC`, `VERIFIED_NGO`, `INTERNAL_OPERATIONAL`), `publicationDate`, `effectiveDate`, `expiryDate`, `retrievedAt`, `language` (default: `"en"`), `version` (integer), `supersedes`, `status` (`current`, `expired`, `stale`, `archived`, `pending_review`), `tags`, and `contentHash` (SHA-256).
* **Integrity Features:** Pre-validation hook auto-computes SHA-256 `contentHash` (`title::content::language`) and updates expired statuses. Compound unique index on `{ documentId: 1, version: 1 }`.

### 2.2 Production Knowledge Corpus (`backend/src/knowledge/productionCorpus.js`)
* **Status:** Initial 7 authoritative disaster SOPs from official Indian agencies:
  1. `NDMA-SOP-FLOOD-2020` (NDMA Urban Flooding Guidelines)
  2. `IMD-SOP-CYCLONE-2021` (IMD Cyclone Warning 4-Stage Protocols)
  3. `TNSDMA-SOP-CHENNAI-2023` (Tamil Nadu SDMA Chennai Adyar/Cooum Basin Protocols)
  4. `MCGM-SOP-MUMBAI-2023` (MCGM Mumbai Monsoon & High Tide Operations)
  5. `NDMA-HEATWAVE-2019` (NDMA National Heat Wave Guidelines)
  6. `NDMA-LANDSLIDE-2019` (NDMA Landslide Risk Management Guidelines)
  7. `CWC-FLOOD-FORECAST-2021` (Central Water Commission Inundation & Dam Discharge Guidelines)
* **Gap:** Needs expansion to complete national/regional coverage for heatwaves, lightning, flash floods, and conflicting multi-jurisdiction guidance test vectors.

### 2.3 Vector Store Abstraction (`backend/src/knowledge/vectorStore.js`)
* **Status:** Working deterministic local vector engine with pluggable adapters.
* **Embedding Implementation:** Generates 128-dimensional dense unit vectors via dual MD5/SHA-256 word hashing with L2 Euclidean normalization. 100% offline and deterministic.
* **Chunking:** Basic sentence-level splitting (`(?<=[.!?])\s+`).
* **Adapters:** FAISS local adapter (`faissAdapter.js`) + Pinecone cloud adapter (`pineconeAdapter.js`).

### 2.4 FAISS Local Vector Adapter (`backend/src/knowledge/adapters/faissAdapter.js`)
* **Status:** Complete in-memory Cosine Similarity (IndexFlatIP) implementation.
* **Features:** Metadata filtering by `scope`, `region`, `freshness`, and `agency`. Disk serialization to `data/faiss_index/index.json`.

### 2.5 Pinecone Cloud Vector Adapter (`backend/src/knowledge/adapters/pineconeAdapter.js`)
* **Status:** Complete environment-backed cloud adapter (`PINECONE_API_KEY`, `PINECONE_INDEX_NAME`).
* **Fallback Behavior:** Gracefully reports `status: "BLOCKED"` and diverts to local FAISS when cloud credentials are unconfigured.

### 2.6 Knowledge Service (`backend/src/services/knowledgeService.js`)
* **Status:** Exposes `saveKnowledgeDocument`, `queryKnowledgeDocuments`, `checkFreshness`, `queryVectorKnowledge`, and `getVectorStoreStatus`.

---

## 3. Gap Analysis: What Phase 8 Must Implement

| Architectural Layer | Existing Phase 4 Capability | Phase 8 Required Capability | Action Required |
|---|---|---|---|
| **Knowledge Corpus** | 7 core guidelines | Comprehensive Indian hazard corpus (NDMA, IMD, CWC, SDMA) with explicit authority hierarchy | Extend corpus with structured authority metadata |
| **Ingestion Engine** | Basic MongoDB save with duplicate check | Version tracking, change detection, content-hash verification, and structured provenance | Build dedicated ingestion pipeline |
| **Document Chunking** | Simple sentence splitting | Context-preserving semantic chunker with deterministic chunk IDs and source tracing | Implement `chunkingService.js` |
| **Embeddings** | 128-dim token-hash embedding only | Dual-mode embedding abstraction (Production cloud + Local deterministic fallback) | Implement `embeddingService.js` |
| **Vector Search** | Basic Top-K cosine similarity | Multi-factor retrieval with threshold gating, scope filtering, and deduplication | Enhance retrieval service |
| **Scoring Engine** | Similarity score only | Multi-dimensional scoring: similarity, authority, and freshness scores combined | Implement `authorityFreshnessScorer.js` |
| **Conflict Handling** | None (silent co-existence) | Multi-document conflict detection, supersession checks, and unresolved conflict reporting | Implement `conflictDetectionService.js` |
| **RAG Orchestration** | None | LangChain-compatible modular pipeline (retrieval → evidence → conflict → LLM) | Implement `langchainRAGService.js` |
| **Evidence Pack** | None | Immutable evidence object carrying retrieved chunks, citations, and metadata | Implement `evidencePackService.js` |
| **Abstention Logic** | None (empty array return) | Explicit safety abstention when evidence is insufficient, contradictory, or below threshold | Implement `abstentionService.js` |
| **LLM Provider** | None | Server-side LLM provider (OpenAI compatible + Deterministic test mock) | Implement `llmService.js` |
| **API Endpoints** | None | REST endpoints `/api/rag/ask` and `/api/rag/evidence` with audit logs | Implement `ragController.js` and mount routes |

---

## 4. Architectural Invariants & Safety Guarantees

1. **Strict Non-Hallucination:** The LLM is restricted to answering solely from the retrieved **Evidence Pack**.
2. **Deterministic Fallbacks:** The platform operates 100% offline out-of-the-box using the local FAISS index and deterministic embeddings if cloud API keys are absent.
3. **No Risk Overrides:** The LLM must NEVER compute or override the Phase 5/7 ML risk level or calibrated risk score.
4. **No Location Biases:** Retrieval filters strictly by requested coordinates and target regions without hardcoded city defaults.
5. **Zero Secret Exposure:** All external API keys (`OPENAI_API_KEY`, `PINECONE_API_KEY`) remain strictly server-side.
