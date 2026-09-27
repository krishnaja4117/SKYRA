# SKYRA — Meteorological Dataset Pipeline Specification & Severe-Risk Analysis
**Status:** Canonical Reference Specification  
**Component:** ML Training Data Ingestion & Evaluation Pipeline  
**Aligned Standards:** IMD Observatory Protocols, WMO-No. 558, NDMA National Disaster Statistics  

---

## 1. Executive Summary & Severe Data Audit Findings

A rigorous audit of the historical training dataset (`ml/data/skyra_historical_weather_dataset.csv`) revealed the following verified properties:
- **Total Records:** 5,320 daily samples across 5 Indian metropolitan cities (Chennai, Mumbai, Bengaluru, Kolkata, Delhi) spanning 2021-01-01 to 2023-12-31.
- **Class Distribution:**
  - `Low`: 3,892 samples (73.16%)
  - `Moderate`: 1,188 samples (22.33%)
  - `High`: 221 samples (4.15%)
  - `Severe`: 19 samples (0.36%)
- **Test Evaluation:** In an 80/20 stratified split ($N_{test} = 1,064$), the `Severe` test set consists of only $N = 4$ samples.
- **Observed Recall:** Both calibrated Random Forest and calibrated XGBoost models achieve 0% recall ($0/4$) on `Severe`, classifying all 4 samples as `High` (with elevated Severe posterior probabilities between 10% and 26%).
- **Nature of Target Labels:** Historical labels in the current baseline are rule-derived pseudo-labels based on composite rainfall, wind, humidity, and barometric pressure thresholds. **They are not direct observations of physical inundation, infrastructure collapse, or emergency mobilization.**

### Scientific Conclusion: Severe Risk is NOT "Solved"
SKYRA does not claim that Severe extreme-event prediction is solved. High overall test accuracy (97.7% RF, 99.4% XGB) is driven by the predominant Low/Moderate classes. Extreme weather prediction requires specialized handling, high-frequency extreme event catalogs, and physical hydro-meteorological indicators.

---

## 2. Ingestion Pipeline Schema for Future Datasets

Future dataset ingestion and model evaluation (e.g. AIKosh, IMD Gridded Data 0.25°, NDMA Incident Repositories, CWC Hydrology, NRSC/ISRO NDEM Flood Inundation, IMD/RSMC Cyclone Best-Track) must strictly follow this metadata and validation schema:

```json
{
  "datasetMetadata": {
    "source": "India Meteorological Department / Open-Meteo ERA5 / CWC / NDMA / NRSC ISRO / RSMC",
    "license": "Government Open Data License - India (GODL) / CC-BY 4.0",
    "provenanceUrl": "https://data.gov.in or https://mausam.imd.gov.in",
    "geographicCoverage": {
      "type": "Polygon" | "PointArray",
      "citiesOrDistricts": ["Chennai", "Mumbai", "Kolkata", "Delhi", "Bengaluru"],
      "boundingCoordinates": { "latMin": 8.0, "latMax": 37.0, "lonMin": 68.0, "lonMax": 97.5 }
    },
    "temporalCoverage": {
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "resolution": "Hourly" | "Daily",
      "missingIntervalsHandled": true
    },
    "variables": [
      { "name": "rainfall", "unit": "mm", "minValid": 0.0, "maxValid": 1500.0 },
      { "name": "forecastRainfall", "unit": "mm", "minValid": 0.0, "maxValid": 1500.0 },
      { "name": "humidity", "unit": "%", "minValid": 0.0, "maxValid": 100.0 },
      { "name": "windSpeed", "unit": "km/h", "minValid": 0.0, "maxValid": 350.0 },
      { "name": "historicalRisk", "unit": "index_0_100", "minValid": 0.0, "maxValid": 100.0 },
      { "name": "terrainSlope", "unit": "degrees", "minValid": 0.0, "maxValid": 90.0 },
      { "name": "temperature", "unit": "celsius", "minValid": -20.0, "maxValid": 60.0 },
      { "name": "pressure", "unit": "hPa", "minValid": 850.0, "maxValid": 1080.0 }
    ],
    "labelDefinition": {
      "type": "OBSERVED_DISASTER_IMPACT" | "RULE_DERIVED_PSEUDO_LABEL",
      "description": "Must disclose if labels represent actual flood/cyclone damage or meteorological threshold rules.",
      "classes": ["Low", "Moderate", "High", "Severe"]
    }
  }
}
```

---

## 3. Strict Quality Checks & Anti-Leakage Constraints

1. **No Spatial or Geographic Leakage:**
   - Training and test splits must be spatially separated (e.g. Leave-One-City-Out) or temporally split by continuous blocks (e.g. Train on 2021–2022, Test on 2023) rather than random naive row-level shuffling which leaks autoregressive weather states.
2. **Physical Feasibility Gating:**
   - Any synthetic or interpolated records must obey thermodynamic and atmospheric physical constraints (e.g. relative humidity cannot exceed 100%; barometric pressure below 900 hPa is rejected unless tied to verified Category 4+ cyclone landfalls).
3. **No Blind SMOTE on Physical Data:**
   - Standard SMOTE produces linear combinations of feature vectors that do not exist in atmospheric physics (e.g. pairing 0°C temperature with 95% humidity and 150 mm convective rain at sea level). Resampling must use calibrated class weights (`class_weight='balanced'`) or physics-consistent synthetic samples.
4. **Zero Silent Fallback:**
   - Pipeline must throw explicit errors on missing or out-of-bounds inputs rather than defaulting to Bhubaneswar or median coordinates.

---

## 4. Current Model Deployment Policy

- **Active Production Model:** Calibrated Random Forest (`CalibratedClassifierCV(RandomForestClassifier)`).
- **Secondary Model:** Calibrated XGBoost (`CalibratedClassifierCV(XGBClassifier)`).
- **Runtime Selector:** Exposed on `/predict` via parameter `model: "random_forest" | "xgboost" | "ensemble"` (default is `"random_forest"`).
- **Model Provenance:** Returned on every prediction:
  ```json
  {
    "modelProvenance": {
      "modelSelected": "random_forest",
      "modelType": "CalibratedClassifierCV(RandomForestClassifier)",
      "calibrationMethod": "sigmoid",
      "featuresEvaluated": 8
    }
  }
  ```
