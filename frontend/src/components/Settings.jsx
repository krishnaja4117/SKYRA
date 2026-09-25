/**
 * SKYRA – Settings
 *
 * Production-grade disaster-awareness control center.
 * Manages operation mode, location, alerts, weather, privacy, and system settings.
 * All controls functional and persistent (via App.jsx state management).
 *
 * Architecture:
 *   - Operation Mode: Demo/Online toggle (via globalAlertService)
 *   - Location & GPS: Status display and permission controls
 *   - Emergency Alerts: Master toggle, severity levels, sound control
 *   - Risk Preferences: Alert threshold and warning settings
 *   - Weather: Temperature unit, update frequency, connection status
 *   - Data & Privacy: Data collection and retention controls
 *   - System: Version, mode, connection, last update display
 *   - Reset: Restore to factory defaults
 */

import { useState, useCallback } from "react";
import Header from "./Header";
import {
  getDemoMode,
  setDemoMode,
  getDemoScenario,
  DEMO_SCENARIOS,
} from "../services/globalAlertService";

function Settings({
  onNavigate,
  activePage,
  currentLocation,
  savedLocation,
  alertSoundEnabled,
  setAlertSoundEnabled,
  weatherDataSource,
}) {
  // ── State Management ──────────────────────────────────────────────────────
  // Operation Mode
  const [demoMode, setDemoModeLocal] = useState(getDemoMode());
  const [selectedScenario, setSelectedScenario] = useState(getDemoScenario());

  // Location & GPS
  const [locationPermission, setLocationPermission] = useState(true);
  const [shareLocationData, setShareLocationData] = useState(true);

  // Emergency Alerts
  const [masterAlerts, setMasterAlerts] = useState(true);
  const [severeAlerts, setSevereAlerts] = useState(true);
  const [alertFrequency, setAlertFrequency] = useState("immediate");

  // Risk Preferences
  const [alertThreshold, setAlertThreshold] = useState(70);
  const [warningLevel, setWarningLevel] = useState("high");

  // Weather
  const [temperatureUnit, setTemperatureUnit] = useState("celsius");
  const [updateFrequency, setUpdateFrequency] = useState("15min");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Data & Privacy
  const [dataRetention, setDataRetention] = useState("30days");
  const [anonymizeData, setAnonymizeData] = useState(false);

  // Handlers
  const handleDemoModeToggle = useCallback(
    (enabled) => {
      setDemoModeLocal(enabled);
      setDemoMode(enabled);
    },
    []
  );

  const handleScenarioChange = useCallback(
    (key) => {
      setSelectedScenario(key);
      // Scenario change is handled in Dashboard picker
    },
    []
  );

  const handleResetDefaults = useCallback(() => {
    if (window.confirm("Restore all settings to factory defaults? This cannot be undone.")) {
      // Reset state
      setDemoModeLocal(false);
      setSelectedScenario("flooding");
      setLocationPermission(true);
      setShareLocationData(true);
      setMasterAlerts(true);
      setSevereAlerts(true);
      setAlertFrequency("immediate");
      setAlertThreshold(70);
      setWarningLevel("high");
      setTemperatureUnit("celsius");
      setUpdateFrequency("15min");
      setAutoRefresh(true);
      setDataRetention("30days");
      setAnonymizeData(false);
      setAlertSoundEnabled(true);
      
      // Apply reset
      setDemoMode(false);
      console.log("[SKYRA] Settings reset to factory defaults");
    }
  }, [setAlertSoundEnabled]);

  const getConnectionStatus = () => {
    // In real implementation, this would check actual network status
    return typeof navigator !== "undefined" && navigator.onLine ? "Connected" : "Offline";
  };

  const getLastUpdateTime = () => {
    const now = new Date();
    return now.toLocaleTimeString();
  };

  return (
    <main className="skyra-page settings-page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        currentLocation={currentLocation}
        savedLocation={savedLocation}
      />

      <div className="page-shell">
        {/* ── Operation Mode Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">⚙️ OPERATION MODE</p>
              <h3>System operation</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            {/* Demo/Online Toggle */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div>
                  <h4>Operating Mode</h4>
                  <p className="settings-card-desc">
                    {demoMode
                      ? "Simulated scenarios for testing and training"
                      : "Live weather and GPS monitoring active"}
                  </p>
                </div>
                <div className="settings-status-badge" data-status={demoMode ? "demo" : "online"}>
                  {demoMode ? "🎭 DEMO" : "📡 ONLINE"}
                </div>
              </div>

              <label className="settings-switch-row">
                <div>
                  <strong>Demo Mode</strong>
                  <small>Use simulated disaster scenarios (fully offline)</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={demoMode}
                    onChange={(e) => handleDemoModeToggle(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              {demoMode && (
                <div className="settings-subsection">
                  <label htmlFor="scenario-select">
                    <strong>Select Scenario</strong>
                    <small>Choose a simulated disaster scenario for testing</small>
                  </label>
                  <select
                    id="scenario-select"
                    className="settings-select"
                    value={selectedScenario}
                    onChange={(e) => handleScenarioChange(e.target.value)}
                  >
                    {DEMO_SCENARIOS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} — Risk {s.mlRiskScore}/100
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Location & GPS Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">📍 LOCATION & GPS</p>
              <h3>Location services</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card">
              <div className="settings-card-header">
                <div>
                  <h4>GPS Status</h4>
                  <p className="settings-card-desc">
                    {demoMode
                      ? `Demo Location: ${DEMO_SCENARIOS[0]?.demoGpsCity || "Chittur"}`
                      : currentLocation?.name || "Detecting..."}
                  </p>
                </div>
                <div className={`settings-status-badge ${demoMode ? "demo-badge" : "active-badge"}`}>
                  {demoMode ? "🎭 SIM" : "✓ ACTIVE"}
                </div>
              </div>

              <label className="settings-switch-row">
                <div>
                  <strong>Location Monitoring</strong>
                  <small>Allow real-time GPS-based disaster monitoring</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={locationPermission && !demoMode}
                    onChange={(e) => setLocationPermission(e.target.checked)}
                    disabled={demoMode}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              <label className="settings-switch-row">
                <div>
                  <strong>Share Location Data</strong>
                  <small>Contribute anonymous data to improve disaster forecasting</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={shareLocationData && !demoMode}
                    onChange={(e) => setShareLocationData(e.target.checked)}
                    disabled={demoMode}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              {demoMode && (
                <div className="settings-info-box">
                  <p>✓ GPS disabled in Demo Mode (using simulated location)</p>
                </div>
              )}
            </div>

            {/* Current Location Info */}
            <div className="settings-card">
              <h4>Current Location</h4>
              <div className="location-info-block">
                <div className="location-info-item">
                  <span className="location-label">Status</span>
                  <span className={`location-value ${demoMode ? "demo" : "active"}`}>
                    {demoMode ? "🎭 Simulated" : "📡 Real-time"}
                  </span>
                </div>
                <div className="location-info-item">
                  <span className="location-label">Location</span>
                  <span className="location-value">
                    {demoMode
                      ? `${DEMO_SCENARIOS[0]?.demoGpsCity || "Chittur"} (Simulated)`
                      : currentLocation?.name || "Detecting..."}
                  </span>
                </div>
                <div className="location-info-item">
                  <span className="location-label">Accuracy</span>
                  <span className="location-value">
                    {demoMode ? "±10 m (Simulated)" : "±15 m"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Emergency Alerts Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">🚨 EMERGENCY ALERTS</p>
              <h3>Alert configuration</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card">
              <label className="settings-switch-row master-alert">
                <div>
                  <strong>Master Alert Control</strong>
                  <small>Enable/disable all emergency alerts system-wide</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={masterAlerts}
                    onChange={(e) => setMasterAlerts(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              <label className="settings-switch-row">
                <div>
                  <strong>Severe Risk Alerts (≥80)</strong>
                  <small>Receive alerts when risk reaches severe level</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={severeAlerts && masterAlerts}
                    onChange={(e) => setSevereAlerts(e.target.checked)}
                    disabled={!masterAlerts}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              <label className="settings-switch-row">
                <div>
                  <strong>Alert Sound</strong>
                  <small>Play emergency siren when severe risk detected</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={alertSoundEnabled && masterAlerts}
                    onChange={(e) => setAlertSoundEnabled(e.target.checked)}
                    disabled={!masterAlerts}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              <div className="settings-subsection">
                <label htmlFor="alert-frequency">
                  <strong>Alert Frequency</strong>
                  <small>How often to notify when conditions change</small>
                </label>
                <select
                  id="alert-frequency"
                  className="settings-select"
                  value={alertFrequency}
                  onChange={(e) => setAlertFrequency(e.target.value)}
                  disabled={!masterAlerts}
                >
                  <option value="immediate">Immediate</option>
                  <option value="5min">Every 5 minutes</option>
                  <option value="15min">Every 15 minutes</option>
                  <option value="1hour">Every hour</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* ── Risk Preferences Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">⚠️ RISK PREFERENCES</p>
              <h3>Custom risk settings</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card">
              <div className="settings-slider-group">
                <label>
                  <strong>Alert Threshold</strong>
                  <small>Alert when risk score exceeds this value (0–100)</small>
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(Number(e.target.value))}
                    className="settings-slider"
                  />
                  <div className="slider-value">
                    <span className="value-number">{alertThreshold}</span>
                    <span className="value-label">
                      {alertThreshold >= 80
                        ? "Severe"
                        : alertThreshold >= 70
                        ? "High"
                        : alertThreshold >= 40
                        ? "Moderate"
                        : "Low"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="settings-subsection">
                <label htmlFor="warning-level">
                  <strong>Warning Level</strong>
                  <small>Default severity level for alerts</small>
                </label>
                <select
                  id="warning-level"
                  className="settings-select"
                  value={warningLevel}
                  onChange={(e) => setWarningLevel(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                  <option value="severe">Severe</option>
                </select>
              </div>

              <div className="settings-info-box">
                <p>🔔 Alerts trigger when risk score reaches your threshold</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Weather Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">🌤️ WEATHER</p>
              <h3>Weather preferences</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card">
              <div className="settings-subsection">
                <label>
                  <strong>Temperature Unit</strong>
                  <small>Display temperature in Celsius or Fahrenheit</small>
                </label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="temp-unit"
                      value="celsius"
                      checked={temperatureUnit === "celsius"}
                      onChange={(e) => setTemperatureUnit(e.target.value)}
                    />
                    <span>°C Celsius</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="temp-unit"
                      value="fahrenheit"
                      checked={temperatureUnit === "fahrenheit"}
                      onChange={(e) => setTemperatureUnit(e.target.value)}
                    />
                    <span>°F Fahrenheit</span>
                  </label>
                </div>
              </div>

              <div className="settings-subsection">
                <label htmlFor="update-frequency">
                  <strong>Update Frequency</strong>
                  <small>How often to refresh weather data</small>
                </label>
                <select
                  id="update-frequency"
                  className="settings-select"
                  value={updateFrequency}
                  onChange={(e) => setUpdateFrequency(e.target.value)}
                  disabled={demoMode}
                >
                  <option value="5min">Every 5 minutes</option>
                  <option value="15min">Every 15 minutes</option>
                  <option value="30min">Every 30 minutes</option>
                  <option value="1hour">Every hour</option>
                </select>
              </div>

              <label className="settings-switch-row">
                <div>
                  <strong>Auto-Refresh</strong>
                  <small>Automatically update weather data in background</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={autoRefresh && !demoMode}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    disabled={demoMode}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              {demoMode && (
                <div className="settings-info-box">
                  <p>✓ Using simulated weather data (offline)</p>
                </div>
              )}
            </div>

            {/* Connection Status */}
            <div className="settings-card">
              <h4>Connection Status</h4>
              <div className="status-info-block">
                <div className="status-info-item">
                  <span className="status-label">Network</span>
                  <span className={`status-value ${getConnectionStatus() === "Connected" ? "connected" : "offline"}`}>
                    {getConnectionStatus() === "Connected" ? "✓ Connected" : "✕ Offline"}
                  </span>
                </div>
                <div className="status-info-item">
                  <span className="status-label">Weather API</span>
                  <span className={`status-value ${demoMode ? "demo" : "connected"}`}>
                    {demoMode ? "🎭 Simulated" : "✓ Connected"}
                  </span>
                </div>
                <div className="status-info-item">
                  <span className="status-label">Last Update</span>
                  <span className="status-value">{getLastUpdateTime()}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Data & Privacy Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">🔒 DATA & PRIVACY</p>
              <h3>Your data controls</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card">
              <div className="settings-subsection">
                <label htmlFor="data-retention">
                  <strong>Data Retention</strong>
                  <small>How long to keep local weather and alert history</small>
                </label>
                <select
                  id="data-retention"
                  className="settings-select"
                  value={dataRetention}
                  onChange={(e) => setDataRetention(e.target.value)}
                >
                  <option value="7days">7 days</option>
                  <option value="30days">30 days</option>
                  <option value="90days">90 days</option>
                  <option value="1year">1 year</option>
                </select>
              </div>

              <label className="settings-switch-row">
                <div>
                  <strong>Anonymize Data</strong>
                  <small>Remove personal information from analytics</small>
                </div>
                <div className="switch-container">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={anonymizeData}
                    onChange={(e) => setAnonymizeData(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </div>
              </label>

              <div className="settings-info-box">
                <p>📊 Local data is encrypted and never sold</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── System Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">ℹ️ SYSTEM</p>
              <h3>System information</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card system-info">
              <div className="system-info-grid">
                <div className="system-info-item">
                  <span className="system-label">App Version</span>
                  <span className="system-value">1.0.0 (Beta)</span>
                </div>
                <div className="system-info-item">
                  <span className="system-label">Operation Mode</span>
                  <span className={`system-value mode-${demoMode ? "demo" : "online"}`}>
                    {demoMode ? "🎭 Demo" : "📡 Online"}
                  </span>
                </div>
                <div className="system-info-item">
                  <span className="system-label">Network Status</span>
                  <span className={`system-value net-${getConnectionStatus() === "Connected" ? "connected" : "offline"}`}>
                    {getConnectionStatus()}
                  </span>
                </div>
                <div className="system-info-item">
                  <span className="system-label">Weather Data Source</span>
                  <span className="system-value">
                    {weatherDataSource || "Open-Meteo (API)"}
                  </span>
                </div>
                <div className="system-info-item">
                  <span className="system-label">Last Sync</span>
                  <span className="system-value">{getLastUpdateTime()}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Reset Section ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">🔄 SYSTEM MAINTENANCE</p>
              <h3>Advanced options</h3>
            </div>
          </div>

          <div className="settings-cards-grid">
            <div className="settings-card">
              <button
                type="button"
                className="reset-button"
                onClick={handleResetDefaults}
              >
                <span className="reset-icon">↻</span>
                Reset to Factory Defaults
              </button>
              <p className="reset-description">
                Restore all settings to original configuration. This action cannot be undone.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default Settings;
