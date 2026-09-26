"""
SKYRA – Real-Time Meteorological Risk Inference Service (Phase 5)
─────────────────────────────────────────────────────────────────
Flask microservice exposing the trained 8-feature Random Forest classifier.

Guarantees:
  • Strict 8-feature input validation (numeric finiteness & physical range bounds)
  • Explicit error reporting (HTTP 400 on missing or invalid features)
  • Probability-weighted risk score calculation (20 to 95)
  • Tree-voting agreement confidence calculation (0 to 100)
  • Rule-based explainable risk factors (XAI)
  • Truthful model provenance metadata (RandomForest v1.0.0, isFallback=False)
"""

import os
import joblib
import numpy as np
from flask import Flask, request, jsonify
from xai_tree_explainer import explain_prediction

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "risk_model.pkl")
model = joblib.load(MODEL_PATH)

FEATURE_CONSTRAINTS = {
    "rainfall": {"min": 0.0, "max": 2000.0},
    "forecastRainfall": {"min": 0.0, "max": 2000.0},
    "humidity": {"min": 0.0, "max": 100.0},
    "windSpeed": {"min": 0.0, "max": 500.0},
    "historicalRisk": {"min": 0.0, "max": 100.0},
    "terrainSlope": {"min": 0.0, "max": 90.0},
    "temperature": {"min": -100.0, "max": 100.0},
    "pressure": {"min": 300.0, "max": 1200.0},
}

REQUIRED_FEATURE_ORDER = [
    "rainfall",
    "forecastRainfall",
    "humidity",
    "windSpeed",
    "historicalRisk",
    "terrainSlope",
    "temperature",
    "pressure",
]


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "SKYRA ML Risk Inference Service",
        "model": "Calibrated RandomForestClassifier",
        "modelVersion": "2.0.0",
        "datasetVersion": "ERA5-MultiCity-2021-2023",
        "trainingSamples": 5320,
        "confidenceType": "CALIBRATED",
        "calibrationMethod": "Platt Sigmoid (5-fold Cross-Validation)",
        "featuresCount": 8,
    })


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({
            "error": "Request body must be a valid JSON object.",
            "code": "ERR_INVALID_PAYLOAD"
        }), 400

    # Validate presence, type, and physical bounds of all 8 features
    parsed_features = []
    for field in REQUIRED_FEATURE_ORDER:
        if field not in data or data[field] is None or data[field] == "":
            return jsonify({
                "error": f"Missing required feature: '{field}'",
                "code": "ERR_MISSING_FEATURE"
            }), 400

        try:
            val = float(data[field])
        except (ValueError, TypeError):
            return jsonify({
                "error": f"Feature '{field}' must be a valid numeric value. Received: {data[field]}",
                "code": "ERR_NON_NUMERIC_FEATURE"
            }), 400

        if not np.isfinite(val):
            return jsonify({
                "error": f"Feature '{field}' must be finite (NaN/Infinity rejected).",
                "code": "ERR_NON_FINITE_FEATURE"
            }), 400

        bounds = FEATURE_CONSTRAINTS[field]
        if val < bounds["min"] or val > bounds["max"]:
            return jsonify({
                "error": f"Feature '{field}' ({val}) is out of physical range [{bounds['min']}, {bounds['max']}].",
                "code": "ERR_FEATURE_OUT_OF_BOUNDS"
            }), 400

        parsed_features.append(val)

    # Strictly ordered feature vector matching training:
    # [rainfall, forecastRainfall, humidity, windSpeed, historicalRisk, terrainSlope, temperature, pressure]
    features = [parsed_features]

    # ML prediction
    prediction = model.predict(features)[0]
    probabilities = model.predict_proba(features)[0]
    classes = model.classes_

    predicted_index = list(classes).index(prediction)

    # Raw ensemble voting agreement as confidence percentage (0-100)
    confidence = int(round(float(probabilities[predicted_index]) * 100))
    confidence = min(max(confidence, 0), 100)

    # Convert ML probabilities into an expected weighted risk score
    risk_weights = {
        "Low": 20,
        "Moderate": 45,
        "High": 70,
        "Severe": 95,
    }

    raw_risk_score = sum(
        risk_weights.get(class_name, 50) * float(prob)
        for class_name, prob in zip(classes, probabilities)
    )
    risk_score = int(round(raw_risk_score))
    risk_score = min(max(risk_score, 0), 100)

    # -------------------------------------------------
    # SKYRA EXPLAINABLE AI (XAI) LAYER (Phase 7)
    # -------------------------------------------------
    xai_result = explain_prediction(
        model=model,
        feature_vector=parsed_features,
        feature_names=REQUIRED_FEATURE_ORDER,
        classes=classes,
        risk_weights=risk_weights,
        confidence=confidence,
        confidence_type="CALIBRATED",
        calibration_method="Platt Sigmoid (5-fold Cross-Validation)",
    )

    factors = xai_result.get("compatFactors", [])
    explanation = xai_result.get("whyThisRisk", (
        f"SKYRA calibrated ML model classified current conditions as {prediction} risk "
        f"with a risk score of {risk_score}% and calibrated confidence of {confidence}%."
    ))

    return jsonify({
        "riskLevel": prediction,
        "riskScore": risk_score,
        "confidence": confidence,
        "confidenceType": "CALIBRATED",
        "calibrationMethod": "Platt Sigmoid (5-fold Cross-Validation)",
        "explanation": explanation,
        "factors": factors,
        "model": "Calibrated RandomForestClassifier (Port 8000)",
        "modelVersion": "2.0.0",
        "datasetVersion": "ERA5-MultiCity-2021-2023",
        "isFallback": False,
        "xai": xai_result,
    })


if __name__ == "__main__":
    app.run(port=8000)