/**
 * SKYRA – Authority & Freshness Scoring Engine (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes deterministic multi-dimensional retrieval scores:
 *   • similarityScore: Cosine similarity between query and chunk vectors [0.0, 1.0]
 *   • authorityScore: Deterministic hierarchical weight of the issuing agency [0.0, 1.0]
 *   • freshnessScore: Document age, lifecycle status, and expiry evaluation [0.0, 1.0]
 *   • finalRetrievalScore: Composite weighted ranking score
 *
 * Guarantees:
 *   • Zero Arbitrary Constants: Explicit weights and scoring formulas
 *   • Superseded Demotion: Expired/superseded documents receive severe freshness penalties
 *   • Hierarchy Enforced: National > State > Local > Trusted Institution
 */

const AUTHORITY_WEIGHTS = Object.freeze({
  NATIONAL_AUTHORITY: 1.0,   // NDMA, IMD, CWC, MoES, NDRF
  STATE_AUTHORITY: 0.85,     // TNSDMA, OSDMA, BSDMA, State Relief Commissioners
  LOCAL_AUTHORITY: 0.75,     // MCGM, Greater Chennai Corporation, District DM
  TRUSTED_INSTITUTION: 0.60, // IITs, specialized university research, WMO
});

const DOC_TYPE_LIFESPAN_YEARS = Object.freeze({
  "Contingency Plan": 2,           // Seasonal / annual operational plans
  "Standard Operating Procedure": 5, // Standing operational guidance
  "Guideline": 8,                   // High-level national frameworks
  "Technical Guideline": 6,        // Engineering / hydrology standards
});

/**
 * Computes authority score based on explicit government hierarchy.
 *
 * @param {string} authorityLevel
 * @returns {number} Score in [0.0, 1.0]
 */
function computeAuthorityScore(authorityLevel) {
  if (authorityLevel && AUTHORITY_WEIGHTS[authorityLevel]) {
    return AUTHORITY_WEIGHTS[authorityLevel];
  }
  return 0.50; // Unknown or unverified source baseline
}

/**
 * Computes freshness score based on document status, age, and document type.
 *
 * @param {Object} chunkOrDoc
 * @returns {{ freshnessScore: number, status: string, ageYears: number }}
 */
function computeFreshnessScore(chunkOrDoc) {
  if (!chunkOrDoc) {
    return { freshnessScore: 0.0, status: "unknown", ageYears: 0 };
  }

  const status = (chunkOrDoc.documentStatus || chunkOrDoc.freshness || "current").toLowerCase();

  // Expired or superseded documents are severely penalized
  if (status === "expired" || status === "superseded") {
    return { freshnessScore: 0.10, status, ageYears: 10 };
  }

  if (chunkOrDoc.expiryDate && new Date(chunkOrDoc.expiryDate) < new Date()) {
    return { freshnessScore: 0.10, status: "expired", ageYears: 10 };
  }

  // Calculate age from publicationDate or effectiveDate
  const pubDateStr = chunkOrDoc.effectiveDate || chunkOrDoc.publicationDate;
  if (!pubDateStr) {
    return { freshnessScore: 0.70, status: "undated", ageYears: 0 };
  }

  const pubDate = new Date(pubDateStr);
  const now = new Date();
  const ageMs = Math.max(now.getTime() - pubDate.getTime(), 0);
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

  const docType = chunkOrDoc.docType || chunkOrDoc.sourceType || "Guideline";
  const expectedLifespan = DOC_TYPE_LIFESPAN_YEARS[docType] || 5;

  let freshnessScore;
  if (ageYears <= 1.0) {
    freshnessScore = 1.0;
  } else if (ageYears <= expectedLifespan) {
    // Linear decay between 1.0 and 0.70 across expected lifespan
    const ratio = (ageYears - 1.0) / Math.max(expectedLifespan - 1.0, 1.0);
    freshnessScore = 1.0 - ratio * 0.30;
  } else {
    // Beyond expected lifespan: stale decay down to 0.40
    const overtime = ageYears - expectedLifespan;
    freshnessScore = Math.max(0.70 - overtime * 0.05, 0.40);
  }

  return {
    freshnessScore: Math.round(freshnessScore * 1000) / 1000,
    status: status === "current" ? "current" : "stale",
    ageYears: Math.round(ageYears * 10) / 10,
  };
}

/**
 * Calculates multi-factor composite retrieval score.
 * Formula: 0.50 * similarity + 0.30 * authority + 0.20 * freshness
 *
 * @param {number} similarityScore - Normalized cosine similarity in [0, 1]
 * @param {string} authorityLevel - e.g. "NATIONAL_AUTHORITY"
 * @param {Object} chunkMetadata - chunk containing dates and status
 * @returns {Object} Structured score breakdown
 */
function scoreRetrievalCandidate(similarityScore, authorityLevel, chunkMetadata) {
  const normSimilarity = Math.min(Math.max(Number(similarityScore) || 0, 0), 1.0);
  const authorityScore = computeAuthorityScore(authorityLevel);
  const freshnessInfo = computeFreshnessScore(chunkMetadata);

  // Weights sum to 1.0
  const W_SIM = 0.50;
  const W_AUTH = 0.30;
  const W_FRESH = 0.20;

  const finalRetrievalScore = (
    normSimilarity * W_SIM +
    authorityScore * W_AUTH +
    freshnessInfo.freshnessScore * W_FRESH
  );

  return {
    similarityScore: Math.round(normSimilarity * 10000) / 10000,
    authorityScore,
    freshnessScore: freshnessInfo.freshnessScore,
    finalRetrievalScore: Math.round(finalRetrievalScore * 10000) / 10000,
    freshnessDetails: freshnessInfo,
  };
}

module.exports = {
  computeAuthorityScore,
  computeFreshnessScore,
  scoreRetrievalCandidate,
  AUTHORITY_WEIGHTS,
  DOC_TYPE_LIFESPAN_YEARS,
};
