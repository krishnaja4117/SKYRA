"""
SKYRA – Offline ML Risk Engine Parity Verification Test (Phase 4)
─────────────────────────────────────────────────────────────────
Validates that the exported JSON decision tree bundle reproduces Python
XGBoost model predictions, classes, and risk scores with high mathematical parity.
"""

import os
import json
import joblib
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "xgboost_model.pkl")
BUNDLE_PATH = os.path.join(BASE_DIR, "..", "frontend", "public", "models", "xgboost_risk_model.json")

print("[TEST] Loading native Python XGBoost model...")
py_model = joblib.load(MODEL_PATH)

print("[TEST] Loading exported browser bundle...")
with open(BUNDLE_PATH, "r") as f:
    bundle = json.load(f)

base_scores = bundle["baseScores"]
trees = bundle["trees"]
tree_info = bundle["treeInfo"]
classes = bundle["classes"]
risk_weights = bundle["riskWeights"]

def js_eval(features):
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
    exp_m = np.exp(margins - np.max(margins))
    probs = exp_m / np.sum(exp_m)
    best_cls = classes[np.argmax(probs)]
    score = int(round(sum(risk_weights[classes[i]] * probs[i] for i in range(4))))
    return probs, best_cls, score

# Generate 50 representative scenarios covering normal, moderate, extreme, and edge conditions
test_cases = [
    # Baseline low risk
    [0.0, 0.0, 45.0, 10.0, 15.0, 2.0, 26.0, 1012.0],
    # Light rain
    [5.0, 10.0, 65.0, 15.0, 20.0, 5.0, 28.0, 1008.0],
    # Moderate rain & wind
    [25.0, 35.0, 80.0, 35.0, 40.0, 12.0, 24.0, 1002.0],
    # Heavy monsoonal rain
    [75.0, 90.0, 92.0, 55.0, 65.0, 18.0, 22.0, 995.0],
    # Severe cyclonic extreme
    [180.0, 220.0, 98.0, 95.0, 85.0, 28.0, 21.0, 978.0],
    # Steep slope landslide risk
    [45.0, 60.0, 88.0, 30.0, 75.0, 35.0, 19.0, 998.0],
    # Heatwave dry condition
    [0.0, 0.0, 20.0, 8.0, 10.0, 3.0, 42.0, 1006.0],
    # Cold highland condition
    [10.0, 15.0, 70.0, 25.0, 30.0, 15.0, 5.0, 1020.0],
]

# Add randomized bounded test cases to total 50
np.random.seed(42)
for _ in range(42):
    test_cases.append([
        float(np.random.uniform(0, 150)),   # rainfall
        float(np.random.uniform(0, 180)),   # forecastRainfall
        float(np.random.uniform(20, 100)),  # humidity
        float(np.random.uniform(0, 80)),    # windSpeed
        float(np.random.uniform(0, 90)),    # historicalRisk
        float(np.random.uniform(0, 40)),    # terrainSlope
        float(np.random.uniform(10, 45)),   # temperature
        float(np.random.uniform(960, 1030)),# pressure
    ])

max_prob_diff = 0.0
class_matches = 0
score_diffs = []

for idx, case in enumerate(test_cases):
    py_probs = py_model.predict_proba([case])[0]
    py_pred_idx = np.argmax(py_probs)
    py_class = classes[py_pred_idx]
    py_score = int(round(sum(risk_weights[classes[i]] * py_probs[i] for i in range(4))))

    js_probs, js_class, js_score = js_eval(case)

    prob_diff = np.max(np.abs(py_probs - js_probs))
    if prob_diff > max_prob_diff:
        max_prob_diff = prob_diff

    if py_class == js_class:
        class_matches += 1
    score_diffs.append(abs(py_score - js_score))

print(f"[TEST RESULTS] Evaluated {len(test_cases)} representative scenarios:")
print(f"  • Maximum probability difference: {max_prob_diff:.8f}")
print(f"  • Class prediction matches: {class_matches}/{len(test_cases)} ({class_matches/len(test_cases)*100:.1f}%)")
print(f"  • Maximum score difference: {max(score_diffs)} points")

assert max_prob_diff < 0.0001, f"Probability diff too high: {max_prob_diff}"
assert class_matches == len(test_cases), f"Class mismatch detected: {class_matches}/{len(test_cases)}"
assert max(score_diffs) == 0, f"Score mismatch detected: {max(score_diffs)}"

print("[SUCCESS] 100% FAITHFUL PARITY CONFIRMED across all 50 scenarios!")
