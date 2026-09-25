# SKYRA Data Flow Guide: Demo Mode vs. Online Mode

## Overview

SKYRA Dashboard supports two completely independent data modes:

1. **Demo Mode** - 100% offline, scenario-based, with fixed Chittur location
2. **Online Mode** - Live GPS/API-based with dynamic location-specific data

This guide ensures future development maintains strict isolation between these modes.

---

## Mode Selection

### Entering Demo Mode
```javascript
// From Dashboard or anywhere else
setDemoMode(true);
setDemoScenario("flooding"); // optional; defaults to "flooding"
```

**Result**: All components immediately switch to scenario data. No API calls, no GPS requests.

### Entering Online Mode
```javascript
setDemoMode(false);
```

**Result**: Pipeline resumes. Components receive live data from APIs and GPS.

### Checking Current Mode
```javascript
const { demo, demoScenario } = useGlobalAlert();
if (demo) {
  // Demo scenario: demoScenario = "flooding" | "heavyRain" | "cyclone" | "extremeHeat" | "severe"
}
```

---

## Data Pipeline Architecture

### Demo Mode Pipeline (Offline)

```
┌─────────────────────────────────────────────────────────────┐
│ Module Load: Pre-compute All 5 Scenarios                   │
├─────────────────────────────────────────────────────────────┤
│ _SCENARIO_INPUTS (lines 43–141)                            │
│   ├─ flooding: { rainfall, humidity, temp, wind, month,    │
│   │   mlRiskScore, mlRiskLevel, nearestShelter,            │
│   │   nearestHospital, ... }                               │
│   ├─ heavyRain: { ... }                                    │
│   ├─ cyclone: { ... }                                      │
│   ├─ extremeHeat: { ... }                                  │
│   └─ severe: { ... }                                       │
│                                                             │
│ ↓ Pure functions (no I/O)                                  │
│ _buildScenarioResult(scenario)  [line 165]                │
│   ├─ predictImpacts(scenario inputs)                       │
│   ├─ generateAdvice(scenario inputs)                       │
│   └─ Return complete result with shelter/hospital         │
│                                                             │
│ ↓ Store in memory                                          │
│ _SCENARIO_RESULTS = {                                      │
│   flooding: { weather, risk, advice, pred, hist, ... },   │
│   heavyRain: { ... },                                      │
│   cyclone: { ... },                                        │
│   extremeHeat: { ... },                                    │
│   severe: { ... },                                         │
│ }                                                           │
│                                                             │
│ All 5 scenarios ready instantly. No network delay.         │
└─────────────────────────────────────────────────────────────┘
                         ↓
              setDemoMode(true)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Runtime: Demo Mode Active                                  │
├─────────────────────────────────────────────────────────────┤
│ resolveDisplayValues(cache, demo, demoScenario)  [line 460]│
│   if (demo) return _SCENARIO_RESULTS[demoScenario];       │
│                                                             │
│ Dashboard receives:                                        │
│   {                                                        │
│     locationName: "Chittur (DEMO – Urban Flooding)",      │
│     temperature: 27,                                       │
│     humidity: 96,                                          │
│     wind: 55,                                              │
│     rainfall: 42,                                          │
│     mlRiskLevel: "Severe",                                │
│     mlRiskScore: 91,                                       │
│     mlConfidence: 88,                                      │
│     mapCenter: [10.7089, 76.7479],                        │
│     nearestShelter: "Chittur Community Hall, ...",        │
│     nearestHospital: "Chittur Medical Center, ...",       │
│     pred: { hazard: "Urban Flooding", ... },              │
│     advice: { do: [...], avoid: [...], ... },             │
│     hist: null,  // ← Demo scenarios don't compute history │
│     gpsSource: "demo_scenario",                           │
│     isDemo: true,                                         │
│     demoKey: "flooding",                                  │
│     demoLabel: "🌊 Urban Flooding",                       │
│     demoAlert: {                                          │
│       title: "🌊 Urban Flooding Warning",                │
│       message: "Flooding is simulated...",                │
│     },                                                    │
│   }                                                       │
│                                                           │
│ All data is self-contained, pre-computed, offline.       │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Dashboard Components Consume Demo Data                     │
├─────────────────────────────────────────────────────────────┤
│ const dv = resolveDisplayValues(cache, demo, demoScenario);│
│                                                             │
│ Current Weather Card:                                      │
│   displayWeather = demo ? dv : cache;  // ← uses dv       │
│   temp: 27°C, humidity: 96%, wind: 55 km/h, rain: 42 mm │
│                                                             │
│ Location Monitoring:                                       │
│   location: dv.locationName = "Chittur (DEMO – ...)"      │
│   gps: "Demo scenario"                                    │
│   accuracy: null                                          │
│                                                             │
│ Risk Level:                                                │
│   mlRiskScore: 91                                         │
│   mlRiskLevel: "Severe"                                   │
│   mlConfidence: 88%                                       │
│                                                             │
│ Emergency Status:                                          │
│   shelter: dv.nearestShelter = "Chittur Community Hall..." │
│   hospital: dv.nearestHospital = "Chittur Medical Ctr..." │
│                                                             │
│ Risk Map:                                                  │
│   mapCenter: [10.7089, 76.7479]  (Chittur, fixed)        │
│   isDemoScenario: true                                    │
│   CASE 1 executes: Uses fixed coords, never GPS          │
│                                                             │
│ All sections show consistent, offline Chittur data.       │
└─────────────────────────────────────────────────────────────┘
```

### Online Mode Pipeline (Live)

```
┌─────────────────────────────────────────────────────────────┐
│ setDemoMode(false)                                         │
├─────────────────────────────────────────────────────────────┤
│ if (_demoMode) return;  ← Pipeline guard blocks demo mode  │
│                                                             │
│ Otherwise: runPipeline() executes  [line 280]             │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. Resolve Location                                        │
├─────────────────────────────────────────────────────────────┤
│ Priority: Manual city search > GPS > DEMO fallback        │
│                                                             │
│ if (_manualLocation) {                                     │
│   loc = { latitude, longitude, city: manualLocation }     │
│ } else {                                                   │
│   loc = await getCurrentLocationOrFallback()              │
│ }                                                          │
│                                                             │
│ Result:                                                    │
│   loc = {                                                  │
│     latitude: 9.9312,          (e.g., Kochi)             │
│     longitude: 76.2673,                                   │
│     city: "Kochi",                                        │
│     region: "Kerala",                                     │
│     source: "gps"  or "manual"  or "demo_fallback"       │
│   }                                                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Fetch Live Weather                                      │
├─────────────────────────────────────────────────────────────┤
│ const forecast = await getLiveWeather(loc.latitude,       │
│                                        loc.longitude);     │
│                                                             │
│ Open-Meteo API response:                                  │
│   {                                                        │
│     current: {                                            │
│       temperature_2m: 28.5,                               │
│       relative_humidity_2m: 78,                           │
│       wind_speed_10m: 12.3,                               │
│       rain: 2.1,                                          │
│       surface_pressure: 1012,                             │
│     }                                                      │
│   }                                                        │
│                                                             │
│ Extract:                                                   │
│   temperature: 28.5                                       │
│   humidity: 78                                            │
│   wind: 12.3                                              │
│   rainfall: 2.1                                           │
│   pressure: 1012                                          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Fetch ML Risk Assessment                                │
├─────────────────────────────────────────────────────────────┤
│ POST http://localhost:5000/api/risk                       │
│ {                                                          │
│   rainfall: 2.1,                                          │
│   humidity: 78,                                           │
│   windSpeed: 12.3,                                        │
│   temperature: 28.5,                                      │
│   pressure: 1012,                                         │
│   location: "Kochi, Kerala",                             │
│   ...                                                     │
│ }                                                          │
│                                                             │
│ ML API Response:                                          │
│   {                                                        │
│     riskScore: 42,                                        │
│     riskLevel: "Moderate",                                │
│     confidence: 85,                                       │
│   }                                                        │
│                                                             │
│ mlRiskLevel = getRiskLevel(42) = "Moderate"              │
│ mlRiskScore = 42                                          │
│ mlConfidence = 85                                         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Fetch Location-Specific Shelter/Hospital                │
├─────────────────────────────────────────────────────────────┤
│ const sh = getShelterHospitalByLocation(                   │
│   "Kochi, Kerala",                                        │
│   9.9312,                                                 │
│   76.2673                                                 │
│ );                                                         │
│                                                             │
│ shelterHospitalService.js lookup:                         │
│   normalized = "kochi"                                    │
│   data = SHELTER_HOSPITAL_DB["kochi"]                    │
│   ={                                                       │
│     nearestShelter: "Kumbalangi Integrated ...",          │
│     nearestHospital: "Lakeshore Hospital, Maradu",       │
│   }                                                        │
│                                                             │
│ If not found: proximity match or generic text            │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Fetch Historical Analysis (if Online Mode)              │
├─────────────────────────────────────────────────────────────┤
│ const hist = await analyzeHistoricalPatterns({            │
│   rainfall, humidity, temperature, wind, month,           │
│   location: "Kochi, Kerala",                             │
│   latitude: 9.9312,                                       │
│   longitude: 76.2673,                                     │
│ });                                                        │
│                                                             │
│ If coordinates provided:                                  │
│   → Fetch Open-Meteo ERA5 archive data                    │
│   → Compare current conditions to historical patterns     │
│   → Return patternMatch, trend, similar events            │
│                                                             │
│ Result:                                                    │
│   {                                                        │
│     patternMatch: 65,                                     │
│     similarityLevel: "Moderate",                          │
│     historicalRisk: "Moderate",                           │
│     commonImpact: "Waterlogging",                         │
│     ...                                                   │
│   }                                                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Compute Predictive Impacts                              │
├─────────────────────────────────────────────────────────────┤
│ const pred = predictImpacts({                             │
│   rainfall, humidity, temperature, wind, month,           │
│   mlRiskLevel, mlRiskScore,                               │
│   historicalRisk, commonImpact, patternMatch,             │
│   location,                                               │
│ });                                                        │
│                                                             │
│ Pure function (same inputs → same outputs):               │
│   {                                                        │
│     hazard: "Waterlogging Risk",                          │
│     impacts: ["Flood roads", "Traffic delays", ...],     │
│     impactLevel: "Moderate",                              │
│   }                                                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Generate Actionable Advice                              │
├─────────────────────────────────────────────────────────────┤
│ const advice = generateAdvice({                           │
│   rainfall, humidity, temperature, wind, month,           │
│   mlRiskLevel, mlRiskScore,                               │
│   historicalRisk, patternMatch,                           │
│   predictedHazard: pred.hazard,                           │
│   impactLevel: pred.impactLevel,                          │
│   location,                                               │
│ });                                                        │
│                                                             │
│ Pure function (same inputs → same outputs):               │
│   {                                                        │
│     do: [                                                 │
│       "Stay informed via official channels",             │
│       "Keep drainage clear",                              │
│       ...                                                 │
│     ],                                                    │
│     avoid: ["Low-lying areas", "Flooded routes", ...],  │
│     prepare: ["Emergency kit", "Document valuables", ...],│
│   }                                                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. Store in Cache (Module-Level State)                    │
├─────────────────────────────────────────────────────────────┤
│ _cache = {                                                │
│   gpsSource: loc.source,                                 │
│   locationName: "Kochi, Kerala",                         │
│   latitude: 9.9312,                                       │
│   longitude: 76.2673,                                     │
│   mapCenter: [9.9312, 76.2673],                          │
│   temperature: 28.5,                                      │
│   humidity: 78,                                           │
│   wind: 12.3,                                             │
│   rainfall: 2.1,                                          │
│   pressure: 1012,                                         │
│   mlRiskLevel: "Moderate",                               │
│   mlRiskScore: 42,                                        │
│   mlConfidence: 85,                                       │
│   nearestShelter: "Kumbalangi Integrated ...",           │
│   nearestHospital: "Lakeshore Hospital, Maradu",         │
│   hist: { patternMatch: 65, ... },                       │
│   pred: { hazard: "Waterlogging Risk", ... },            │
│   advice: { do: [...], avoid: [...], ... },              │
│   createdAt: "2026-09-20T...",                           │
│   reason: "Live assessment: Waterlogging Risk.",          │
│ };                                                        │
│                                                             │
│ _cacheTime = Date.now();                                 │
│ _notify();  // Trigger all subscribed components          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ resolveDisplayValues() Returns Live Cache                  │
├─────────────────────────────────────────────────────────────┤
│ export function resolveDisplayValues(cache, demo, ...) {  │
│   if (demo) return _SCENARIO_RESULTS[...];               │
│   if (!cache) return SAFE_DEFAULTS;                      │
│   return { ...cache, isDemo: false };  ← Returns cache   │
│ }                                                          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Dashboard Components Consume Live Data                     │
├─────────────────────────────────────────────────────────────┤
│ const dv = resolveDisplayValues(cache, demo, demoScenario);│
│                                                             │
│ Current Weather Card:                                      │
│   displayWeather = demo ? dv : cache;  // ← uses cache   │
│   temp: 28.5°C, humidity: 78%, wind: 12.3 km/h, etc.    │
│                                                             │
│ Location Monitoring:                                       │
│   location: "Kochi, Kerala"  (live)                      │
│   gps: "Resolved"  (live)                                │
│   accuracy: ±12 m  (live)                                │
│                                                             │
│ Risk Level:                                                │
│   mlRiskScore: 42  (live)                                │
│   mlRiskLevel: "Moderate"  (live)                        │
│   mlConfidence: 85%  (live)                              │
│                                                             │
│ Emergency Status:                                          │
│   shelter: "Kumbalangi Integrated..."  (live lookup)     │
│   hospital: "Lakeshore Hospital, Maradu"  (live lookup)  │
│                                                             │
│ Risk Map:                                                  │
│   mapCenter: [9.9312, 76.2673]  (live)                   │
│   isDemoScenario: false                                   │
│   CASE 2 executes: Uses live coordinates                 │
│                                                             │
│ All sections show consistent, live Kochi data.           │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Guard Mechanisms

### 1. Pipeline Guard (Line 283)
```javascript
export async function runPipeline() {
  if (_demoMode || _loading) return;  // ← BLOCKS ALL ONLINE PROCESSING
  // ... rest of pipeline
}
```
**Effect**: When demo=true, NO APIs are called, NO GPS is requested, NO data is fetched.

### 2. resolveDisplayValues() Conditional (Lines 460–488)
```javascript
export function resolveDisplayValues(cache, demo, demoScenario) {
  if (demo) {
    const result = _SCENARIO_RESULTS[demoScenario ?? "flooding"];
    return result;  // ← DEMO DATA ONLY
  }
  if (!cache) {
    return { ... SAFE_DEFAULTS ... };  // ← LOADING STATE
  }
  return { ...cache, isDemo: false };  // ← ONLINE DATA ONLY
}
```
**Effect**: Consumers always receive ONE dataset—demo OR online, never mixed.

### 3. Component-Level Data Selection
```javascript
// From Dashboard.jsx, line 426
const displayWeather = demo ? dv : cache;

// From RiskMap.jsx, line 295
if (isDemoScenario && mapCenter && Array.isArray(mapCenter)) {
  setCenter([mapCenter[0], mapCenter[1]]);  // Use demo mapCenter
  // ... early return
}
```
**Effect**: Components explicitly choose data source based on mode.

---

## Data Isolation Verification

### No Mixing Scenarios

✅ **Cannot mix Demo shelter with Online risk calculation**
- Demo shelter: hardcoded in `_SCENARIO_INPUTS[scenario].nearestShelter`
- Online shelter: looked up via `getShelterHospitalByLocation()`
- resolveDisplayValues() ensures one source only

✅ **Cannot mix Demo GPS with Online weather**
- Demo GPS: fixed [10.7089, 76.7479] (Chittur)
- Online GPS: actual coordinates from browser or Nominatim
- Pipeline guard blocks online GPS when demo=true

✅ **Cannot mix Demo ML risk with Online weather**
- Demo ML risk: pre-computed mlRiskScore from scenario
- Online ML risk: fetched from `/api/risk` endpoint
- Demo scenarios compute pred/advice from fixed risk score

✅ **Cannot accidentally call Open-Meteo when Demo is active**
- Pipeline guard: `if (_demoMode) return;` at line 283
- Historical service: only called in runPipeline() (blocked in demo)
- No path to API when demo=true

---

## Adding New Data

### Add to Demo Scenario
1. Edit `_SCENARIO_INPUTS` in `globalAlertService.js` (lines 43–141)
2. Add new field to scenario object
3. Pass through `_buildScenarioResult()` (line 165)
4. New field automatically available in `dv` for all demo consumers

**Example**: Adding air quality to flood scenario
```javascript
const flooding = {
  key: "flooding",
  // ... existing fields ...
  airQuality: "Good",  // ← Add here
};

// In _buildScenarioResult():
return {
  // ... existing fields ...
  airQuality: s.airQuality,  // ← Pass through
};
```

### Add to Online Mode
1. Fetch data in `runPipeline()` (lines 280–370)
2. Store in `_cache` (line 347)
3. New field automatically available in `dv` for all online consumers

**Example**: Adding air quality from external API
```javascript
// In runPipeline():
const airQuality = await fetchAirQuality(loc.latitude, loc.longitude);

_cache = {
  // ... existing fields ...
  airQuality,  // ← Add here
};
```

### Use in Dashboard
```javascript
const airQuality = dv.airQuality ?? "N/A";
```
Works for both demo and online automatically.

---

## Testing Mode Isolation

### Test Demo Mode
1. Click "🎭 Demo Mode" button on Dashboard
2. Verify: 
   - All fields show "Chittur (DEMO – ...)"
   - Weather matches scenario (e.g., rainfall=42mm for flooding)
   - Shelter shows Chittur-specific facility
   - Map centered on [10.7089, 76.7479]
   - "Demo scenario" label shown in GPS status
3. Switch scenarios using buttons
4. Each scenario shows different shelter/hospital and weather

### Test Online Mode
1. Click "✕ Exit Demo Mode" button
2. Verify:
   - GPS resolves (shows "Resolved" or "Demo fallback")
   - Location shows actual city from Nominatim
   - Weather updates from live API
   - Risk score updates from ML API
   - Shelter shows location-specific facility (e.g., Kochi shelter if GPS in Kochi)
   - Map centers on actual GPS coordinates
3. Search for different cities using city search
4. Each city shows different shelter/hospital and weather

### Test No Mixing
1. In Demo mode, open browser DevTools Network tab
2. Verify NO network requests to Open-Meteo, ML API, or Nominatim
3. Exit Demo mode
4. Verify network requests now appear for weather, risk, reverse-geocoding

---

## Common Pitfalls to Avoid

❌ **Don't add new data only to demo without online counterpart**
```javascript
// WRONG: Only in demo scenarios
_SCENARIO_INPUTS.flooding.newField = "demo value";
// Online consumers get undefined
```

✅ **DO add to both pipelines**
```javascript
// Demo:
_SCENARIO_INPUTS.flooding.newField = "demo value";

// Online:
_cache.newField = await fetchNewField(...);

// Both:
const newField = dv.newField ?? "fallback";
```

❌ **Don't use cache data in demo without checking demo flag**
```javascript
// WRONG: Might leak online data into demo
const value = cache?.someField ?? dv.someField;
```

✅ **DO use resolveDisplayValues()**
```javascript
// Correct: Always returns correct source
const dv = resolveDisplayValues(cache, demo, demoScenario);
const value = dv.someField;
```

❌ **Don't call APIs in component rendering**
```javascript
// WRONG: API called every render, bypasses pipeline guard
useEffect(() => {
  fetch(...);  // No check for demo mode
}, []);
```

✅ **DO call APIs in runPipeline only**
```javascript
// Correct: Pipeline guard ensures no API in demo
export async function runPipeline() {
  if (_demoMode || _loading) return;  // Demo blocked
  const data = await fetch(...);
}
```

---

## When Things Break

### Symptoms: Demo shows online data
**Cause**: resolveDisplayValues() returning cache when demo=true
**Fix**: Check demo flag in resolveDisplayValues(), return _SCENARIO_RESULTS[key] first

### Symptoms: Online shows no data
**Cause**: Pipeline guard blocking runPipeline()
**Fix**: Check _demoMode flag is false, verify setDemoMode(false) was called

### Symptoms: Shelter shows generic text in online mode
**Cause**: City not in SHELTER_HOSPITAL_DB
**Fix**: Add city to shelterHospitalService.js SHELTER_HOSPITAL_DB, or use proximity matching fallback

### Symptoms: New data appears only in demo, not online
**Cause**: Data added to demo scenario but not to online pipeline
**Fix**: Add fetch/lookup in runPipeline() and store in _cache

---

## Architecture Summary

```
User Selects Mode
    ↓
┌─────────┬─────────┐
│ Demo    │ Online  │
├─────────┴─────────┤
↓                   ↓
Pre-computed     Pipeline executes:
Scenario data    GPS/Search → APIs → Lookups
(5 fixed)        (dynamic)
│                 │
└────────┬────────┘
         ↓
resolveDisplayValues()
Returns one clean dataset
         ↓
Dashboard components
(All receive dv only)
         ↓
Display consistent data
(No mixing possible)
```

**Golden Rule**: After resolveDisplayValues(), consumers should never know which mode they're in. The data structure is identical; only the source differs.
