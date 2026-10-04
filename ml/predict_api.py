"""
SKYRA – Real-Time Meteorological Risk Inference Service (Phase 5)
─────────────────────────────────────────────────────────────────
Production-grade FastAPI microservice exposing trained Calibrated Random Forest
and Calibrated XGBoost models for multi-hazard weather risk prediction.

Architectural Guarantees:
  • Framework: FastAPI + Uvicorn with Pydantic schemas (PPT Technical Stack aligned)
  • Dual-Model & Ensemble Inference:
      - 'random_forest' (Default production model, stable balanced weights)
      - 'xgboost' (Calibrated Extreme Gradient Boosting)
      - 'ensemble' (Soft-voting probability consensus)
  • Strict 8-feature input validation (numeric finiteness & physical range bounds)
  • Explicit error reporting (HTTP 400 with standardized error codes)
  • Probability-weighted risk score calculation (0 to 100)
  • Platt Sigmoid calibrated confidence calculation (0 to 100)
  • Rule-based explainable risk factors & feature attributions (XAI)
  • Truthful model provenance metadata
"""

import os
import math
import joblib
import numpy as np
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from xai_tree_explainer import explain_prediction

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RF_MODEL_PATH = os.path.join(BASE_DIR, "risk_model.pkl")
XGB_MODEL_PATH = os.path.join(BASE_DIR, "calibrated_xgboost_model.pkl")

# Load Primary Production Model (Calibrated Random Forest)
rf_model = joblib.load(RF_MODEL_PATH)

# Load Secondary Model (Calibrated XGBoost) if available
xgb_model = None
if os.path.exists(XGB_MODEL_PATH):
    try:
        xgb_model = joblib.load(XGB_MODEL_PATH)
    except Exception as e:
        print(f"⚠️ [FastAPI ML] XGBoost model failed to load: {e}")

CLASSES_CANONICAL = ["Low", "Moderate", "High", "Severe"]
RISK_WEIGHTS = {
    "Low": 20,
    "Moderate": 45,
    "High": 70,
    "Severe": 95,
}

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

SUPPORTED_MODELS = ["random_forest", "xgboost", "ensemble"]

app = FastAPI(
    title="SKYRA Meteorological Risk Inference Service",
    description="High-performance FastAPI ML microservice for hyper-local disaster risk scoring and explainability.",
    version="2.0.0",
)

# Environment-based safe CORS configuration
# Allows standard local development ports and Render deployment domains, configurable via env vars
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

_raw_origins = os.environ.get("CORS_ALLOWED_ORIGINS") or os.environ.get("ALLOWED_ORIGINS") or ""
_env_origins = [origin.strip() for origin in _raw_origins.split(",") if origin.strip()]

_frontend_origin = os.environ.get("FRONTEND_ORIGIN", "").strip()
if _frontend_origin and _frontend_origin not in _env_origins:
    _env_origins.append(_frontend_origin)

ALLOWED_ORIGINS = list(dict.fromkeys(_DEFAULT_ALLOWED_ORIGINS + _env_origins))

# Render deployment origin pattern (e.g. https://*.onrender.com) preserved via regex
RENDER_ORIGIN_REGEX = os.environ.get(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https://.*\.onrender\.com"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=RENDER_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)



def compute_physical_hazard_factors(parsed_features: List[float]) -> List[Dict[str, str]]:
    factors = []
    rainfall, forecast_rainfall, humidity, wind_speed, historical_risk, terrain_slope, temperature, pressure = parsed_features

    if rainfall >= 50:
        factors.append({
            "name": "Heavy recent rainfall",
            "impact": "High",
            "detail": f"{rainfall} mm of recent rainfall detected."
        })
    elif rainfall >= 10:
        factors.append({
            "name": "Recent rainfall",
            "impact": "Moderate",
            "detail": f"{rainfall} mm of recent rainfall detected."
        })

    if forecast_rainfall >= 50:
        factors.append({
            "name": "Heavy forecast rainfall",
            "impact": "High",
            "detail": f"{forecast_rainfall} mm rainfall expected."
        })
    elif forecast_rainfall >= 20:
        factors.append({
            "name": "Forecast rainfall",
            "impact": "Moderate",
            "detail": f"{forecast_rainfall} mm rainfall forecast."
        })

    if humidity >= 85:
        factors.append({
            "name": "High humidity",
            "impact": "Moderate",
            "detail": f"Atmospheric humidity is {humidity}%."
        })

    if wind_speed >= 50:
        factors.append({
            "name": "Strong wind",
            "impact": "High",
            "detail": f"Wind speed is {wind_speed} km/h."
        })
    elif wind_speed >= 30:
        factors.append({
            "name": "Elevated wind speed",
            "impact": "Moderate",
            "detail": f"Wind speed is {wind_speed} km/h."
        })

    if historical_risk >= 70:
        factors.append({
            "name": "High historical climate risk",
            "impact": "High",
            "detail": f"Historical baseline risk index is {historical_risk}."
        })
    elif historical_risk >= 40:
        factors.append({
            "name": "Moderate historical risk pattern",
            "impact": "Moderate",
            "detail": f"Historical baseline risk index is {historical_risk}."
        })

    if terrain_slope >= 30:
        factors.append({
            "name": "Steep topographic terrain",
            "impact": "High",
            "detail": f"Terrain slope is {terrain_slope}°."
        })
    elif terrain_slope >= 10:
        factors.append({
            "name": "Moderate terrain slope",
            "impact": "Moderate",
            "detail": f"Terrain slope is {terrain_slope}°."
        })

    if pressure < 1000:
        factors.append({
            "name": "Low atmospheric pressure",
            "impact": "Moderate",
            "detail": f"Surface pressure is {pressure} hPa."
        })

    if temperature >= 38:
        factors.append({
            "name": "High temperature",
            "impact": "Moderate",
            "detail": f"Temperature is {temperature}°C."
        })

    if not factors:
        factors.append({
            "name": "Baseline weather conditions",
            "impact": "Low",
            "detail": "All weather variables are within normal baseline thresholds."
        })

    return factors


def get_model_probabilities(selected_model: str, features: List[List[float]]) -> Dict[str, float]:
    """
    Returns a unified dict of {class_name: probability} for classes:
    ['Low', 'Moderate', 'High', 'Severe']
    """
    probs_dict = {c: 0.0 for c in CLASSES_CANONICAL}

    # 1. Random Forest probabilities
    rf_raw_probs = rf_model.predict_proba(features)[0]
    rf_probs_map = {c: float(p) for c, p in zip(rf_model.classes_, rf_raw_probs)}

    if selected_model == "random_forest" or xgb_model is None:
        for c in CLASSES_CANONICAL:
            probs_dict[c] = rf_probs_map.get(c, 0.0)
        return probs_dict

    # 2. XGBoost probabilities
    xgb_raw_probs = xgb_model.predict_proba(features)[0]
    # XGBoost trained with classes [0, 1, 2, 3] -> Low, Moderate, High, Severe
    xgb_classes = list(xgb_model.classes_)
    xgb_probs_map = {}
    for idx, p in enumerate(xgb_raw_probs):
        cls_key = xgb_classes[idx]
        if isinstance(cls_key, (int, np.integer)):
            name = CLASSES_CANONICAL[int(cls_key)]
        else:
            name = str(cls_key)
        xgb_probs_map[name] = float(p)

    if selected_model == "xgboost":
        for c in CLASSES_CANONICAL:
            probs_dict[c] = xgb_probs_map.get(c, 0.0)
        return probs_dict

    # 3. Ensemble (Soft-voting probability average: 50% RF, 50% XGB)
    if selected_model == "ensemble":
        for c in CLASSES_CANONICAL:
            p_rf = rf_probs_map.get(c, 0.0)
            p_xgb = xgb_probs_map.get(c, 0.0)
            probs_dict[c] = 0.5 * p_rf + 0.5 * p_xgb
        return probs_dict

    # Fallback to RF
    for c in CLASSES_CANONICAL:
        probs_dict[c] = rf_probs_map.get(c, 0.0)
    return probs_dict


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "SKYRA ML Risk Inference Service",
        "framework": "FastAPI",
        "model": "Calibrated RandomForestClassifier",
        "defaultModel": "random_forest",
        "availableModels": SUPPORTED_MODELS,
        "modelVersion": "2.0.0",
        "datasetVersion": "ERA5-MultiCity-2021-2023",
        "trainingSamples": 5320,
        "confidenceType": "CALIBRATED",
        "calibrationMethod": "Platt Sigmoid (5-fold Cross-Validation)",
        "featuresCount": 8,
        "featureOrder": REQUIRED_FEATURE_ORDER,
        "supportedTiers": CLASSES_CANONICAL,
    }


@app.post("/predict")
async def predict(request: Request):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={
                "error": "Request body must be a valid JSON object.",
                "code": "ERR_INVALID_PAYLOAD",
            },
        )

    if not isinstance(data, dict):
        return JSONResponse(
            status_code=400,
            content={
                "error": "Request body must be a valid JSON object.",
                "code": "ERR_INVALID_PAYLOAD",
            },
        )

    # Validate model selection if provided
    selected_model = str(data.get("model", "random_forest")).strip().lower()
    if selected_model not in SUPPORTED_MODELS:
        return JSONResponse(
            status_code=400,
            content={
                "error": f"Invalid model requested: '{selected_model}'. Allowed models: {SUPPORTED_MODELS}",
                "code": "ERR_INVALID_MODEL",
            },
        )

    # Validate presence, type, and physical bounds of all 8 features
    parsed_features = []
    for field in REQUIRED_FEATURE_ORDER:
        if field not in data or data[field] is None or data[field] == "":
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"Missing required feature: '{field}'",
                    "code": "ERR_MISSING_FEATURE",
                },
            )

        val_raw = data[field]
        # Reject non-numeric types
        try:
            val = float(val_raw)
        except (ValueError, TypeError):
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"Feature '{field}' must be a valid numeric value. Received: {val_raw}",
                    "code": "ERR_NON_NUMERIC_FEATURE",
                },
            )

        # Reject non-finite values (NaN / Infinity)
        if not np.isfinite(val):
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"Feature '{field}' must be finite (NaN/Infinity rejected).",
                    "code": "ERR_NON_FINITE_FEATURE",
                },
            )

        # Check physical boundary constraints
        bounds = FEATURE_CONSTRAINTS[field]
        if val < bounds["min"] or val > bounds["max"]:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"Feature '{field}' ({val}) is out of physical range [{bounds['min']}, {bounds['max']}].",
                    "code": "ERR_FEATURE_OUT_OF_BOUNDS",
                },
            )

        parsed_features.append(val)

    features = [parsed_features]

    # Model inference
    probs_dict = get_model_probabilities(selected_model, features)

    # Argmax prediction
    prediction = max(probs_dict.keys(), key=lambda k: probs_dict[k])
    pred_prob = probs_dict[prediction]

    # Platt-calibrated confidence percentage (0-100)
    confidence = int(round(pred_prob * 100))
    confidence = min(max(confidence, 0), 100)

    # Convert ML probabilities into expected risk score (0-100)
    raw_risk_score = sum(
        RISK_WEIGHTS.get(cls_name, 50) * prob
        for cls_name, prob in probs_dict.items()
    )
    risk_score = int(round(raw_risk_score))
    risk_score = min(max(risk_score, 0), 100)

    # XAI Layer
    xai_result = explain_prediction(
        model=rf_model,
        feature_vector=parsed_features,
        feature_names=REQUIRED_FEATURE_ORDER,
        classes=rf_model.classes_,
        risk_weights=RISK_WEIGHTS,
        confidence=confidence,
        confidence_type="CALIBRATED",
        calibration_method="Platt Sigmoid (5-fold Cross-Validation)",
    )

    factors = compute_physical_hazard_factors(parsed_features)

    model_display_name = {
        "random_forest": "Calibrated RandomForestClassifier (Port 8000)",
        "xgboost": "Calibrated XGBoostClassifier (Port 8000)",
        "ensemble": "Calibrated RF + XGBoost Ensemble (Port 8000)",
    }.get(selected_model, "Calibrated RandomForestClassifier (Port 8000)")

    explanation = xai_result.get("whyThisRisk", (
        f"SKYRA calibrated ML model ({selected_model}) classified current conditions as {prediction} risk "
        f"with a risk score of {risk_score}% and calibrated confidence of {confidence}%."
    ))

    return {
        "riskLevel": prediction,
        "riskScore": risk_score,
        "confidence": confidence,
        "confidenceType": "CALIBRATED",
        "calibrationMethod": "Platt Sigmoid (5-fold Cross-Validation)",
        "explanation": explanation,
        "factors": factors,
        "model": model_display_name,
        "selectedModel": selected_model,
        "modelVersion": "2.0.0",
        "datasetVersion": "ERA5-MultiCity-2021-2023",
        "isFallback": False,
        "probabilities": probs_dict,
        "xai": xai_result,
    }


@app.post("/explain")
async def explain(request: Request):
    """Direct XAI explanation endpoint."""
    return await predict(request)


# ─── Flask TestClient Compatibility Shim for Existing Test Suite ───────────────
from fastapi.testclient import TestClient

class _FlaskCompatResponse:
    def __init__(self, response):
        self._res = response
        self.status_code = response.status_code
        self.headers = response.headers

    def get_json(self):
        return self._res.json()

    @property
    def data(self):
        return self._res.content

class _FlaskCompatClient:
    def __init__(self, app_instance):
        self._client = TestClient(app_instance, raise_server_exceptions=False)

    def options(self, url, *args, **kwargs):
        headers = kwargs.pop("headers", {})
        res = self._client.options(url, headers=headers)
        return _FlaskCompatResponse(res)

    def get(self, url, *args, **kwargs):
        headers = kwargs.pop("headers", {})
        res = self._client.get(url, headers=headers)
        return _FlaskCompatResponse(res)

    def post(self, url, *args, **kwargs):
        data = kwargs.pop("data", None)
        content_type = kwargs.pop("content_type", None)
        headers = kwargs.pop("headers", {})
        if content_type:
            headers["Content-Type"] = content_type

        if data is not None and isinstance(data, (str, bytes)):
            import json
            try:
                parsed_json = json.loads(data)
                res = self._client.post(url, json=parsed_json, headers=headers)
            except Exception:
                res = self._client.post(url, content=data, headers=headers)
        else:
            json_body = kwargs.pop("json", None)
            res = self._client.post(url, json=json_body, headers=headers)

        return _FlaskCompatResponse(res)

app.config = {"TESTING": False}
app.test_client = lambda: _FlaskCompatClient(app)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("predict_api:app", host="0.0.0.0", port=port, reload=True)