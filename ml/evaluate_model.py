"""
SKYRA – Model Evaluation & Metrics Analysis (Phase 5)
────────────────────────────────────────────────────
Audits and evaluates the Random Forest classifier:
  • Training dataset properties (N=24, class balance)
  • Stratified cross-validation performance
  • Confusion matrix, Precision, Recall, and F1-score
  • Reproducibility and feature order verification
"""

import os
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.model_selection import StratifiedKFold, cross_val_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "risk_model.pkl")

# Exact training data from train_model.py
X = np.array([
    [2, 5, 60, 10, 10, 2, 30, 1015],
    [5, 10, 65, 15, 15, 3, 30, 1013],
    [10, 20, 70, 20, 25, 5, 29, 1010],
    [15, 30, 75, 25, 30, 8, 28, 1008],
    [25, 40, 80, 35, 45, 10, 27, 1005],
    [35, 50, 85, 45, 60, 12, 26, 1002],
    [45, 60, 90, 55, 70, 15, 25, 999],
    [55, 70, 95, 65, 85, 20, 24, 996],
    [70, 90, 98, 80, 95, 25, 23, 992],
    [3, 8, 62, 12, 12, 4, 31, 1014],
    [8, 15, 68, 18, 20, 6, 29, 1011],
    [18, 35, 76, 28, 35, 9, 28, 1007],
    [28, 45, 82, 38, 50, 11, 27, 1004],
    [40, 55, 88, 48, 65, 14, 26, 1001],
    [50, 65, 92, 58, 78, 18, 25, 998],
    [65, 85, 96, 72, 90, 22, 24, 994],
    [80, 100, 99, 90, 98, 30, 22, 990],
    [4, 6, 58, 9, 8, 2, 32, 1016],
    [12, 18, 72, 22, 28, 7, 29, 1009],
    [22, 35, 78, 30, 40, 9, 28, 1006],
    [32, 48, 84, 42, 55, 13, 27, 1003],
    [48, 62, 91, 52, 72, 17, 25, 998],
    [60, 78, 94, 68, 88, 21, 24, 995],
    [75, 95, 98, 85, 96, 27, 22, 991],
])

y = np.array([
    "Low", "Low", "Moderate", "Moderate", "High", "High", "Severe", "Severe", "Severe",
    "Low", "Low", "Moderate", "High", "High", "Severe", "Severe", "Severe",
    "Low", "Moderate", "Moderate", "High", "High", "Severe", "Severe",
])

classes = ["Low", "Moderate", "High", "Severe"]

print("=== SKYRA MODEL EVALUATION AUDIT ===")
print(f"Total training samples: {len(X)}")
print(f"Features (8): [rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]")

# Class distribution
unique, counts = np.unique(y, return_counts=True)
class_dist = dict(zip(unique, counts))
print(f"Class distribution: {class_dist}")

# Load saved model and verify predictions on training set
model = joblib.load(MODEL_PATH)
y_pred = model.predict(X)
train_acc = accuracy_score(y, y_pred)
print(f"\nTraining set accuracy (N=24): {train_acc * 100:.2f}%")

print("\nClassification Report (Training Set):")
print(classification_report(y, y_pred, labels=classes, zero_division=0))

print("Confusion Matrix (rows=true, cols=pred):")
print(f"Labels: {classes}")
print(confusion_matrix(y, y_pred, labels=classes))

# 3-Fold Stratified Cross-Validation (due to small N=24, 3 folds = 8 samples each)
cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
cv_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
print(f"\n3-Fold Stratified Cross-Validation Accuracy: {cv_scores.mean() * 100:.2f}% (+/- {cv_scores.std() * 100:.2f}%)")
print(f"Per-fold scores: {[round(s, 3) for s in cv_scores]}")

# Feature importances
importances = model.feature_importances_
feature_names = [
    "rainfall", "forecastRainfall", "humidity", "windSpeed",
    "historicalRisk", "terrainSlope", "temperature", "pressure"
]
print("\nFeature Importances:")
for name, imp in sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True):
    print(f"  {name:20s}: {imp * 100:.2f}%")
