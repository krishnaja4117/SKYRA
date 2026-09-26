# SKYRA – Phase 7: Explainable AI (XAI) Architecture & Implementation Specification
**Smart India Hackathon 2026 | Problem Statement 26068**
*Hyperlocal Weather Intelligence & Predictive Disaster Risk Platform*

---

## 1. Purpose & Objective: "WHY THIS RISK?"

In emergency operations and public safety, a predictive risk classification (e.g., "High Risk", "Score 74%") without explanatory reasoning is dangerous and untrusted. Operators and citizens must know:

> **"WHY THIS RISK?"**

The SKYRA Phase 7 Explainable AI (XAI) engine derives model-grounded explanations directly from the **actual trained model** and **actual input features**. It guarantees:
- **Zero Hallucination / Fabrication**: Feature contributions are mathematically computed from tree decision paths—never guessed, hardcoded, or randomly generated.
- **Strict 8-Feature Schema**: Decomposes the canonical feature vector:
  `[rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]`.
- **Associative, Non-Causal Language**: Uses scientifically sound phrasing (*"contributed to"*, *"was associated with"*, *"increased the model's predicted risk score"*) rather than false causal certainty (*"rainfall caused the disaster"*).
- **Separation of Concerns**: Explains why the model predicted what it predicted; emergency guidance and disaster preparedness advice are kept distinct in downstream response layers.

---

## 2. Actual ML Model Discovered & Audited

From the codebase audit of `ml/model_metadata.json`, `ml/risk_model.pkl`, and `ml/train_and_calibrate.py`:
- **Model Type**: `CalibratedClassifierCV(RandomForestClassifier)`
- **Base Estimator**: `RandomForestClassifier(n_estimators=200, max_depth=10, min_samples_split=4, class_weight='balanced', random_state=42)`
- **Calibration Method**: `Platt Sigmoid (5-fold Stratified Cross-Validation)`
- **Training Dataset**: 5,320 historical samples from the Open-Meteo ERA5 Reanalysis Archive (2021–2023 across Chennai, Mumbai, Bengaluru, Kolkata, and Delhi)
- **Classes**: `["Low", "Moderate", "High", "Severe"]`
- **Risk Score Formulation**: Probability-weighted severity score:
  $$\text{RiskScore} = \sum_{c} \text{Weight}_c \times P(c)$$
  where $\text{Weight}_{\text{Low}} = 20, \text{Weight}_{\text{Moderate}} = 45, \text{Weight}_{\text{High}} = 70, \text{Weight}_{\text{Severe}} = 95$.

---

## 3. Explanation Method: Tree Path Feature Attribution

Because the primary production model is a 200-tree `RandomForestClassifier`, the mathematically sound and dependency-safe method chosen is **Tree Path Feature Attribution** (Decision Path Decomposition, foundational to Tree SHAP and Saabas tree interpretation):

### Mathematical Formulation
For each decision tree $t \in \{1, \dots, T\}$ in `model.estimators_`:
1. The sample $x = [x_1, \dots, x_8]$ traverses the tree from root node $r=0$ to a terminal leaf node $L$.
2. At every internal decision node $i$, the split feature $f = \text{feature}[i]$ routes the sample to child node $j \in \{\text{left}, \text{right}\}$.
3. The expected class distribution at node $k$ induces an expected risk score $S_k = \sum_c w_c \cdot P_k(c)$.
4. The local score delta produced by splitting on feature $f$ is:
   $$\Delta_i = S_j - S_i$$
5. Accumulating these deltas along the path gives feature $f$'s contribution in tree $t$:
   $$\phi_{t, f} = \sum_{i \in \text{Path}(x), \text{split}(i)=f} \Delta_i$$
6. Averaging over all $T = 200$ trees gives the ensemble feature contribution:
   $$\phi_f = \frac{1}{T} \sum_{t=1}^T \phi_{t, f}$$
7. The sum of all feature contributions plus the root node baseline bias $S_0$ matches the ensemble score:
   $$\text{PredictedScore} = S_0 + \sum_{f=1}^8 \phi_f$$

### Structured Contribution Schema
Every contribution item contains:
- `feature`: Canonical feature key (e.g., `"rainfall"`).
- `displayName`: Human-readable label (e.g., `"Recent Rainfall"`).
- `inputValue`: Physical input measurement (e.g., `45.0`).
- `unit`: Physical measurement unit (e.g., `"mm"`, `"km/h"`, `"°"`).
- `contribution`: Point delta added or subtracted from baseline (e.g., `+18.4`).
- `direction`: `"positive"` (increases risk), `"negative"` (decreases risk/protective), or `"neutral"`.
- `relativeImportance`: Normalized percentage of total absolute contribution magnitude (e.g., `32.6%`).

---

## 4. "Why This Risk?" Human Explanation Engine

The human explanation engine dynamically assembles a context-specific narrative based on the dominant **Risk Factors** (positive contributors) and **Protective Factors** (negative contributors):

### High / Severe Risk Pattern
> *"The model's High risk prediction (score: 78/100) was primarily associated with elevated recent rainfall (52.0mm, +24.0 pts) and sustained wind speed (45.0km/h, +14.0 pts). Meanwhile, atmospheric surface pressure (1012.0hPa) moderated the predicted risk by -4.0 pts."*

### Moderate Risk Pattern
> *"The Moderate risk classification (score: 48/100) was driven by elevated atmospheric humidity (88.0%) and recent rainfall (14.0mm), which increased the model's score above the baseline threshold. However, sustained wind speed (12.0km/h) acted as a mitigating factor preventing escalation to High risk."*

### Low Risk Pattern
> *"The model predicted Low risk (score: 20/100) because recent rainfall (0.0mm) and sustained wind speed (8.0km/h) remained well below active hazard thresholds, offsetting minor environmental variations."*

---

## 5. Confidence Explanation & Truthful Semantics

Confidence values are explicitly explained to prevent dangerous misinterpretations:
- **Value**: Integer in `[0, 100]`.
- **Confidence Type**: `"CALIBRATED"` (for ML service) or `"HEURISTIC"` (for fallback).
- **Calibration Method**: `"Platt Sigmoid (5-fold Cross-Validation)"`.
- **Truthful Meaning**:
  > *"Calibrated prediction certainty based on cross-validated Platt Sigmoid probability scaling across the 200-tree ensemble. Reflects model agreement, not a physical probability of disaster occurrence."*
- **Explicit Distinction**:
  - **Risk Score** $\ne$ **Confidence**.
  - A prediction can have **High Risk (Score 85%)** with **High Confidence (92%)**, or **High Risk (Score 85%)** with **Moderate Confidence (65%)** under ambiguous borderline conditions.

---

## 6. Safe Heuristic Fallback Attribution (`xaiService.js`)

When the Python ML microservice is unreachable, in maintenance, or times out:
1. `riskEngine.js` transparently routes to `calculateFallbackRisk`.
2. `xaiService.js` derives deterministic physics-based feature contributions from the heuristic threshold rules.
3. Truthfully tagged with `explanationMethod: "Heuristic Feature Attribution (Safe Fallback)"` and `isFallback: true`.
4. Zero synthetic or fake ML claims are returned.

---

## 7. Failure Safety Architecture

If an unexpected error occurs during XAI computation:
- The core risk assessment (**Risk Level**, **Risk Score**, **Confidence**) is **NEVER aborted or replaced**.
- Returns `available: false` with clean diagnostic reasons:
  ```json
  {
    "available": false,
    "reason": "XAI_GENERATION_FAILED",
    "summary": "Model explanation is temporarily unavailable for this prediction.",
    "whyThisRisk": "Model explanation could not be computed.",
    "featureContributions": [],
    "riskFactors": [],
    "protectiveFactors": [],
    "explanationMethod": "Unavailable"
  }
  ```
- Stack traces, database strings, and cloud credentials are never exposed in failure payloads.

---

## 8. API & Contract Integration

The canonical `SkyraIntelligenceResult` (`dataContract.js`) embeds the complete XAI payload:

```json
{
  "location": { "city": "Chennai", "latitude": 13.0827, "longitude": 80.2707 },
  "riskLevel": "Moderate",
  "riskScore": 48,
  "confidence": 88,
  "confidenceType": "CALIBRATED",
  "xai": {
    "available": true,
    "summary": "The Moderate risk classification (score: 48/100) was driven by elevated recent rainfall (18.0mm)...",
    "whyThisRisk": "The Moderate risk classification (score: 48/100) was driven by elevated recent rainfall (18.0mm)...",
    "explanation": "The Moderate risk classification (score: 48/100) was driven by elevated recent rainfall (18.0mm)...",
    "featureContributions": [
      {
        "feature": "rainfall",
        "displayName": "Recent Rainfall",
        "inputValue": 18.0,
        "unit": "mm",
        "contribution": 14.2,
        "direction": "positive",
        "relativeImportance": 34.2
      }
    ],
    "riskFactors": [ ... ],
    "protectiveFactors": [ ... ],
    "explanationMethod": "Tree Path Feature Attribution (Decision Path Decomposition)",
    "modelMethod": "Calibrated RandomForestClassifier (200 trees, max_depth=10)",
    "confidenceExplanation": {
      "value": 88,
      "confidenceType": "CALIBRATED",
      "calibrationMethod": "Platt Sigmoid (5-fold Cross-Validation)",
      "meaning": "Calibrated prediction certainty...",
      "isCalibrated": true
    }
  }
}
```

---

## 9. Known Limitations
1. **Additive Approximation**: Tree Path feature attribution decomposes non-linear multivariate interactions into additive feature point deltas. While mathematically exact at the leaf node, complex multi-feature interaction terms are shared across the path.
2. **Severe Class Imbalance**: As documented in `model_metadata.json`, historical Severe disaster events are rare ($N=19$, 0.36%). Borderline Severe conditions are conservatively predicted as High risk by the Random Forest classifier.
3. **Domain Coverage**: Feature attribution explains the 8 meteorological and terrain variables. Non-modeled external anomalies (e.g., localized drain blockage or construction debris) are assessed downstream by Phase 6 Impact Assessment limitations, not by the statistical ML model.
