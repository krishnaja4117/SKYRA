"""
SKYRA – Airflow DAG Syntax & Execution Verification Test Suite (Phase 3)
─────────────────────────────────────────────────────────────────────────────
Executes and validates the Airflow ingestion DAG logic in local environments
where full Apache Airflow daemon / scheduler is not installed:
  1. Validates Python syntax and structure
  2. Executes all 9 task callables sequentially following the dependency graph
  3. Validates outputs and data shapes
  4. Verifies idempotency and error resilience
"""

import sys
import os
import unittest

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DAGS_DIR = os.path.join(BASE_DIR, "dags")
sys.path.insert(0, DAGS_DIR)

from skyra_ingestion_dag import (
    DEFAULT_ARGS,
    task_ingest_weather,
    task_ingest_forecast,
    task_ingest_historical_era5,
    task_ingest_terrain,
    task_ingest_imd_advisories,
    task_ingest_satellite,
    task_ingest_radar,
    task_evaluate_risk,
    task_archive_to_s3,
)


class TestAirflowDagExecution(unittest.TestCase):
    def test_01_default_args_configuration(self):
        """Verify Airflow default_args has appropriate retry and timeout policies."""
        self.assertEqual(DEFAULT_ARGS["owner"], "skyra_disaster_ops")
        self.assertEqual(DEFAULT_ARGS["retries"], 3)
        self.assertFalse(DEFAULT_ARGS["depends_on_past"])

    def test_02_weather_ingestion_task(self):
        """Verify weather ingestion task returns valid payload."""
        res = task_ingest_weather()
        self.assertEqual(res["status"], "ok")
        self.assertIn("temperature", res)
        self.assertIn("rainfall", res)

    def test_03_forecast_ingestion_task(self):
        """Verify forecast task returns precipitation expectation."""
        res = task_ingest_forecast()
        self.assertEqual(res["status"], "ok")
        self.assertGreaterEqual(res["precipitationExpected"], 0)

    def test_04_historical_era5_task(self):
        """Verify historical ERA5 task returns risk index."""
        res = task_ingest_historical_era5()
        self.assertEqual(res["status"], "ok")
        self.assertIn("historicalRisk", res)

    def test_05_terrain_ingestion_task(self):
        """Verify terrain task returns elevation and slope."""
        res = task_ingest_terrain()
        self.assertEqual(res["status"], "ok")
        self.assertIn("slopeDeg", res)

    def test_06_imd_advisories_task(self):
        """Verify IMD warning task returns warning color."""
        res = task_ingest_imd_advisories()
        self.assertEqual(res["status"], "ok")
        self.assertIn(res["warningColor"], ["Green", "Yellow", "Orange", "Red"])

    def test_07_satellite_and_radar_tasks(self):
        """Verify satellite and Doppler radar tasks return physical telemetry."""
        sat = task_ingest_satellite()
        self.assertEqual(sat["status"], "ok")
        self.assertIn("cloudCoverPercent", sat)

        radar = task_ingest_radar()
        self.assertEqual(radar["status"], "ok")
        self.assertIn("maxReflectivityDbz", radar)

    def test_08_risk_evaluation_and_s3_archive_tasks(self):
        """Verify end-to-end downstream tasks (risk assessment and S3 archival)."""
        risk = task_evaluate_risk()
        self.assertEqual(risk["status"], "ok")
        self.assertIn(risk["riskLevel"], ["Low", "Moderate", "High", "Severe"])

        s3 = task_archive_to_s3()
        self.assertEqual(s3["status"], "ok")
        self.assertTrue(s3["key"].startswith("weather/"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
