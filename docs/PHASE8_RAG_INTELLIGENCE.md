# SKYRA — Phase 8: RAG + Intelligence Architecture Specification

**Status:** Implementation Prompt 1/2 Complete  
**Problem Statement:** Smart India Hackathon 2026, Problem Statement 26068  
**Scope:** Retrieval-Augmented Generation, Multi-Factor Scoring, Conflict Handling, Epistemic Abstention, and Official Disaster Provenance  

---

## 1. Architectural Overview

The SKYRA Phase 8 RAG subsystem provides grounded, citation-backed natural language disaster intelligence. It operates strictly on verified Indian disaster guidelines (NDMA, IMD, CWC, SDMAs).

```
User Situational Query + Spatial Context
                  ↓
          [LangChain RAG Pipeline]
                  ↓
       [Embedding Service Provider]
       (OpenAI / Deterministic Local Unit Hashing)
                  ↓
          [Vector Retrieval]
       (FAISS Local Index / Pinecone Cloud Adapter)
                  ↓
     [Authority & Freshness Scorer]
   (0.50 Sim + 0.30 Authority + 0.20 Freshness)
                  ↓
      [Conflict Detection & Reconciler]
  (Supersession, Geographic Specificity, Audit Flags)
                  ↓
         [Structured Evidence Pack]
                  ↓
      [Safety Gating & Abstention Engine]
                  ↓
         ┌────────┴────────┐
   [Abstain]          [Sufficient]
   (Declines safely)       ↓
                   [LLM Generation Provider]
               (OpenAI gpt-4o-mini / Grounded Synthesizer)
                           ↓
             [Citations + Final Advisory Output]
```

---

## 2. Knowledge Corpus & Official Provenance

The production corpus ([`backend/src/knowledge/productionCorpus.js`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/backend/src/knowledge/productionCorpus.js)) consists of verified Indian governmental disaster management documents:
- **NDMA National Guidelines on Management of Urban Flooding (2020)**
- **IMD Standard Operating Procedure for Cyclone Warning Services (2021)**
- **Tamil Nadu SDMA Coastal Flooding & Cyclone SOP for Greater Chennai (2023)**
- **MCGM Greater Mumbai Monsoon Disaster Contingency Plan (2023)**
- **NDMA National Guidelines for Preparation of Action Plan for Prevention of Heat Wave (2019)**
- **NDMA National Guidelines for Landslide Risk Management (2019)**
- **CWC Guidelines on Flood Forecasting and Reservoir Regulation (2021)**
- **NDMA Guidelines on Lightning and Thunderstorm Risk (2021)**
- **OSDMA Multi-Hazard Shelter & Evacuation SOP (2023)**
- **NDMA Updated National Heatwave Action Plan (2024 Edition)** — *explicitly supersedes 2019 baseline*
- **IMD 4-Stage Warning Color Code Historical Guideline (2015 Archive)** — *superseded/expired baseline*

### Cryptographic Provenance Schema
Every document and chunk contains:
- `documentId`: Unique official identifier
- `authorityLevel`: Deterministic tier (`NATIONAL_AUTHORITY`, `STATE_AUTHORITY`, `LOCAL_AUTHORITY`, `TRUSTED_INSTITUTION`)
- `sourceAgency`: Official agency name (e.g. NDMA, IMD, CWC, TNSDMA, MCGM)
- `sourceUrl`: Authoritative HTTPS URL
- `publicationDate` & `effectiveDate`: ISO-8601 timestamps
- `version` & `supersedes`: Explicit version lineage
- `contentHash`: SHA-256 cryptographic digest of normalized content

---

## 3. Core Modules & Pipeline Components

### 3.1 Document Ingestion & Lineage (`backend/src/services/documentIngestionService.js`)
- Validates required fields and content adequacy.
- Detects exact duplicates via SHA-256 content hashes (`DUPLICATE_REJECTED`).
- Manages version increments and parent-child supersession lineage without destructive overwrites.
- In-memory registry provides 100% testable execution when MongoDB is offline.

### 3.2 Semantic Chunking (`backend/src/services/chunkingService.js`)
- Sentence boundary splitting (`(?<=[.!?])\s+`) with structural integrity.
- Target chunk size: ~250 characters with ~50-character contextual overlap.
- Deterministic chunk IDs: `${documentId}_chunk_${index}`.
- Chunks retain full parent document metadata and section tags.

### 3.3 Embeddings (`backend/src/services/embeddingService.js`)
- Dual-provider abstraction:
  - **Cloud:** OpenAI `text-embedding-3-small` (1536 dimensions) with batching.
  - **Local/Test:** Deterministic dense unit hashing (128 dimensions) via MD5 + SHA-256 word distribution and L2 Euclidean normalization.
- Strict dimension validation protects vector stores from silent dimension mismatches.

### 3.4 Vector Search (`backend/src/knowledge/vectorStore.js`)
- **Primary Local Engine:** FAISS local vector adapter ([`backend/src/knowledge/adapters/faissAdapter.js`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/backend/src/knowledge/adapters/faissAdapter.js)) running Cosine Similarity (IndexFlatIP) with disk persistence.
- **Cloud Engine:** Pinecone adapter ([`backend/src/knowledge/adapters/pineconeAdapter.js`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/backend/src/knowledge/adapters/pineconeAdapter.js)) that reports `status: "BLOCKED"` and safely falls back to local FAISS when API keys are absent.
- **Metadata Filtering:** Filtering across `hazardType`, `geographicScope`, `targetRegion`, and `freshness`.

### 3.5 Multi-Factor Scoring (`backend/src/services/authorityFreshnessScorer.js`)
Computes an explicit composite score for every retrieved candidate:
$$\text{FinalRetrievalScore} = 0.50 \cdot \text{Similarity} + 0.30 \cdot \text{Authority} + 0.20 \cdot \text{Freshness}$$
- **Authority Weights:** National (1.0) > State (0.85) > Local (0.75) > Trusted (0.60).
- **Freshness Score:** Evaluates age against document-type lifespan (Contingency Plans: 2 yrs, SOPs: 5 yrs, Guidelines: 8 yrs). Superseded or expired documents are penalized to 0.10.

### 3.6 Conflict Handling (`backend/src/services/conflictDetectionService.js`)
- **Explicit Supersession:** When a retrieved document explicitly supersedes another (e.g. `NDMA-HEAT-ACTION-2024` vs `NDMA-HEATWAVE-2019`), the older document is demoted and excluded from final context.
- **Geographic Specificity:** When querying for a specific municipality/state (e.g. Chennai), the State/City operational contingency plan takes precedence over national baselines.
- **Unresolved Contradictions:** Explicit contradictions between coequal authorities are flagged with `UNRESOLVED_FLAGGED` and reported transparently rather than silently merged.

### 3.7 Evidence Pack (`backend/src/services/evidencePackService.js`)
An immutable structured data structure:
```json
{
  "query": "What are the evacuation guidelines during a cyclone alert?",
  "citations": [
    {
      "citationIndex": 1,
      "documentId": "IMD-SOP-CYCLONE-2021",
      "authority": "India Meteorological Department",
      "sourceAgency": "IMD",
      "sourceUrl": "https://mausam.imd.gov.in/sop-cyclone",
      "version": "2.0.0"
    }
  ],
  "groundedChunks": [...],
  "formattedContextText": "[Citation 1] (Source: IMD-SOP-CYCLONE-2021)...",
  "evidenceSufficiency": {
    "isSufficient": true,
    "status": "SUFFICIENT",
    "averageScore": 0.842
  }
}
```

### 3.8 Epistemic Abstention (`backend/src/services/abstentionService.js`)
Mandatory safety gating: if evidence is insufficient, irrelevant, or conflicting, generation halts immediately with:
> *"SKYRA could not find sufficient authoritative guidance for this specific situation."*
Provides official escalation numbers: National Emergency (112), Disaster Helpline (1078).

### 3.9 Grounded LLM Generation (`backend/src/services/llmService.js`)
- Connects to OpenAI chat completion when configured (`temperature: 0.0`).
- Deterministic offline mock synthesizer operates without cloud dependencies, directly citing `[Citation X]`.
- System prompt strictly prohibits calculating or altering ML risk scores.

---

## 4. API Endpoints

### `POST /api/rag/ask`
Full end-to-end RAG pipeline execution.
- **Payload:** `{ "query": string, "location"?: string, "region"?: string, "hazardType"?: string, "topK"?: number }`
- **Response:** `{ "status": "SUCCESS"|"ABSTAINED", "abstained": boolean, "answer": string, "citations": Array, "evidencePack": Object, "metadata": Object }`

### `POST /api/rag/evidence`
Direct Evidence Pack extraction without LLM generation for auditability.
- **Payload:** `{ "query": string, "region"?: string, "hazardType"?: string }`
- **Response:** `{ "status": "SUCCESS", "evidencePack": Object, "abstentionDecision": Object }`

---

## 5. Security & Isolation Guarantees

1. **Server-Side API Keys:** `OPENAI_API_KEY` and `PINECONE_API_KEY` are read exclusively in backend services and never exposed to the frontend or included in JSON responses.
2. **Decoupled ML Risk Engine:** The RAG layer does NOT calculate or modify `riskLevel` or `riskScore`. Risk assessment remains exclusively owned by the Phase 5/7 calibrated Random Forest model and Phase 6 impact assessment service.
3. **Zero Bhubaneswar Fallback:** Queries without geographic filters remain national; regional queries match requested locations without silent default biases.

---

## 6. Known Limitations (Prompt 1/2 Status)

1. **Semantic Embeddings in Local Mode:** In offline local mode, similarity matching uses deterministic token-distribution hashing (128-dim unit vectors), which accurately matches vocabulary and hazard keywords but lacks deep contextual nuance of 1536-dim cloud embeddings.
2. **External LLM Latency:** When connected to cloud OpenAI endpoints, response times depend on network round-trip latency (bounded by the configurable 8-second timeout).
