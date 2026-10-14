"""
SKYRA – Comprehensive ML Parity & Boundary Verification Suite (Phase 4)
─────────────────────────────────────────────────────────────────────────────
Exhaustively tests browser decision tree evaluator against native Python XGBoost.
Verifies:
  1. Strict 8-feature order: [rainfall, forecastRainfall, humidity, windSpeed,
                             historicalRisk, terrainSlope, temperature, pressure]
  2. All 4 risk classes: Low, Moderate, High, Severe
  3. Extreme physical boundary cases:
     • Absolute zero conditions
     • Extreme cloudburst / monsoonal precipitation (> 250 mm)
     • Sub-zero freezing temperatures (-25°C)
     • Extreme barometric pressures (930 hPa vs 1040 hPa)
     • Steep landslide incline slopes (0° vs 65°)
     • Hurricane-force wind speeds (> 140 km/h)
  4. 100+ randomized reproducible scenarios
  5. Mathematical parity: probability delta < 1e-4, 0 score delta, 100% class match
"""

import os
import json
import joblib
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "xgboost_model.pkl")
BUNDLE_PATH = os.path.join(BASE_DIR, "..", "frontend", "public", "models", "xgboost_risk_model.json")

print("[INIT] Loading native Python XGBoost model...")
py_model = joblib.load(MODEL_PATH)

print("[INIT] Loading browser JSON model bundle...")
with open(BUNDLE_PATH, "r") as f:
    bundle = json.load(f)

base_scores = bundle["baseScores"]
trees = bundle["trees"]
tree_info = bundle["treeInfo"]
classes = bundle["classes"]
risk_weights = bundle["riskWeights"]
features_order = bundle["features"]

EXPECTED_ORDER = [
    "rainfall",
    "forecastRainfall",
    "humidity",
    "windSpeed",
    "historicalRisk",
    "terrainSlope",
    "temperature",
    "pressure",
]
assert features_order == EXPECTED_ORDER, f"Feature order mismatch: {features_order} != {EXPECTED_ORDER}"
print("[PASS] Feature order strictly verified against production schema.")

def evaluate_js_trees(features):
    """Replicates frontend/src/services/offlineRiskEngine.js decision tree evaluation."""
    margins = list(base_scores)
    for t_idx, tree in enumerate(trees):
        cls = tree_info[t_idx]
        left = tree["l"]
        right = tree["r"]
        feat = tree["f"]
        cond = tree["c"]
        node = 0
        while left[node] != -1:
            if features[feat[node]] < cond[node]:
                node = left[node]
            else:
                node = right[node]
        margins[cls] += cond[node]

    # Softmax
    exp_m = np.exp(margins - np.max(margins))
    probs = exp_m / np.sum(exp_m)
    best_cls = classes[np.argmax(probs)]
    score = int(round(sum(risk_weights[classes[i]] * probs[i] for i in range(4))))
    return probs, best_cls, score

# -- Explicit Physical Boundary Scenarios --------------------------------------
boundary_cases = [
    # 1. Absolute zero minimums
    ("Zero Baseline", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 300.0]),
    # 2. Arid heatwave without rain
    ("Extreme Heatwave", [0.0, 0.0, 12.0, 6.0, 5.0, 1.0, 48.0, 1008.0]),
    # 3. Sub-zero mountain cold wave
    ("Sub-Zero Freezing", [2.0, 4.0, 75.0, 22.0, 15.0, 35.0, -22.0, 1025.0]),
    # 4. Super-cyclonic storm surge & cloudburst
    ("Super Cyclone", [280.0, 320.0, 100.0, 145.0, 95.0, 12.0, 24.0, 935.0]),
    # 5. Extreme barometric low pressure (eye of cyclone)
    ("Extreme Barometric Depression", [60.0, 80.0, 92.0, 65.0, 70.0, 8.0, 26.0, 920.0]),
    # 6. Ultra-high atmospheric pressure
    ("High Pressure Anticyclone", [0.0, 0.0, 30.0, 12.0, 10.0, 4.0, 18.0, 1045.0]),
    # 7. Steep incline flash landslide trigger
    ("Steep Landslide Zone", [120.0, 140.0, 95.0, 35.0, 90.0, 62.0, 19.0, 990.0]),
    # 8. Dry gale windstorm
    ("Dry Gale Windstorm", [0.0, 0.0, 18.0, 115.0, 40.0, 6.0, 34.0, 998.0]),
    # 9. Moderate coastal monsoon
    ("Coastal Monsoon", [45.0, 55.0, 88.0, 42.0, 50.0, 3.0, 27.0, 1004.0]),
    # 10. Borderline class threshold (Low vs Moderate)
    ("Threshold Low-Mod", [8.0, 12.0, 70.0, 20.0, 25.0, 5.0, 28.0, 1010.0]),
    # 11. Borderline class threshold (Moderate vs High)
    ("Threshold Mod-High", [35.0, 45.0, 85.0, 45.0, 55.0, 14.0, 25.0, 1001.0]),
    # 12. Borderline class threshold (High vs Severe)
    ("Threshold High-Severe", [90.0, 110.0, 94.0, 75.0, 75.0, 22.0, 23.0, 988.0]),
]

print(f"\n-- Testing {len(boundary_cases)} Strict Boundary Cases --")
for name, case in boundary_cases:
    py_probs = py_model.predict_proba([case])[0]
    py_class = classes[np.argmax(py_probs)]
    py_score = int(round(sum(risk_weights[classes[i]] * py_probs[i] for i in range(4))))

    js_probs, js_class, js_score = evaluate_js_trees(case)
    delta = np.max(np.abs(py_probs - js_probs))

    assert delta < 0.0001, f"Boundary '{name}' delta too high: {delta}"
    assert py_class == js_class, f"Boundary '{name}' class mismatch: {py_class} vs {js_class}"
    assert py_score == js_score, f"Boundary '{name}' score mismatch: {py_score} vs {js_score}"
    print(f"  [PASS] {name:30}: {js_class:8} (Score: {js_score:3}/100, Max delta: {delta:.2e})")

# -- Stratified Randomized Testing (120 Scenarios: 30 per risk tier) ---------
np.random.seed(1337)
random_cases = []

# 30 Low risk scenarios (clear / light conditions)
for _ in range(30):
    random_cases.append([
        float(np.random.uniform(0, 4)),       # rainfall
        float(np.random.uniform(0, 8)),       # forecastRainfall
        float(np.random.uniform(20, 65)),     # humidity
        float(np.random.uniform(0, 18)),      # windSpeed
        float(np.random.uniform(0, 25)),      # historicalRisk
        float(np.random.uniform(0, 10)),      # terrainSlope
        float(np.random.uniform(15, 36)),     # temperature
        float(np.random.uniform(1008, 1025)), # pressure
    ])

# 30 Moderate risk scenarios
for _ in range(30):
    random_cases.append([
        float(np.random.uniform(10, 30)),     # rainfall
        float(np.random.uniform(12, 35)),     # forecastRainfall
        float(np.random.uniform(65, 85)),     # humidity
        float(np.random.uniform(20, 45)),     # windSpeed
        float(np.random.uniform(25, 50)),     # historicalRisk
        float(np.random.uniform(5, 20)),      # terrainSlope
        float(np.random.uniform(18, 32)),     # temperature
        float(np.random.uniform(1000, 1012)), # pressure
    ])

# 30 High risk scenarios
for _ in range(30):
    random_cases.append([
        float(np.random.uniform(35, 70)),     # rainfall
        float(np.random.uniform(40, 80)),     # forecastRainfall
        float(np.random.uniform(80, 95)),     # humidity
        float(np.random.uniform(45, 75)),     # windSpeed
        float(np.random.uniform(50, 75)),     # historicalRisk
        float(np.random.uniform(15, 35)),     # terrainSlope
        float(np.random.uniform(20, 30)),     # temperature
        float(np.random.uniform(990, 1005)),  # pressure
    ])

# 30 Severe risk scenarios (cyclonic / extreme precipitation)
for _ in range(30):
    random_cases.append([
        float(np.random.uniform(80, 250)),    # rainfall
        float(np.random.uniform(90, 300)),    # forecastRainfall
        float(np.random.uniform(90, 100)),    # humidity
        float(np.random.uniform(75, 140)),    # windSpeed
        float(np.random.uniform(70, 100)),    # historicalRisk
        float(np.random.uniform(25, 60)),     # terrainSlope
        float(np.random.uniform(18, 28)),     # temperature
        float(np.random.uniform(930, 990)),   # pressure
    ])

print(f"\n-- Testing {len(random_cases)} Randomized Physical Scenarios --")
max_prob_diff = 0.0
class_matches = 0
score_diffs = []
class_distribution = {c: 0 for c in classes}

for case in random_cases:
    py_probs = py_model.predict_proba([case])[0]
    py_class = classes[np.argmax(py_probs)]
    py_score = int(round(sum(risk_weights[classes[i]] * py_probs[i] for i in range(4))))

    js_probs, js_class, js_score = evaluate_js_trees(case)
    delta = np.max(np.abs(py_probs - js_probs))
    if delta > max_prob_diff:
        max_prob_diff = delta

    if py_class == js_class:
        class_matches += 1
    score_diffs.append(abs(py_score - js_score))
    class_distribution[js_class] += 1

print(f"[RESULTS] Evaluated {len(random_cases)} scenarios:")
print(f"  * Maximum probability delta: {max_prob_diff:.8f}")
print(f"  * Class prediction matches: {class_matches}/{len(random_cases)} ({class_matches/len(random_cases)*100:.1f}%)")
print(f"  * Maximum risk score delta: {max(score_diffs)} points")
print(f"  * Class distribution observed:")
for c, count in class_distribution.items():
    print(f"      - {c:10}: {count:3} cases ({count/len(random_cases)*100:.1f}%)")

assert max_prob_diff < 0.0001, f"Probability delta exceeds tolerance: {max_prob_diff}"
assert class_matches == len(random_cases), f"Class predictions mismatched: {class_matches}/{len(random_cases)}"
assert max(score_diffs) == 0, f"Score differences detected: {max(score_diffs)}"

# Confirm all 4 classes were actively tested and resolved
for c in classes:
    assert class_distribution[c] > 0, f"Class {c} was never exercised during testing!"

print("\n================================================================================")
print("[SUCCESS] COMPREHENSIVE ML PARITY VERIFIED: 100% FAITHFUL REPRODUCTION!")
print("================================================================================")
