"""
SKYRA – Export Trained XGBoost Model for Browser Offline Inference (Phase 4)
─────────────────────────────────────────────────────────────────────────────
Extracts decision tree structures and metadata from the trained XGBoost model
into a standalone, zero-dependency JSON bundle for faithful client-side inference.
"""

import os
import json
import joblib
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "xgboost_model.pkl")
OUTPUT_DIR = os.path.join(BASE_DIR, "..", "frontend", "public", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "xgboost_risk_model.json")

print(f"Loading model from: {MODEL_PATH}")
model = joblib.load(MODEL_PATH)

# Dump XGBoost model to temporary json
temp_json = os.path.join(BASE_DIR, "temp_xgb_dump.json")
model.save_model(temp_json)

with open(temp_json, "r") as f:
    raw_xgb = json.load(f)

if os.path.exists(temp_json):
    os.remove(temp_json)

# Extract core tree inference artifacts
learner = raw_xgb["learner"]
gbtree = learner["gradient_booster"]["model"]
trees = gbtree["trees"]
tree_info = gbtree["tree_info"]

# Parse base score array: '[2.4567003E0,1.3179876E0,-8.9125085E-1,-2.8834362E0]'
base_score_raw = learner["learner_model_param"]["base_score"]
base_score_str = base_score_raw.strip("[]")
base_scores = [float(s.strip()) for s in base_score_str.split(",")]

# Optimize tree representation for small footprint in browser
compact_trees = []
for t in trees:
    compact_trees.append({
        "l": t["left_children"],
        "r": t["right_children"],
        "f": t["split_indices"],
        "c": [round(float(v), 6) for v in t["split_conditions"]],
    })

bundle = {
    "modelName": "XGBoost Disaster Risk Classifier",
    "modelVersion": "2.0.0",
    "dataset": "ERA5-MultiCity-2021-2023",
    "classes": ["Low", "Moderate", "High", "Severe"],
    "features": [
        "rainfall",
        "forecastRainfall",
        "humidity",
        "windSpeed",
        "historicalRisk",
        "terrainSlope",
        "temperature",
        "pressure"
    ],
    "riskWeights": {
        "Low": 20,
        "Moderate": 45,
        "High": 70,
        "Severe": 95
    },
    "baseScores": base_scores,
    "treeInfo": tree_info,
    "trees": compact_trees,
}

with open(OUTPUT_PATH, "w") as f:
    json.dump(bundle, f)

print(f"[OK] Successfully exported faithful model bundle to: {OUTPUT_PATH}")
print(f"Bundle size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB, Total trees: {len(compact_trees)}")
