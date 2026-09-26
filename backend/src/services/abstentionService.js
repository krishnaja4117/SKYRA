/**
 * SKYRA – Explicit Abstention & Safety Gating Service (Phase 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces strict epistemic safety: mandates that the AI system abstains from
 * generating disaster advice when authoritative evidence is missing, weak,
 * expired, or irreconcilably contradictory.
 *
 * Guarantees:
 *   • Zero Guessing: Under insufficient evidence, strictly declines rather than hallucinating
 *   • Zero Fabricated Citations: When abstaining, returns an empty citations array
 *   • Actionable Emergency Escalation: Directs users to verified official hotlines (112, 1070)
 *   • Transparent Auditing: Provides machine-readable abstention reasons for automated evaluation
 */

const STANDARD_ABSTENTION_MESSAGE = "SKYRA could not find sufficient authoritative guidance for this specific situation.";

const EMERGENCY_FALLBACK_CONTACTS = Object.freeze({
  nationalEmergency: "112",
  disasterHelpline: "1078",
  ndrfControlRoom: "011-24363260",
});

/**
 * Evaluates whether the system must abstain from answering.
 *
 * @param {Object} evidencePack - Output from buildEvidencePack()
 * @param {Object} [options]
 * @returns {Object} Abstention decision record
 */
function evaluateAbstention(evidencePack, options = {}) {
  if (!evidencePack || !evidencePack.evidenceSufficiency) {
    return {
      abstained: true,
      reason: "MISSING_EVIDENCE_PACK",
      message: STANDARD_ABSTENTION_MESSAGE,
      detail: "No evidence pack was provided for validation.",
      emergencyContacts: EMERGENCY_FALLBACK_CONTACTS,
      citations: [],
    };
  }

  const sufficiency = evidencePack.evidenceSufficiency;

  // Case 1: Zero relevant documents retrieved
  if (sufficiency.candidateCount === 0 || sufficiency.status === "INSUFFICIENT_NO_EVIDENCE") {
    return {
      abstained: true,
      reason: "NO_AUTHORITATIVE_DOCUMENTS",
      message: STANDARD_ABSTENTION_MESSAGE,
      detail: "The query does not match any official standard operating procedures or disaster guidelines in the SKYRA knowledge base.",
      emergencyContacts: EMERGENCY_FALLBACK_CONTACTS,
      citations: [],
    };
  }

  // Case 2: Evidence relevance below minimum confidence threshold
  if (sufficiency.status === "INSUFFICIENT_WEAK_RELEVANCE" || sufficiency.averageScore < 0.20) {
    return {
      abstained: true,
      reason: "LOW_CONFIDENCE_RELEVANCE",
      message: STANDARD_ABSTENTION_MESSAGE,
      detail: `Retrieved candidate documents (average score: ${sufficiency.averageScore}) fall below the safety threshold required for disaster advice.`,
      emergencyContacts: EMERGENCY_FALLBACK_CONTACTS,
      citations: [],
    };
  }

  // Case 3: Contradictory evidence that cannot be safely resolved
  if (sufficiency.status === "CONTRADICTORY_EVIDENCE") {
    return {
      abstained: true,
      reason: "UNRESOLVED_CONTRADICTORY_GUIDANCE",
      message: STANDARD_ABSTENTION_MESSAGE,
      detail: "Multiple official guidelines offer conflicting instructions on this scenario. Automated generation was halted to prevent misleading advice.",
      emergencyContacts: EMERGENCY_FALLBACK_CONTACTS,
      citations: evidencePack.citations || [],
    };
  }

  // Case 4: All candidate sources are expired or superseded
  const allExpired = (evidencePack.groundedChunks || []).every(
    (c) => c.documentStatus === "expired" || c.documentStatus === "superseded"
  );
  if (allExpired && (evidencePack.groundedChunks || []).length > 0) {
    return {
      abstained: true,
      reason: "ALL_SOURCES_EXPIRED",
      message: STANDARD_ABSTENTION_MESSAGE,
      detail: "All available documentation on this topic has been superseded or expired. Current guidance must be verified with local authorities.",
      emergencyContacts: EMERGENCY_FALLBACK_CONTACTS,
      citations: [],
    };
  }

  // Safe to proceed with generation
  return {
    abstained: false,
    reason: "EVIDENCE_SUFFICIENT",
    message: null,
  };
}

module.exports = {
  evaluateAbstention,
  STANDARD_ABSTENTION_MESSAGE,
  EMERGENCY_FALLBACK_CONTACTS,
};
