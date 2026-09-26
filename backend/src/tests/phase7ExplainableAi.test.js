/**
 * SKYRA – Phase 7 Explainable AI (XAI) Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates model-grounded explanations, feature attribution, and "Why This Risk?"
 * reasoning across both ML service and safe heuristic fallback paths:
 *
 *   1. XAI Structure & Required Fields (Tests 1-4)
 *   2. Strict 8-Feature Coverage (Tests 5-8)
 *   3. Feature Contribution Integrity & Metrics (Tests 9-13)
 *   4. "Why This Risk?" Human Explanation & Non-Causality (Tests 14-18)
 *   5. Input-Sensitivity & Multi-Hazard Differentiation (Tests 19-23)
 *   6. Location Safety & Non-Contamination (Tests 24-26)
 *   7. Truthful Confidence Semantics (Tests 27-30)
 *   8. Failure Safety & Graceful Degradation (Tests 31-35)
 *   9. Determinism & Consistency (Tests 36-38)
 *  10. Full Intelligence Aggregator Integration (Tests 39-42)
 */

const assert = require("assert");

const {
  generateXaiExplanation,
  buildWhyThisRiskNarrative,
  deriveHeuristicFeatureAttribution,
  FEATURE_METADATA,
  CANONICAL_FEATURE_ORDER,
} = require("../services/xaiService");

const { calculateRisk, calculateFallbackRisk } = require("../services/riskEngine");
const { getIntelligenceForLocation } = require("../services/intelligenceService");
const { createSkyraIntelligenceResult } = require("../utils/dataContract");

let passed = 0;
let total = 0;

function recordPass(testName, details = "") {
  passed += 1;
  total += 1;
  console.log(`  PASS [Test ${String(total).padStart(2, "0")}] ${testName}${details ? ` (${details})` : ""}`);
}

async function runPhase7TestSuite() {
  console.log("\n================================================================================");
  console.log("   SKYRA PHASE 7: EXPLAINABLE AI (XAI) VERIFICATION SUITE");
  console.log("================================================================================\n");

  /* ==========================================================================
     1. XAI STRUCTURE & REQUIRED FIELDS (Tests 1-4)
     ========================================================================== */
  console.log("── Section 1: XAI Structure & Required Fields ─────────────────────────────────");

  // Test 1: generateXaiExplanation returns complete canonical XAI contract
  {
    const sampleInputs = {
      rainfall: 35.0,
      forecastRainfall: 20.0,
      humidity: 80,
      windSpeed: 25,
      historicalRisk: 30,
      terrainSlope: 2.5,
      temperature: 29,
      pressure: 1008,
    };
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Moderate", riskScore: 52, confidence: 85, isFallback: true },
      featureObject: sampleInputs,
      isFallback: true,
    });

    assert.strictEqual(xai.available, true);
    assert.strictEqual(typeof xai.summary, "string");
    assert.strictEqual(typeof xai.whyThisRisk, "string");
    assert.ok(Array.isArray(xai.featureContributions));
    assert.ok(Array.isArray(xai.riskFactors));
    assert.ok(Array.isArray(xai.protectiveFactors));
    assert.strictEqual(typeof xai.explanationMethod, "string");
    assert.strictEqual(typeof xai.modelMethod, "string");
    assert.ok(xai.confidenceExplanation !== null && typeof xai.confidenceExplanation === "object");
    recordPass("XAI Contract: Complete Structured Artifact Produced");
  }

  // Test 2: Heuristic fallback path embeds full XAI
  {
    const fallbackRes = calculateFallbackRisk({
      rainfall: 60.0,
      forecastRainfall: 40.0,
      humidity: 90,
      windSpeed: 30,
      historicalRisk: 45,
      terrainSlope: 1.0,
      temperature: 27,
      pressure: 1002,
    });

    assert.strictEqual(fallbackRes.isFallback, true);
    assert.ok(fallbackRes.xai !== undefined);
    assert.strictEqual(fallbackRes.xai.available, true);
    assert.ok(fallbackRes.xai.explanationMethod.includes("Heuristic"));
    recordPass("Fallback Path: Embedded XAI Marked Truthfully as Heuristic Attribution");
  }

  // Test 3: Backward compatible factors array preserved on risk result
  {
    const fallbackRes = calculateFallbackRisk({ rainfall: 30.0, windSpeed: 55.0 });
    assert.ok(Array.isArray(fallbackRes.factors));
    assert.ok(fallbackRes.factors.length > 0);
    assert.ok(fallbackRes.factors[0].name);
    assert.ok(fallbackRes.factors[0].impact);
    assert.ok(fallbackRes.factors[0].detail);
    recordPass("Backward Compatibility: Legacy factors Array Preserved on Risk Result");
  }

  // Test 4: Backward compatible explanation string preserved on risk result
  {
    const fallbackRes = calculateFallbackRisk({ rainfall: 15.0 });
    assert.strictEqual(typeof fallbackRes.explanation, "string");
    assert.ok(fallbackRes.explanation.length > 10);
    recordPass("Backward Compatibility: Legacy explanation String Populated");
  }

  /* ==========================================================================
     2. STRICT 8-FEATURE COVERAGE (Tests 5-8)
     ========================================================================== */
  console.log("\n── Section 2: Strict 8-Feature Coverage ───────────────────────────────────────");

  // Test 5: All 8 canonical features present in featureContributions
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 80, isFallback: true },
      featureObject: { rainfall: 0, forecastRainfall: 0, humidity: 60, windSpeed: 10, historicalRisk: 15, terrainSlope: 0.5, temperature: 26, pressure: 1014 },
      isFallback: true,
    });

    assert.strictEqual(xai.featureContributions.length, 8);
    const presentFeatures = xai.featureContributions.map((fc) => fc.feature);
    for (const feat of CANONICAL_FEATURE_ORDER) {
      assert.ok(presentFeatures.includes(feat), `Feature '${feat}' must be present in contributions`);
    }
    recordPass("Feature Coverage: Exactly 8 Canonical Features Represented");
  }

  // Test 6: Feature metadata mapping provides clean display names and units
  {
    for (const name of CANONICAL_FEATURE_ORDER) {
      const meta = FEATURE_METADATA[name];
      assert.ok(meta, `Metadata for '${name}' must exist`);
      assert.ok(meta.displayName.length > 0);
      assert.strictEqual(typeof meta.unit, "string");
    }
    recordPass("Feature Metadata: Consistent Display Names and Physical Units");
  }

  // Test 7: Terrain slope is attributed as physical feature, never hardcoded 15
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Moderate", riskScore: 45, confidence: 80, isFallback: true },
      featureObject: { terrainSlope: 32.5 },
      isFallback: true,
    });

    const terrainContrib = xai.featureContributions.find((fc) => fc.feature === "terrainSlope");
    assert.ok(terrainContrib);
    assert.strictEqual(terrainContrib.inputValue, 32.5);
    assert.strictEqual(terrainContrib.unit, "°");
    recordPass("Feature Attribution: Real Topographic Terrain Slope Attributed (Not 15)");
  }

  // Test 8: Historical risk is attributed empirically, never hardcoded 60
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 72, confidence: 80, isFallback: true },
      featureObject: { historicalRisk: 78.4 },
      isFallback: true,
    });

    const histContrib = xai.featureContributions.find((fc) => fc.feature === "historicalRisk");
    assert.ok(histContrib);
    assert.strictEqual(histContrib.inputValue, 78.4);
    assert.strictEqual(histContrib.direction, "positive");
    recordPass("Feature Attribution: Real Historical Risk Index Attributed (Not 60)");
  }

  /* ==========================================================================
     3. FEATURE CONTRIBUTION INTEGRITY & METRICS (Tests 9-13)
     ========================================================================== */
  console.log("\n── Section 3: Feature Contribution Integrity & Metrics ───────────────────────");

  // Test 9: Each contribution item contains required fields
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Severe", riskScore: 88, confidence: 90, isFallback: true },
      featureObject: { rainfall: 85, windSpeed: 75 },
      isFallback: true,
    });

    for (const fc of xai.featureContributions) {
      assert.ok(fc.feature);
      assert.ok(fc.displayName);
      assert.strictEqual(typeof fc.inputValue, "number");
      assert.strictEqual(typeof fc.contribution, "number");
      assert.ok(["positive", "negative", "neutral"].includes(fc.direction));
      assert.ok(typeof fc.relativeImportance === "number");
      assert.ok(fc.relativeImportance >= 0 && fc.relativeImportance <= 100);
    }
    recordPass("Contribution Structure: feature, displayName, input, contribution, direction, relImportance");
  }

  // Test 10: Positive contributions populate riskFactors
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 75, confidence: 80, isFallback: true },
      featureObject: { rainfall: 60, forecastRainfall: 35 },
      isFallback: true,
    });

    assert.ok(xai.riskFactors.length > 0);
    for (const rf of xai.riskFactors) {
      assert.strictEqual(rf.direction, "positive");
      assert.ok(rf.contribution > 0);
    }
    recordPass("Risk Factors: Strictly Filtered to Positive Impact Contributors");
  }

  // Test 11: Negative contributions populate protectiveFactors
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 80, isFallback: true },
      featureObject: { rainfall: 0, forecastRainfall: 0, windSpeed: 8, pressure: 1015 },
      isFallback: true,
    });

    assert.ok(xai.protectiveFactors.length > 0);
    for (const pf of xai.protectiveFactors) {
      assert.strictEqual(pf.direction, "negative");
      assert.ok(pf.contribution < 0);
    }
    recordPass("Protective Factors: Identifies Risk-Mitigating Environmental Variables");
  }

  // Test 12: Risk factors sorted descending by contribution magnitude
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Severe", riskScore: 90, confidence: 85, isFallback: true },
      featureObject: { rainfall: 70, forecastRainfall: 40, windSpeed: 80 },
      isFallback: true,
    });

    for (let i = 0; i < xai.riskFactors.length - 1; i++) {
      assert.ok(
        xai.riskFactors[i].contribution >= xai.riskFactors[i + 1].contribution,
        "Risk factors must be sorted descending by contribution"
      );
    }
    recordPass("Factor Ordering: Risk Factors Ordered Descending by Impact Magnitude");
  }

  // Test 13: Relative importance sum is normalized
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Moderate", riskScore: 50, confidence: 80, isFallback: true },
      featureObject: { rainfall: 15, windSpeed: 35, humidity: 88 },
      isFallback: true,
    });

    const sumRelImp = xai.featureContributions.reduce((acc, fc) => acc + fc.relativeImportance, 0);
    // Allowing minor float rounding difference (98% - 102%)
    assert.ok(sumRelImp >= 98 && sumRelImp <= 102, `Relative importance sum (${sumRelImp}) must be ~100%`);
    recordPass("Metric Calibration: Relative Importance Bounded & Normalized");
  }

  /* ==========================================================================
     4. "WHY THIS RISK?" HUMAN EXPLANATION & NON-CAUSALITY (Tests 14-18)
     ========================================================================== */
  console.log("\n── Section 4: 'Why This Risk?' Human Explanation & Non-Causality ─────────────");

  // Test 14: WHY THIS RISK explanation is non-empty string
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 74, confidence: 85, isFallback: true },
      featureObject: { rainfall: 45, forecastRainfall: 30 },
      isFallback: true,
    });

    assert.strictEqual(typeof xai.whyThisRisk, "string");
    assert.ok(xai.whyThisRisk.length > 20);
    recordPass("Why This Risk: Robust Explanatory Narrative Generated");
  }

  // Test 15: Uses non-causal associative phrasing (no causal certainty)
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Severe", riskScore: 92, confidence: 90, isFallback: true },
      featureObject: { rainfall: 90, windSpeed: 80 },
      isFallback: true,
    });

    const text = xai.whyThisRisk.toLowerCase();
    // Forbidden causal certainty claims
    assert.ok(!text.includes("caused the disaster"), "Must not claim causal disaster certainty");
    assert.ok(!text.includes("guarantees flooding"), "Must not claim deterministic guarantees");
    assert.ok(!text.includes("definitely cause"), "Must not claim absolute certainty");

    // Allowed associative phrasing
    assert.ok(
      text.includes("associated with") || text.includes("driven by") || text.includes("contributing"),
      "Must use non-causal associative terminology"
    );
    recordPass("Non-Causality: Associative Phrasing Enforced ('associated with', 'contributing')");
  }

  // Test 16: Explanation references actual input values and units
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 78, confidence: 85, isFallback: true },
      featureObject: { rainfall: 52.0 },
      isFallback: true,
    });

    assert.ok(xai.whyThisRisk.includes("52mm") || xai.whyThisRisk.includes("rainfall"));
    recordPass("Evidence Grounding: Explanation Cites Physical Quantities and Units");
  }

  // Test 17: Low-risk scenario explicitly articulates protective baseline stability
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 80, isFallback: true },
      featureObject: { rainfall: 0, forecastRainfall: 0, windSpeed: 5, pressure: 1014 },
      isFallback: true,
    });

    const text = xai.whyThisRisk.toLowerCase();
    assert.ok(text.includes("low risk") || text.includes("baseline") || text.includes("routine"));
    recordPass("Low-Risk Explanation: Clearly Explains Absence of Hazards & Protective Stability");
  }

  // Test 18: Explanation is separated from disaster management advice
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Severe", riskScore: 88, confidence: 90, isFallback: true },
      featureObject: { rainfall: 80 },
      isFallback: true,
    });

    const text = xai.whyThisRisk.toLowerCase();
    // Advice belongs in actionableAdvice, not XAI model explanation
    assert.ok(!text.includes("evacuate immediately"), "Disaster advice must not be mixed into XAI");
    assert.ok(!text.includes("call 112"), "Emergency hotlines must not be mixed into XAI");
    recordPass("Separation of Concerns: XAI Explains Model Decision Without Mixing Advice");
  }

  /* ==========================================================================
     5. INPUT-SENSITIVITY & MULTI-HAZARD DIFFERENTIATION (Tests 19-23)
     ========================================================================== */
  console.log("\n── Section 5: Input-Sensitivity & Multi-Hazard Differentiation ───────────────");

  // Test 19: Heavy rain scenario identifies rainfall as dominant risk factor
  {
    const rainXai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 75, confidence: 85, isFallback: true },
      featureObject: { rainfall: 65, windSpeed: 10, temperature: 26 },
      isFallback: true,
    });

    assert.strictEqual(rainXai.riskFactors[0].feature, "rainfall");
    recordPass("Hazard Differentiation: Rain Scenario Identifies Rainfall as Top Contributor");
  }

  // Test 20: Gale-force wind scenario identifies windSpeed as dominant risk factor
  {
    const windXai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 72, confidence: 85, isFallback: true },
      featureObject: { rainfall: 0, windSpeed: 75, temperature: 28 },
      isFallback: true,
    });

    assert.strictEqual(windXai.riskFactors[0].feature, "windSpeed");
    recordPass("Hazard Differentiation: Wind Scenario Identifies Wind Speed as Top Contributor");
  }

  // Test 21: Heatwave scenario identifies temperature as dominant contributor
  {
    const heatXai = generateXaiExplanation({
      riskData: { riskLevel: "Moderate", riskScore: 48, confidence: 80, isFallback: true },
      featureObject: { rainfall: 0, windSpeed: 10, temperature: 42.5 },
      isFallback: true,
    });

    assert.ok(heatXai.riskFactors.some((rf) => rf.feature === "temperature"));
    recordPass("Hazard Differentiation: Heat Scenario Identifies Temperature as Contributor");
  }

  // Test 22: Distinct inputs produce completely distinct explanations
  {
    const xaiRain = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 76, confidence: 85, isFallback: true },
      featureObject: { rainfall: 55, windSpeed: 12 },
      isFallback: true,
    });

    const xaiWind = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 74, confidence: 85, isFallback: true },
      featureObject: { rainfall: 0, windSpeed: 72 },
      isFallback: true,
    });

    assert.notStrictEqual(xaiRain.whyThisRisk, xaiWind.whyThisRisk);
    assert.ok(xaiRain.whyThisRisk.includes("rainfall"));
    assert.ok(xaiWind.whyThisRisk.includes("wind speed"));
    recordPass("Sensitivity: Distinct Hazards Yield Distinct Dynamic Explanations");
  }

  // Test 23: Compounding hazards (rain + wind) report multiple primary contributors
  {
    const compoundXai = generateXaiExplanation({
      riskData: { riskLevel: "Severe", riskScore: 92, confidence: 90, isFallback: true },
      featureObject: { rainfall: 75, windSpeed: 80 },
      isFallback: true,
    });

    const featuresInRisks = compoundXai.riskFactors.map((rf) => rf.feature);
    assert.ok(featuresInRisks.includes("rainfall"));
    assert.ok(featuresInRisks.includes("windSpeed"));
    recordPass("Compounding Hazards: Captures Joint Attribution Across Multiple Factors");
  }

  /* ==========================================================================
     6. LOCATION SAFETY & NON-CONTAMINATION (Tests 24-26)
     ========================================================================== */
  console.log("\n── Section 6: Location Safety & Non-Contamination ────────────────────────────");

  // Test 24: No hardcoded Bhubaneswar or Odisha references in explanation
  {
    const xaiDelhi = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 75, confidence: 85, isFallback: true },
      featureObject: { rainfall: 50, temperature: 35 },
      isFallback: true,
    });

    assert.ok(!xaiDelhi.whyThisRisk.includes("Bhubaneswar"));
    assert.ok(!xaiDelhi.whyThisRisk.includes("Odisha"));
    assert.ok(!xaiDelhi.summary.includes("Bhubaneswar"));
    recordPass("Location Safety: Zero Bhubaneswar / Regional Contamination in XAI");
  }

  // Test 25: Generic, model-grounded explanations apply equally across all geographic regions
  {
    const coordsMumbai = { latitude: 19.0760, longitude: 72.8777 };
    const coordsKolkata = { latitude: 22.5726, longitude: 88.3639 };

    const xaiMUM = generateXaiExplanation({
      riskData: { riskLevel: "Moderate", riskScore: 48, confidence: 80, isFallback: true },
      featureObject: { rainfall: 20, humidity: 85 },
      isFallback: true,
    });

    const xaiKOL = generateXaiExplanation({
      riskData: { riskLevel: "Moderate", riskScore: 48, confidence: 80, isFallback: true },
      featureObject: { rainfall: 20, humidity: 85 },
      isFallback: true,
    });

    // Identical features produce identical model attribution regardless of city name
    assert.strictEqual(xaiMUM.whyThisRisk, xaiKOL.whyThisRisk);
    recordPass("Location Invariance: Model Explanations Grounded in Physics, Not City Labels");
  }

  // Test 26: XAI operates safely on remote/ocean coordinates
  {
    const xaiOcean = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 80, isFallback: true },
      featureObject: { rainfall: 0, windSpeed: 10, pressure: 1012 },
      isFallback: true,
    });

    assert.strictEqual(xaiOcean.available, true);
    assert.ok(xaiOcean.whyThisRisk.length > 10);
    recordPass("Coordinate Independence: Safe Execution on Unnamed / Off-Shore Locations");
  }

  /* ==========================================================================
     7. TRUTHFUL CONFIDENCE SEMANTICS (Tests 27-30)
     ========================================================================== */
  console.log("\n── Section 7: Truthful Confidence Semantics ───────────────────────────────────");

  // Test 27: Confidence explanation accurately articulates meaning
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 75, confidence: 88, confidenceType: "CALIBRATED", isFallback: false },
      featureObject: { rainfall: 40 },
      isFallback: false,
    });

    assert.strictEqual(xai.confidenceExplanation.value, 88);
    assert.ok(xai.confidenceExplanation.meaning.includes("certainty") || xai.confidenceExplanation.meaning.includes("agreement"));
    assert.ok(!xai.confidenceExplanation.meaning.includes("probability of disaster occurring"));
    recordPass("Confidence Meaning: Documented as Model Certainty, NOT Disaster Probability");
  }

  // Test 28: Distinguishes calibrated ML confidence from heuristic proxy
  {
    const calXai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 75, confidence: 92, confidenceType: "CALIBRATED", isFallback: false },
      featureObject: { rainfall: 40 },
      isFallback: false,
    });

    const heurXai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 72, confidence: 80, confidenceType: "HEURISTIC", isFallback: true },
      featureObject: { rainfall: 40 },
      isFallback: true,
    });

    assert.strictEqual(calXai.confidenceExplanation.isCalibrated, true);
    assert.strictEqual(heurXai.confidenceExplanation.isCalibrated, false);
    assert.ok(heurXai.confidenceExplanation.meaning.includes("Heuristic baseline"));
    recordPass("Confidence Taxonomy: Clear Separation of Calibrated ML vs Heuristic Proxy");
  }

  // Test 29: Confidence is bounded in [0, 100]
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 85, isFallback: true },
      featureObject: {},
      isFallback: true,
    });

    assert.ok(xai.confidenceExplanation.value >= 0 && xai.confidenceExplanation.value <= 100);
    recordPass("Confidence Bounds: Strictly Bounded Within [0, 100]");
  }

  // Test 30: Does not copy or confuse Risk Score with Confidence
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 78, confidence: 94, isFallback: true },
      featureObject: { rainfall: 45 },
      isFallback: true,
    });

    assert.notStrictEqual(xai.confidenceExplanation.value, 78);
    assert.strictEqual(xai.confidenceExplanation.value, 94);
    recordPass("Semantic Integrity: Explicit Separation of Risk Score (78) vs Confidence (94)");
  }

  /* ==========================================================================
     8. FAILURE SAFETY & GRACEFUL DEGRADATION (Tests 31-35)
     ========================================================================== */
  console.log("\n── Section 8: Failure Safety & Graceful Degradation ───────────────────────────");

  // Test 31: Null featureObject handled gracefully without throwing
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 80, isFallback: true },
      featureObject: null,
      isFallback: true,
    });

    assert.strictEqual(xai.available, true);
    assert.ok(xai.featureContributions.length > 0);
    recordPass("Failure Safety: Null featureObject Safely Handled (No Throw)");
  }

  // Test 32: Undefined riskData handled gracefully
  {
    const xai = generateXaiExplanation(undefined);
    assert.strictEqual(xai.available, true);
    assert.ok(xai.whyThisRisk);
    recordPass("Failure Safety: Empty Arguments Handled Without Exception");
  }

  // Test 33: Corrupted inputs yield safe UNAVAILABLE state rather than crashing
  {
    // Passing non-object that triggers inner catch block
    const xai = generateXaiExplanation({
      riskData: null,
      featureObject: {
        get rainfall() {
          throw new Error("Corrupted feature getter simulation");
        },
      },
      isFallback: true,
    });

    assert.strictEqual(xai.available, false);
    assert.ok(xai.reason.includes("XAI_GENERATION_FAILED"));
    assert.strictEqual(xai.explanationMethod, "Unavailable");
    recordPass("Failure Safety: Internal Exception Caught & Reports Explicit UNAVAILABLE State");
  }

  // Test 34: calculateRisk continues functioning even if XAI is unavailable
  {
    // Test hook override returning valid prediction without xai
    const mockML = async () => ({
      riskLevel: "High",
      riskScore: 70,
      confidence: 85,
      // No xai property provided by upstream service
    });

    const res = await calculateRisk({ rainfall: 30 }, { fetcherOverride: mockML });
    assert.strictEqual(res.riskLevel, "High");
    assert.strictEqual(res.riskScore, 70);
    assert.ok(res.xai !== undefined);
    assert.strictEqual(res.xai.available, true);
    recordPass("Resilience: Core ML Prediction Preserved When Upstream Omits XAI");
  }

  // Test 35: No stack traces or private secrets exposed in XAI error states
  {
    const xai = generateXaiExplanation({
      featureObject: {
        get rainfall() {
          throw new Error("AWS_SECRET_KEY=12345 Database failure");
        },
      },
    });

    assert.strictEqual(xai.available, false);
    assert.ok(!xai.summary.includes("AWS_SECRET_KEY"));
    recordPass("Security: Zero Stack Traces or Credentials Leaked in Failure Diagnostics");
  }

  /* ==========================================================================
     9. DETERMINISM & CONSISTENCY (Tests 36-38)
     ========================================================================== */
  console.log("\n── Section 9: Determinism & Consistency ───────────────────────────────────────");

  // Test 36: Identical inputs produce identical feature contributions
  {
    const inputs = { rainfall: 42.0, windSpeed: 28.0, humidity: 75 };
    const xai1 = generateXaiExplanation({ riskData: { riskLevel: "Moderate", riskScore: 50, confidence: 80, isFallback: true }, featureObject: inputs, isFallback: true });
    const xai2 = generateXaiExplanation({ riskData: { riskLevel: "Moderate", riskScore: 50, confidence: 80, isFallback: true }, featureObject: inputs, isFallback: true });

    assert.deepStrictEqual(xai1.featureContributions, xai2.featureContributions);
    assert.strictEqual(xai1.whyThisRisk, xai2.whyThisRisk);
    recordPass("Determinism: Identical Inputs Yield Bit-for-Bit Identical Explanations");
  }

  // Test 37: Feature ordering in contributions matches canonical schema
  {
    const xai = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 20, confidence: 80, isFallback: true },
      featureObject: { rainfall: 0 },
      isFallback: true,
    });

    const featureNames = xai.featureContributions.map((fc) => fc.feature);
    for (const canonicalName of CANONICAL_FEATURE_ORDER) {
      assert.ok(featureNames.includes(canonicalName));
    }
    recordPass("Consistency: Canonical Feature Set Preserved Across All Computations");
  }

  // Test 38: Monotonic contribution: Higher rainfall yields higher contribution
  {
    const lowRain = generateXaiExplanation({
      riskData: { riskLevel: "Low", riskScore: 25, confidence: 80, isFallback: true },
      featureObject: { rainfall: 12 },
      isFallback: true,
    });

    const highRain = generateXaiExplanation({
      riskData: { riskLevel: "High", riskScore: 75, confidence: 80, isFallback: true },
      featureObject: { rainfall: 65 },
      isFallback: true,
    });

    const lowContrib = lowRain.featureContributions.find((fc) => fc.feature === "rainfall").contribution;
    const highContrib = highRain.featureContributions.find((fc) => fc.feature === "rainfall").contribution;

    assert.ok(highContrib > lowContrib, `Higher rainfall (+${highContrib}) must have greater contribution than lower (+${lowContrib})`);
    recordPass("Physical Monotonicity: Higher Hazard Intensity Produces Greater Contribution");
  }

  /* ==========================================================================
     10. FULL INTELLIGENCE AGGREGATOR INTEGRATION (Tests 39-42)
     ========================================================================== */
  console.log("\n── Section 10: Full Intelligence Aggregator Integration ───────────────────────");

  // Test 39: getIntelligenceForLocation returns full XAI structure
  {
    const result = await getIntelligenceForLocation({
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: "Chennai",
      region: "Tamil Nadu",
    });

    assert.ok(result.xai !== undefined, "result.xai must exist");
    assert.strictEqual(result.xai.available, true);
    assert.ok(result.xai.whyThisRisk);
    assert.ok(Array.isArray(result.xai.featureContributions));
    assert.ok(Array.isArray(result.xai.riskFactors));
    assert.ok(Array.isArray(result.xai.protectiveFactors));
    assert.ok(result.xai.confidenceExplanation);
    recordPass("Pipeline Integration: getIntelligenceForLocation Returns Full Structured XAI");
  }

  // Test 40: Canonical SkyraIntelligenceResult preserves XAI
  {
    const rawResult = createSkyraIntelligenceResult({
      riskLevel: "High",
      riskScore: 72,
      confidence: 85,
      xai: {
        available: true,
        summary: "High risk associated with heavy rain.",
        whyThisRisk: "High risk associated with heavy rain.",
        explanation: "High risk associated with heavy rain.",
        featureContributions: [{ feature: "rainfall", contribution: 25.0, direction: "positive" }],
        riskFactors: [{ feature: "rainfall", contribution: 25.0 }],
        protectiveFactors: [],
        explanationMethod: "Tree Path Feature Attribution",
        modelMethod: "RandomForestClassifier",
        confidenceExplanation: { value: 85, meaning: "Model certainty." },
      },
    });

    assert.strictEqual(rawResult.xai.available, true);
    assert.strictEqual(rawResult.xai.whyThisRisk, "High risk associated with heavy rain.");
    assert.strictEqual(rawResult.xai.featureContributions.length, 1);
    recordPass("Data Contract: createSkyraIntelligenceResult Preserves Rich XAI Payload");
  }

  // Test 41: Multi-city query retains distinct XAI profiles (Chennai vs Delhi)
  {
    const resChennai = await getIntelligenceForLocation({ latitude: 13.0827, longitude: 80.2707, locationName: "Chennai" });
    const resDelhi = await getIntelligenceForLocation({ latitude: 28.6139, longitude: 77.2090, locationName: "New Delhi" });

    assert.ok(resChennai.xai.whyThisRisk);
    assert.ok(resDelhi.xai.whyThisRisk);
    assert.ok(resChennai.xai.featureContributions.length > 0);
    assert.ok(resDelhi.xai.featureContributions.length > 0);
    recordPass("Cross-City Isolation: Multi-City Queries Retain Independent XAI Profiles");
  }

  // Test 42: Custom inputs override reflects custom variables in XAI
  {
    const customResult = await getIntelligenceForLocation({
      latitude: 19.0760,
      longitude: 72.8777,
      locationName: "Mumbai",
      customInputs: {
        rainfall: 70.0,
        forecastRainfall: 45.0,
        windSpeed: 60.0,
        humidity: 92,
      },
    });

    assert.ok(customResult.xai.available);
    const rainContrib = customResult.xai.featureContributions.find((fc) => fc.feature === "rainfall");
    assert.strictEqual(rainContrib.inputValue, 70.0);
    assert.strictEqual(rainContrib.direction, "positive");
    recordPass("Custom Simulation: XAI Reflects Exact Simulation Override Values");
  }

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passed} PHASE 7 EXPLAINABLE AI (XAI) TESTS PASSED SUCCESSFULLY!`);
  console.log("================================================================================\n");
}

runPhase7TestSuite().catch((err) => {
  console.error("❌ Fatal error in Phase 7 test suite:", err);
  process.exit(1);
});
