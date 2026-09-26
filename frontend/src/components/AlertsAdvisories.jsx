/**
 * SKYRA – Alerts & Advisories
 * ─────────────────────────────────────────────────────────────────────────────
 * All live risk data now comes from useGlobalAlert() (globalAlertService.js).
 * This page and Dashboard share the SAME pipeline result — no duplicate
 * GPS/weather/ML calls.
 *
 * Demo Mode is also global: toggling it here toggles it on Dashboard too.
 */
import { useState } from "react";
import Header from "./Header";
import {
  useGlobalAlert,
  resolveDisplayValues,
  getRiskClass,
  formatTs,
  runPipeline,
  DEMO_SCENARIOS,
} from "../services/globalAlertService";
import { acknowledgeBackendAlert } from "../services/intelligenceService";

// ─── Card shell ───────────────────────────────────────────────────────────────
function AlertCard({ eyebrow, title, badge, badgeClass, children, scrollable }) {
  return (
    <article className={`panel glass-panel alerts-card${scrollable ? " alerts-card-scroll" : ""}`}>
      <div className="panel-header slim">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        {badge && <span className={`risk-pill ${badgeClass ?? ""}`}>{badge}</span>}
      </div>
      {children}
    </article>
  );
}

// ─── Safety check — starts at the Safe/Help buttons immediately ───────────────
// No "Check In" step: when alertIsActive the question is shown directly.
function SafetyCheck() {
  const [status, setStatus] = useState("prompted"); // prompted | safe | help
  const [stamp, setStamp] = useState(null);

  if (status === "prompted") {
    return (
      <div className="alerts-safety-prompt">
        <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: "1rem" }}>
          🚨 Are you safe right now?
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="action-button"
            style={{ background: "linear-gradient(180deg,#4ade80,#16a34a)", color: "#fff", borderColor: "#86efac", flex: 1 }}
            onClick={() => { setStatus("safe"); setStamp(new Date().toLocaleTimeString()); }}
          >
            ✅ I&apos;m Safe
          </button>
          <button
            type="button"
            className="action-button danger"
            style={{ flex: 1 }}
            onClick={() => { setStatus("help"); setStamp(new Date().toLocaleTimeString()); }}
          >
            🆘 Need Help
          </button>
        </div>
      </div>
    );
  }

  if (status === "safe") {
    return (
      <div className="alerts-safety-result">
        <p style={{ color: "#4ade80", fontWeight: 700, margin: "0 0 4px" }}>✅ Status: Safe</p>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 10px" }}>
          Confirmed at {stamp}. Stay alert and keep monitoring SKYRA.
        </p>
        <button type="button" className="action-button" onClick={() => setStatus("prompted")}>
          Update Status
        </button>
      </div>
    );
  }

  // help
  return (
    <div className="alerts-safety-result">
      <p style={{ color: "#f87171", fontWeight: 700, margin: "0 0 4px" }}>🆘 Help Requested</p>
      <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 6px" }}>
        Triggered at {stamp}.
      </p>
      <p style={{ fontSize: "0.82rem", color: "#fca5a5", margin: "0 0 10px" }}>
        ⚠️ PROTOTYPE — SKYRA does not yet connect to live emergency services.
        Call 112 immediately for real emergencies.
      </p>
      <a
        href="tel:112"
        className="action-button danger"
        style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 8 }}
      >
        📞 Call 112 — All Emergencies
      </a>
      <a href="tel:108" className="action-button" style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 8 }}>
        🚑 Call 108 — Ambulance
      </a>
      <button type="button" className="action-button" onClick={() => setStatus("prompted")}>
        Update Status
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AlertsAdvisories({
  onNavigate,
  activePage,
  currentLocation,
  savedLocation,
}) {
  // ── All live data from the shared global hook ──────────────────────────────
  const { cache, loading, error, demo, demoScenario, setDemo, setScenario } = useGlobalAlert();
  const dv = resolveDisplayValues(cache, demo, demoScenario);

  // Derived display values
  const demoAlert = dv?.demoAlert || null;
  const [isAcking, setIsAcking] = useState(false);
  const riskLevel = dv.mlRiskLevel;
  const riskScore = dv.mlRiskScore;
  const riskConfidence = dv.mlConfidence;
  const displayHazard = dv.pred?.hazard ?? "No Significant Hazard";
  const displayAdvice = dv.advice;
  const locationName = dv.locationName;
  const reason = dv.reason ?? "";
  const createdAt = dv.createdAt ?? null;
  const activeBackendAlert = cache?.alerts?.activeAlert ?? null;
  const alertHistory = cache?.alerts?.history || [];
  const riskCls = getRiskClass(riskLevel);
  const alertIsActive = demo
    ? Boolean(demoAlert)
    : (activeBackendAlert ? (activeBackendAlert.status === "Active" || activeBackendAlert.status === "Acknowledged") : (riskLevel === "High" || riskLevel === "Severe"));

  // Last-updated timestamp (from cache, not demo)
  const lastUpdated = cache?.createdAt ? new Date(cache.createdAt) : null;

  return (
    <main className="skyra-page alerts-page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        currentLocation={currentLocation}
        savedLocation={savedLocation}
      />

      <div className="page-shell">

        {/* ── Page heading ── */}
        <section className="panel glass-panel alerts-heading-panel">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow">WARN SKYRA</p>
              <h2 style={{ margin: "4px 0 8px" }}>Alerts &amp; Advisories</h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
                Real-time risk warnings and safety guidance.
                {lastUpdated && !demo && (
                  <span style={{ marginLeft: 10, fontSize: "0.8rem", opacity: 0.7 }}>
                    Updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>

            {/* ── Demo mode toggle + scenario picker ── */}
            <div className="alerts-demo-controls">
              <div className="demo-picker-bar" style={{ border: "none", padding: 0, background: "transparent", boxShadow: "none" }}>
                <button
                  type="button"
                  className={`action-button${demo ? " danger" : ""}`}
                  onClick={() => setDemo(!demo)}
                  aria-pressed={demo}
                >
                  {demo ? "✕ Exit Demo Mode" : "🎭 Simulate Severe Weather"}
                </button>
                {demo && (
                  <>
                    <span className="demo-picker-label">Scenario:</span>
                    {DEMO_SCENARIOS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className={`action-button demo-scenario-btn${demoScenario === s.key ? " demo-scenario-active" : ""}`}
                        onClick={() => setScenario(s.key)}
                        aria-pressed={demoScenario === s.key}
                      >
                        {s.label}
                      </button>
                    ))}
                    <span className="alerts-demo-badge">⚠️ DEMO — simulated data</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Current risk / alert card ── */}
        <AlertCard
          eyebrow={demo ? "SIMULATED ALERT" : (activeBackendAlert?.sourceAuthority === "OFFICIAL_ADVISORY" ? "🇮🇳 OFFICIAL IMD ADVISORY" : "🤖 MODEL-ESTIMATED RISK")}
          title={demo ? demoAlert?.title : (activeBackendAlert?.title || (alertIsActive ? `${riskLevel} Risk Alert` : "No Active Alert"))}
          badge={activeBackendAlert?.priority ? `${activeBackendAlert.priority} · ${riskLevel}` : riskLevel}
          badgeClass={riskCls}
        >
          {loading && !cache && !demo ? (
            <p className="empty-state">Loading live risk data…</p>
          ) : error && !cache && !demo ? (
            <p className="empty-state" style={{ color: "var(--amber)" }}>{error}</p>
          ) : (
            <div className="alerts-active-body">
              {demo && (
                <p className="alerts-demo-notice">
                  ⚠️ DEMO MODE — data below is simulated and does not represent actual conditions.
                </p>
              )}

              {demoAlert && (
                <p className="alerts-demo-notice">{demoAlert.message}</p>
              )}

              {!demo && activeBackendAlert?.message && (
                <p className="alerts-demo-notice" style={{ background: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.4)", color: "#fca5a5" }}>
                  🚨 {activeBackendAlert.message}
                </p>
              )}

              {/* Score row */}
              <div className="alerts-score-row">
                <span
                  className="alerts-score-value"
                  style={{ color: alertIsActive ? "var(--red)" : "var(--text)" }}
                >
                  {riskScore}
                </span>
                <span className="alerts-score-label">/100 risk score</span>
                {riskConfidence !== null && (
                  <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "var(--muted)" }}>
                    · {riskConfidence}% calibrated confidence
                  </span>
                )}
              </div>

              {/* Detail grid */}
              <div className="alerts-detail-grid">
                {[
                  { label: "Location", value: locationName ?? "Resolving…" },
                  { label: "Hazard", value: displayHazard },
                  { label: "Authority", value: activeBackendAlert?.sourceAuthority === "OFFICIAL_ADVISORY" ? "Official IMD Bulletin" : "SKYRA ML Engine" },
                  { label: "Priority", value: activeBackendAlert?.priority || (riskLevel === "Severe" ? "P1 (Emergency)" : riskLevel === "High" ? "P2 (Warning)" : "P3 (Watch)") },
                  { label: "Status", value: activeBackendAlert?.status ? `${activeBackendAlert.status} Alert` : (alertIsActive ? "Active Alert" : "Normal Monitoring") },
                  { label: "Issued at", value: formatTs(activeBackendAlert?.createdAt || createdAt) },
                  ...(activeBackendAlert?.expiresAt ? [{ label: "Expires at", value: formatTs(activeBackendAlert.expiresAt) }] : []),
                  ...(activeBackendAlert?.occurrenceCount > 1 ? [{ label: "Persistence", value: `${activeBackendAlert.occurrenceCount} cycles monitored` }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="alerts-detail-item">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              {reason && (
                <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                  Reason: {activeBackendAlert?.reason || reason}
                </p>
              )}

              {/* Acknowledge Button */}
              {!demo && activeBackendAlert && activeBackendAlert.status === "Active" && (
                <button
                  type="button"
                  className="action-button"
                  style={{ marginTop: 14, width: "100%", background: "linear-gradient(180deg,#3b82f6,#1d4ed8)", color: "#fff", borderColor: "#60a5fa" }}
                  onClick={async () => {
                    try {
                      setIsAcking(true);
                      await acknowledgeBackendAlert({ id: activeBackendAlert.id, acknowledgedBy: "User (In-App)" });
                      await runPipeline();
                    } catch (err) {
                      console.warn("[Alerts] Acknowledge error:", err.message);
                    } finally {
                      setIsAcking(false);
                    }
                  }}
                  disabled={isAcking}
                >
                  {isAcking ? "Recording Acknowledgement…" : "✓ Acknowledge Alert (I Understand)"}
                </button>
              )}

              {!demo && activeBackendAlert && activeBackendAlert.status === "Acknowledged" && (
                <div style={{ marginTop: 12, padding: "8px 14px", background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "8px", fontSize: "0.85rem", color: "#93c5fd" }}>
                  ✓ Acknowledged by {activeBackendAlert.acknowledgedBy || "User"} at {formatTs(activeBackendAlert.acknowledgedAt)}.
                </div>
              )}

              {/* Are You Safe? — directly shows Safe/Help buttons when alert is active */}
              {alertIsActive && (
                <div style={{ marginTop: 18 }}>
                  <SafetyCheck />
                </div>
              )}
            </div>
          )}
        </AlertCard>

        {/* ── Why this risk card ── */}
        <AlertCard eyebrow="WHY THIS RISK" title="Risk Explanation">
          {loading && !cache && !demo ? (
            <p className="empty-state">Loading…</p>
          ) : (
            <div>
              {demo && <p className="alerts-demo-notice">⚠️ DEMO — simulated explanation.</p>}
              <div className="alerts-detail-grid">
                {[
                  { label: "Temperature", value: dv.temperature != null ? `${dv.temperature}°C` : "—" },
                  { label: "Humidity", value: dv.humidity != null ? `${dv.humidity}%` : "—" },
                  { label: "Wind speed", value: dv.wind != null ? `${dv.wind} km/h` : "—" },
                  { label: "Rainfall", value: dv.rainfall != null ? `${dv.rainfall} mm` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="alerts-detail-item">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {dv.pred?.explanation && (
                <div className="alerts-advisory-box" style={{ marginTop: 14 }}>
                  <strong>Impact explanation</strong>
                  <p>{dv.pred.explanation}</p>
                </div>
              )}
            </div>
          )}
        </AlertCard>

        {/* ── Safety guidance / actionable advice card ── */}
        <AlertCard
          eyebrow="SAFETY GUIDANCE"
          title={displayAdvice?.title ?? "Safety Guidance"}
          badge={displayAdvice?.priority}
          badgeClass={getRiskClass(
            displayAdvice?.priority === "Emergency" ? "High"
              : displayAdvice?.priority === "Action" ? "Moderate"
                : "Low"
          )}
        >
          {loading && !cache && !demo ? (
            <p className="empty-state">Loading…</p>
          ) : (
            <div>
              {demo && <p className="alerts-demo-notice">⚠️ DEMO — simulated advice.</p>}

              {displayAdvice ? (
                <>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>✅ DO NOW</p>
                  <ul className="alerts-advisory-list" style={{ marginBottom: 14 }}>
                    {displayAdvice.immediateActions.map((a) => <li key={a}>{a}</li>)}
                  </ul>

                  <p className="eyebrow" style={{ marginBottom: 6 }}>🚫 AVOID</p>
                  <ul className="alerts-advisory-list" style={{ marginBottom: 14 }}>
                    {displayAdvice.avoidActions.map((a) => <li key={a}>{a}</li>)}
                  </ul>

                  <p className="eyebrow" style={{ marginBottom: 6 }}>🎒 PREPARE</p>
                  <ul className="alerts-advisory-list" style={{ marginBottom: 14 }}>
                    {displayAdvice.preparationActions.map((a) => <li key={a}>{a}</li>)}
                  </ul>

                  <div
                    className="alerts-advisory-box"
                    style={{ borderColor: "rgba(255,106,106,0.25)", background: "rgba(255,106,106,0.05)" }}
                  >
                    <strong style={{ color: "#ff8080" }}>🚨 IF SITUATION WORSENS</strong>
                    {displayAdvice.emergencyGuidance.map((g) => (
                      <p key={g} style={{ margin: "4px 0 0" }}>{g}</p>
                    ))}
                  </div>

                  <a
                    href="tel:112"
                    className="action-button danger"
                    style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 12 }}
                  >
                    📞 Call 112 — Emergency
                  </a>
                </>
              ) : (
                <ul className="alerts-advisory-list">
                  <li>Stay alert and monitor changing weather conditions.</li>
                  <li>Avoid unnecessary travel during severe weather.</li>
                  <li>Always follow official government and disaster management instructions.</li>
                  <li>Keep emergency contacts saved and phone charged.</li>
                </ul>
              )}
            </div>
          )}
        </AlertCard>

        {/* ── WATCH → WARN monitoring card ── */}
        <AlertCard eyebrow="CONTINUOUS MONITORING" title="WATCH → WARN">
          <p style={{ margin: "0 0 10px", color: "var(--muted)", lineHeight: 1.65, fontSize: "0.9rem" }}>
            SKYRA checks current weather every 60 seconds and escalates alerts
            when risk increases. Demo Mode lets you simulate a Severe event
            without requiring a live High/Severe reading.
          </p>
          <div className="alerts-risk-scale">
            {[
              { label: "Low", range: "0–39", cls: "low" },
              { label: "Moderate", range: "40–69", cls: "moderate" },
              { label: "High", range: "70–79", cls: "high" },
              { label: "Severe", range: "80–100", cls: "high" },
            ].map(({ label, range, cls }) => (
              <div key={label} className={`alerts-scale-item ${cls}`}>
                <span className="alerts-scale-label">{label}</span>
                <span className="alerts-scale-range">{range}</span>
              </div>
            ))}
          </div>
        </AlertCard>

        {/* ── IMD Weather Warnings & Advisories ── */}
        {!demo && dv.imdAdvisories && (
          <AlertCard
            eyebrow="OFFICIAL WEATHER WARNINGS"
            title={dv.imdAdvisories.hasWarnings ? "🇮🇳 IMD Weather Warnings" : "🇮🇳 IMD Weather Advisory"}
            badge={dv.imdAdvisories.hasWarnings ? "Advisory" : "Info"}
            badgeClass={dv.imdAdvisories.hasWarnings ? "high" : "moderate"}
          >
            <div>
              {dv.imdAdvisories.hasWarnings ? (
                <>
                  <p className="eyebrow" style={{ marginBottom: 6, color: "#ff8080" }}>
                    ⚠️ Active Weather Warnings
                  </p>
                  <div className="alerts-advisory-box" style={{ marginBottom: 12 }}>
                    {dv.imdAdvisories.advisories.map((advisory, idx) => (
                      <div key={idx} style={{ marginBottom: idx < dv.imdAdvisories.advisories.length - 1 ? 8 : 0 }}>
                        <strong>{advisory.day}:</strong> {advisory.condition}
                        {advisory.maxTemp && advisory.minTemp && (
                          <span style={{ marginLeft: 4, fontSize: "0.85rem", color: "var(--muted)" }}>
                            ({advisory.minTemp}–{advisory.maxTemp}°C)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: "8px 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                    Source: India Meteorological Department (IMD) · {dv.imdAdvisories.stationName}
                  </p>
                </>
              ) : (
                <>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>
                    ✅ No Active Weather Warnings
                  </p>
                  <p style={{ margin: "6px 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                    IMD forecasts indicate no severe weather warnings for the next 4 days.
                    Stay alert and continue monitoring SKYRA.
                  </p>
                  <p style={{ margin: "6px 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                    Source: India Meteorological Department (IMD) · {dv.imdAdvisories.stationName}
                  </p>
                </>
              )}
            </div>
          </AlertCard>
        )}

        {/* ── Real Backend Alert History ── */}
        {!demo && alertHistory && alertHistory.length > 0 && (
          <AlertCard eyebrow="ALERT HISTORY" title="Recent System Alerts">
            <div className="alerts-history-list">
              {alertHistory.map((item, idx) => (
                <div key={item.id || idx} style={{ padding: "12px 0", borderBottom: idx < alertHistory.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span className={`risk-pill ${item.priority ? item.priority.toLowerCase() : "p3"}`} style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                        {item.priority || "P3"}
                      </span>
                      <strong style={{ fontSize: "0.92rem" }}>{item.title || item.reason || `Alert ${item.id}`}</strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: "0.72rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: item.status === "Active" ? "rgba(239, 68, 68, 0.2)" : item.status === "Acknowledged" ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.1)",
                        color: item.status === "Active" ? "#fca5a5" : item.status === "Acknowledged" ? "#93c5fd" : "var(--muted)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                      }}>
                        {item.status || "Active"}
                      </span>
                      <span className={`risk-pill ${getRiskClass(item.riskLevel)}`} style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                        {item.riskLevel} ({item.riskScore}/100)
                      </span>
                    </div>
                  </div>
                  <p style={{ margin: "2px 0 4px", fontSize: "0.82rem", color: "var(--muted)" }}>
                    📍 {item.location} · {item.sourceAuthority === "OFFICIAL_ADVISORY" ? "🇮🇳 Official IMD Bulletin" : "🤖 Model-Estimated"} · {formatTs(item.createdAt)}
                    {item.occurrenceCount > 1 && ` · Repeated ${item.occurrenceCount}x`}
                    {item.expiresAt && ` · Exp: ${formatTs(item.expiresAt)}`}
                  </p>
                  {item.message && <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text)" }}>{item.message}</p>}
                </div>
              ))}
            </div>
          </AlertCard>
        )}

        {/* ── Demo scenario reference card (only in demo mode) ── */}
        {demo && (
          <AlertCard eyebrow="DEMO SCENARIO" title="Simulated Event Details">
            <p className="alerts-demo-notice" style={{ marginBottom: 12 }}>
              ⚠️ All data on this page is simulated. This is not a real event.
            </p>
            <div className="alerts-detail-grid">
              {[
                { label: "Scenario", value: dv.demoLabel },
                { label: "Scenario location", value: dv.locationName },
                { label: "Simulated hazard", value: displayHazard },
                { label: "Simulated score", value: `${riskScore}/100 (${riskLevel})` },
                { label: "Simulated rainfall", value: `${dv.rainfall} mm` },
                { label: "Simulated wind", value: `${dv.wind} km/h` },
                { label: "Confidence", value: `${riskConfidence}%` },
              ].map(({ label, value }) => (
                <div key={label} className="alerts-detail-item">
                  <span>{label}</span><strong>{value}</strong>
                </div>
              ))}
            </div>
          </AlertCard>
        )}

      </div>
    </main>
  );
}
