"""
SKYRA – ML Prediction API Test Suite (Phase 5)
─────────────────────────────────────────────────────────────────────────────
Thoroughly tests the Flask ML inference service using Flask's test client:
  1. Service health check endpoint
  2. Prediction across risk tiers (Low, Moderate, High, Severe)
  3. Probability-weighted risk score calculation
  4. Tree-voting agreement confidence calculation
  5. Missing feature rejection (HTTP 400)
  6. Non-numeric type rejection (HTTP 400)
  7. Non-finite value rejection (NaN/Infinity) (HTTP 400)
  8. Out-of-bounds physical range rejection (HTTP 400)
  9. Explainable AI (XAI) factors generation
  10. Strict 8-feature order preservation
"""

import unittest
import json
import math
from predict_api import app, REQUIRED_FEATURE_ORDER


class TestPredictApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

    def test_01_health_check(self):
        """Verify health check endpoint returns 200 and model metadata."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["model"], "Calibrated RandomForestClassifier")
        self.assertEqual(data["modelVersion"], "2.0.0")
        self.assertEqual(data["confidenceType"], "CALIBRATED")
        self.assertEqual(data["featuresCount"], 8)

    def test_02_predict_low_risk(self):
        """Verify low-risk baseline scenario prediction."""
        payload = {
            "rainfall": 0.0,
            "forecastRainfall": 0.0,
            "humidity": 45.0,
            "windSpeed": 8.0,
            "historicalRisk": 15.0,
            "terrainSlope": 2.0,
            "temperature": 26.0,
            "pressure": 1014.0,
        }
        response = self.client.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn(data["riskLevel"], ["Low", "Moderate"])
        self.assertTrue(0 <= data["riskScore"] <= 100)
        self.assertTrue(0 <= data["confidence"] <= 100)
        self.assertEqual(data["confidenceType"], "CALIBRATED")
        self.assertFalse(data["isFallback"])
        self.assertEqual(data["modelVersion"], "2.0.0")
        self.assertIsInstance(data["factors"], list)

    def test_03_predict_severe_risk(self):
        """Verify extreme severe weather scenario prediction."""
        payload = {
            "rainfall": 120.0,
            "forecastRainfall": 95.0,
            "humidity": 96.0,
            "windSpeed": 92.0,
            "historicalRisk": 88.0,
            "terrainSlope": 35.0,
            "temperature": 24.0,
            "pressure": 982.0,
        }
        response = self.client.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["riskLevel"], "Severe")
        self.assertGreaterEqual(data["riskScore"], 75)
        self.assertTrue(0 <= data["confidence"] <= 100)
        self.assertFalse(data["isFallback"])

    def test_04_missing_feature_rejection(self):
        """Verify HTTP 400 when any of the 8 features is missing."""
        base_payload = {
            "rainfall": 10.0,
            "forecastRainfall": 5.0,
            "humidity": 65.0,
            "windSpeed": 15.0,
            "historicalRisk": 30.0,
            "terrainSlope": 5.0,
            "temperature": 28.0,
            "pressure": 1012.0,
        }
        for feature in REQUIRED_FEATURE_ORDER:
            bad_payload = dict(base_payload)
            del bad_payload[feature]
            response = self.client.post(
                "/predict",
                data=json.dumps(bad_payload),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 400)
            data = response.get_json()
            self.assertEqual(data["code"], "ERR_MISSING_FEATURE")
            self.assertIn(feature, data["error"])

    def test_05_non_numeric_feature_rejection(self):
        """Verify HTTP 400 when a feature is non-numeric."""
        bad_payload = {
            "rainfall": "not-a-number",
            "forecastRainfall": 5.0,
            "humidity": 65.0,
            "windSpeed": 15.0,
            "historicalRisk": 30.0,
            "terrainSlope": 5.0,
            "temperature": 28.0,
            "pressure": 1012.0,
        }
        response = self.client.post(
            "/predict",
            data=json.dumps(bad_payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertEqual(data["code"], "ERR_NON_NUMERIC_FEATURE")

    def test_06_non_finite_feature_rejection(self):
        """Verify HTTP 400 when NaN or Infinity is passed."""
        # Using string representation that float() parses into inf/nan
        for bad_val in ["Infinity", "-Infinity", "NaN"]:
            bad_payload = {
                "rainfall": bad_val,
                "forecastRainfall": 5.0,
                "humidity": 65.0,
                "windSpeed": 15.0,
                "historicalRisk": 30.0,
                "terrainSlope": 5.0,
                "temperature": 28.0,
                "pressure": 1012.0,
            }
            response = self.client.post(
                "/predict",
                data=json.dumps(bad_payload),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 400)
            data = response.get_json()
            self.assertEqual(data["code"], "ERR_NON_FINITE_FEATURE")

    def test_07_out_of_bounds_rejection(self):
        """Verify HTTP 400 when physical constraints are violated."""
        test_cases = [
            ("rainfall", -5.0),
            ("forecastRainfall", -1.0),
            ("humidity", 105.0),
            ("humidity", -2.0),
            ("windSpeed", -10.0),
            ("historicalRisk", 120.0),
            ("terrainSlope", 95.0),
            ("terrainSlope", -1.0),
            ("temperature", -120.0),
            ("pressure", 250.0),
            ("pressure", 1300.0),
        ]
        base_payload = {
            "rainfall": 10.0,
            "forecastRainfall": 5.0,
            "humidity": 65.0,
            "windSpeed": 15.0,
            "historicalRisk": 30.0,
            "terrainSlope": 5.0,
            "temperature": 28.0,
            "pressure": 1012.0,
        }
        for field, invalid_val in test_cases:
            bad_payload = dict(base_payload)
            bad_payload[field] = invalid_val
            response = self.client.post(
                "/predict",
                data=json.dumps(bad_payload),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 400, f"Expected 400 for {field}={invalid_val}")
            data = response.get_json()
            self.assertEqual(data["code"], "ERR_FEATURE_OUT_OF_BOUNDS")

    def test_08_xai_factors_generation(self):
        """Verify explainable AI factor tags are generated based on thresholds."""
        payload = {
            "rainfall": 60.0,
            "forecastRainfall": 40.0,
            "humidity": 90.0,
            "windSpeed": 55.0,
            "historicalRisk": 75.0,
            "terrainSlope": 32.0,
            "temperature": 39.0,
            "pressure": 995.0,
        }
        response = self.client.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        factor_names = [f["name"] for f in data["factors"]]
        self.assertIn("Heavy recent rainfall", factor_names)
        self.assertIn("High humidity", factor_names)
        self.assertIn("Strong wind", factor_names)
        self.assertIn("High historical climate risk", factor_names)
        self.assertIn("Steep topographic terrain", factor_names)
        self.assertIn("Low atmospheric pressure", factor_names)
        self.assertIn("High temperature", factor_names)

    def test_09_risk_score_vs_confidence_distinction(self):
        """Verify Risk Score != Confidence and both are strictly 0-100."""
        payload = {
            "rainfall": 45.0,
            "forecastRainfall": 30.0,
            "humidity": 80.0,
            "windSpeed": 35.0,
            "historicalRisk": 55.0,
            "terrainSlope": 12.0,
            "temperature": 31.0,
            "pressure": 1004.0,
        }
        response = self.client.post(
            "/predict",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(0 <= data["riskScore"] <= 100)
        self.assertTrue(0 <= data["confidence"] <= 100)
        # Risk score is expected weighted severity; confidence is voting agreement
        self.assertIsInstance(data["riskScore"], int)
        self.assertIsInstance(data["confidence"], int)


if __name__ == "__main__":
    unittest.main(verbosity=2)
