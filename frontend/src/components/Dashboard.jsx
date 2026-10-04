/**
 * SKYRA – Dashboard
 *
 * All live risk data now comes from useGlobalAlert() (globalAlertService.js).
 * Dashboard no longer runs its own GPS/weather/ML/pred/advice pipeline —
 * it reads from the shared module-level cache.  This guarantees Dashboard and
 * AlertsAdvisories always show identical risk values.
 */
import { useRef, useState, useEffect } from "react";
import Header  from "./Header";
import RiskMap from "./RiskMap";
import {
  useGlobalAlert,
  resolveDisplayValues,
  getRiskClass,
  DEMO_SCENARIOS,
} from "../services/globalAlertService";
import { playAlertAudio, showBrowserNotification } from "../services/notificationService";
import {
  EMERGENCY_STATES,
  getStoredEmergencyState,
  subscribeEmergencyState,
  apiUpdateSafetyStatus,
} from "../services/emergencyService";
import { formatLocationHierarchy } from "../services/locationService";

// ─── Historical Intelligence Card ────────────────────────────────────────────
function HistoricalIntelligenceCard({ result, loading }) {
  if (loading) {
    return (
      <article className="panel glass-panel hist-intel-panel">
        <div className="panel-header">
          <div><p className="eyebrow">HISTORICAL INTELLIGENCE</p><h3>Historical Pattern Intelligence</h3></div>
          <span className="status-meta">Analysing…</span>
        </div>
        <p className="empty-state">Running historical pattern analysis…</p>
      </article>
    );
  }
  if (!result || result.status === "insufficient_data") {
    return (
      <article className="panel glass-panel hist-intel-panel">
        <div className="panel-header">
          <div><p className="eyebrow">HISTORICAL INTELLIGENCE</p><h3>Historical Pattern Intelligence</h3></div>
          <span className="status-meta">Unavailable</span>
        </div>
        <p className="empty-state">Insufficient live weather data for historical pattern analysis.</p>
      </article>
    );
  }
  if (result.status === "data_unavailable") {
    return (
      <article className="panel glass-panel hist-intel-panel">
        <div className="panel-header">
          <div><p className="eyebrow">HISTORICAL INTELLIGENCE</p><h3>Historical Pattern Intelligence</h3></div>
          <span className="status-meta">Unavailable</span>
        </div>
        <p className="empty-state">{result.explanation}</p>
      </article>
    );
  }
  if (result.status === "no_coordinates") {
    return (
      <article className="panel glass-panel hist-intel-panel">
        <div className="panel-header">
          <div><p className="eyebrow">HISTORICAL INTELLIGENCE</p><h3>Historical Pattern Intelligence</h3></div>
          <span className="status-meta">Unavailable</span>
        </div>
        <p className="empty-state">{result.explanation}</p>
      </article>
    );
  }
  const riskTone   = String(result.historicalRisk ?? "low").toLowerCase();
  const matchPct   = result.patternMatch ?? 0;
  const matchColour =
    matchPct >= 75 ? "var(--red)" : matchPct >= 51 ? "var(--amber)" : "var(--green)";
  const trendIcon  = result.historicalTrend === "Increasing" ? "↑" : result.historicalTrend === "Decreasing" ? "↓" : "→";
  const trendLabel = result.historicalTrend ?? "Stable";

  // Determine badge: show real data source or demo indicator
  let badgeText = result.dataReliability;
  let badgeClass = "hist-intel-badge";
  if (result.dataReliability === "Live API") {
    badgeClass = "hist-live-badge";
  } else if (result.dataReliability === "DEMO — Simulated Data") {
    badgeClass = "hist-demo-badge";
  }

  return (
    <article className="panel glass-panel hist-intel-panel">
      <div className="panel-header slim">
        <div><p className="eyebrow">HISTORICAL INTELLIGENCE</p><h3>Historical Pattern Intelligence</h3></div>
        <span className={badgeClass}>{badgeText}</span>
      </div>
      <div className="hist-match-block">
        <div className="hist-match-label-row">
          <span className="hist-match-label">Pattern Match</span>
          <strong className="hist-match-value" style={{ color: matchColour }}>{matchPct}%</strong>
        </div>
        <div className="hist-match-bar-track">
          <div className="hist-match-bar-fill" style={{ width: `${matchPct}%`, background: matchColour }} />
        </div>
        <span className="hist-similarity-level">{result.similarityLevel} similarity</span>
      </div>
      <div className="hist-metrics">
        <div className="hist-metric"><span>Historical Risk</span><strong className={`hist-risk-value ${riskTone}`}>{result.historicalRisk}</strong></div>
        <div className="hist-metric"><span>Similar Events</span><strong>{result.similarEventCount}</strong></div>
        <div className="hist-metric"><span>Trend</span><strong>{trendIcon} {trendLabel}</strong></div>
        <div className="hist-metric"><span>Impact Likelihood</span><strong>{result.impactLikelihood}%</strong></div>
      </div>
      <div className="hist-impact-block">
        <p className="hist-impact-label">Most Common Past Impact</p>
        <p className="hist-impact-value">{result.commonImpact}</p>
      </div>
      <div className="hist-insight-block">
        <p className="hist-insight-label">Pattern Insight</p>
        <p className="hist-insight-text">{result.explanation}</p>
      </div>
      <div className="hist-footer">
        <span className="hist-coverage">{result.dataCoverage}</span>
        <span className="hist-source">{result.dataSource}</span>
      </div>
    </article>
  );
}

// ─── Predictive Impact Card (Phase 6) ────────────────────────────────────────
// Displays the authoritative backend impact assessment.
// In live mode: data comes from backend impactAssessmentService (Phase 6).
// In demo mode: data comes from client-side predictImpacts() (offline).
function PredictiveImpactCard({ result, loading }) {
  if (loading) {
    return (
      <article className="panel glass-panel pred-impact-panel">
        <div className="panel-header">
          <div><p className="eyebrow">PREDICTIVE IMPACT NETWORK</p><h3>Impact Assessment</h3></div>
          <span className="status-meta">Analysing…</span>
        </div>
        <p className="empty-state">Running impact analysis…</p>
      </article>
    );
  }
  if (!result || result.hazard === "Insufficient Data") {
    return (
      <article className="panel glass-panel pred-impact-panel">
        <div className="panel-header">
          <div><p className="eyebrow">PREDICTIVE IMPACT NETWORK</p><h3>Impact Assessment</h3></div>
          <span className="status-meta">Unavailable</span>
        </div>
        <p className="empty-state">Insufficient live weather data to generate impact assessment.</p>
      </article>
    );
  }
  if (result.hazard === "No Significant Hazard") {
    return (
      <article className="panel glass-panel pred-impact-panel">
        <div className="panel-header slim">
          <div><p className="eyebrow">PREDICTIVE IMPACT NETWORK</p><h3>Impact Assessment</h3></div>
          <span className="pred-level-badge advisory">Advisory</span>
        </div>
        <div className="pred-no-hazard">
          <span className="pred-no-hazard-icon">✅</span>
          <p>No significant hazard detected under current conditions.</p>
          <p className="pred-explanation">{result.explanation}</p>
        </div>
        {result.dataSource && <p className="pred-source">{result.dataSource}</p>}
      </article>
    );
  }

  // Phase 6 extended fields (from backend impact assessment via pred bridge)
  const impactSeverity    = result.impactSeverity ?? null;
  const activeHazards     = result.activeHazards ?? [];
  const predictiveNetwork = result.predictiveNetwork ?? [];
  const locationFactors   = result.locationSpecificFactors ?? [];
  const infrastructure    = result.infrastructure ?? [];
  const community         = result.community ?? [];
  const limitations       = result.limitations ?? [];
  const recommendedActions= result.recommendedActions ?? [];

  // Fallback to legacy fields if Phase 6 fields are not present (demo mode)
  const hasPhase6 = impactSeverity !== null || activeHazards.length > 0 || predictiveNetwork.length > 0;

  const levelClass = { Advisory:"advisory", Watch:"watch", Warning:"warning", Severe:"severe" }[result.impactLevel] ?? "advisory";
  const confColour = result.confidence >= 75 ? "var(--red)" : result.confidence >= 55 ? "var(--amber)" : "var(--green)";

  // Severity color
  const sevColour = !impactSeverity ? null
    : impactSeverity.label === "Critical" || impactSeverity.label === "Severe" ? "var(--red)"
    : impactSeverity.label === "Significant" ? "var(--amber)"
    : "var(--green)";

  return (
    <article className="panel glass-panel pred-impact-panel">
      <div className="panel-header slim">
        <div><p className="eyebrow">PREDICTIVE IMPACT NETWORK</p><h3>Impact Assessment</h3></div>
        <span className={`pred-level-badge ${levelClass}`}>{result.impactLevel}</span>
      </div>

      {/* Detected Hazard + Phase 6 Severity */}
      <div className="pred-hazard-row">
        <div className="pred-hazard-name">
          <span className="pred-hazard-label">Detected Hazard</span>
          <strong>{result.hazard}</strong>
          {result.isPredictor && <span className="pred-indicator">🔮 Predicted</span>}
          {!result.isPredictor && impactSeverity && <span className="pred-indicator">📡 Backend Assessment</span>}
        </div>

        {/* Phase 6: Impact Severity (distinct from riskScore and ML confidence) */}
        {impactSeverity ? (
          <div className="pred-confidence-block">
            <span className="pred-conf-label">Impact Severity Score</span>
            <div className="pred-conf-bar-track">
              <div className="pred-conf-bar-fill" style={{ width:`${impactSeverity.score}%`, background: sevColour }} />
            </div>
            <span className="pred-conf-value" style={{ color: sevColour }}>
              {impactSeverity.score}/100 — <strong>{impactSeverity.label}</strong>
            </span>
            <span className="pred-conf-label" style={{ fontSize: "0.72rem", marginTop: 2, color: "var(--muted)" }}>
              ⚠️ Distinct from ML risk score &amp; model confidence
            </span>
          </div>
        ) : (
          <div className="pred-confidence-block">
            <span className="pred-conf-label">Prediction Confidence</span>
            <div className="pred-conf-bar-track">
              <div className="pred-conf-bar-fill" style={{ width:`${result.confidence}%`, background:confColour }} />
            </div>
            <span className="pred-conf-value" style={{ color:confColour }}>{result.confidence}% — {result.confidenceLabel}</span>
          </div>
        )}
      </div>

      {/* Phase 6: Impact severity basis (what drove the severity score) */}
      {impactSeverity && impactSeverity.basis && impactSeverity.basis.length > 0 && (
        <div className="pred-detail-block" style={{ marginBottom: 10 }}>
          <p className="pred-detail-label">📊 Severity Evidence</p>
          <ul className="pred-detail-list">
            {impactSeverity.basis.map((b, i) => <li key={i}>{b}</li>)}
            {impactSeverity.amplifiers && impactSeverity.amplifiers.map((a, i) => (
              <li key={`amp-${i}`} style={{ color: "var(--muted)", fontSize: "0.82rem" }}>↑ {a}</li>
            ))}
          </ul>
          {impactSeverity.note && <p style={{ fontSize: "0.73rem", color: "var(--muted)", marginTop: 4 }}>{impactSeverity.note}</p>}
        </div>
      )}

      {/* Phase 6: Active hazard types */}
      {activeHazards.length > 0 && activeHazards[0]?.type !== "none" && (
        <div className="pred-detail-block" style={{ marginBottom: 10 }}>
          <p className="pred-detail-label">⚡ Active Hazard Categories</p>
          <div className="pred-other-list">
            {activeHazards.map((h, i) => (
              <span key={i} className={`pred-other-tag${h.potential ? "" : " pred-active-tag"}`}>
                {h.label}{h.potential ? " (potential)" : " (active)"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Legacy grid (or Phase 6 impact consequences as first item) */}
      {!hasPhase6 ? (
        <div className="pred-detail-grid">
          <div className="pred-detail-block"><p className="pred-detail-label">📍 Affected Areas</p><ul className="pred-detail-list">{(result.affectedAreas || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
          <div className="pred-detail-block"><p className="pred-detail-label">🏗️ Affected Infrastructure</p><ul className="pred-detail-list">{(result.affectedInfrastructure || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
          <div className="pred-detail-block"><p className="pred-detail-label">⚠️ Possible Disruptions</p><ul className="pred-detail-list">{(result.possibleDisruptions || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
          <div className="pred-detail-block"><p className="pred-detail-label">🧑‍🤝‍🧑 Vulnerable Groups</p><ul className="pred-detail-list">{(result.vulnerableGroups || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
        </div>
      ) : (
        <>
          {/* Phase 6: Per-hazard impact consequences */}
          {(result.affectedAreas || []).length > 0 && (
            <div className="pred-detail-block">
              <p className="pred-detail-label">💥 Likely Impacts</p>
              <ul className="pred-detail-list">
                {(result.affectedAreas || []).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {/* Phase 6: Infrastructure impact */}
          {infrastructure.length > 0 && (
            <div className="pred-detail-block">
              <p className="pred-detail-label">🏗️ Infrastructure Impact</p>
              {infrastructure.map((inf, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <strong style={{ fontSize: "0.83rem" }}>{inf.domain}</strong>
                  <span className={`pred-other-tag${inf.status?.toLowerCase().includes("likely") ? " pred-active-tag" : ""}`} style={{ marginLeft: 6, fontSize: "0.75rem" }}>{inf.status}</span>
                  <ul className="pred-detail-list" style={{ marginTop: 2 }}>
                    {(inf.details || []).map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                  {inf.limitation && <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>⚠️ {inf.limitation}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Phase 6: Community impact */}
          {community.length > 0 && (
            <div className="pred-detail-block">
              <p className="pred-detail-label">🧑‍🤝‍🧑 Community Impact</p>
              {community.map((cm, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <strong style={{ fontSize: "0.83rem" }}>{cm.domain}</strong>
                  <span className={`pred-other-tag${cm.level?.toLowerCase().includes("significant") || cm.level?.toLowerCase().includes("critical") ? " pred-active-tag" : ""}`} style={{ marginLeft: 6, fontSize: "0.75rem" }}>{cm.level}</span>
                  <ul className="pred-detail-list" style={{ marginTop: 2 }}>
                    {(cm.details || []).map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                  {cm.qualification && <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>📝 {cm.qualification}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Phase 6: Location-specific factors */}
      {locationFactors.length > 0 && (
        <div className="pred-detail-block">
          <p className="pred-detail-label">📍 Location-Specific Factors</p>
          <ul className="pred-detail-list">
            {locationFactors.map((f, i) => (
              <li key={i}><strong>{f.factor}:</strong> {f.value} {f.note ? `— ${f.note}` : ""}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Phase 6: Predictive Impact Network (causal chain) */}
      {predictiveNetwork.length > 0 && (
        <div className="pred-detail-block">
          <p className="pred-detail-label">🔗 Causal Impact Chain</p>
          {predictiveNetwork.slice(0, 2).map((chain, ci) => (
            <div key={ci} style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: "0.82rem", color: "var(--amber)" }}>{chain.hazard}</strong>
              <div style={{ borderLeft: "2px solid var(--amber)", paddingLeft: 8, marginTop: 4 }}>
                {(chain.links || []).map((link, li) => (
                  <div key={li} style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>{link.step}</span>
                    <span style={{ fontSize: "0.80rem" }}>{link.description}</span>
                    {link.qualifier && <span style={{ fontSize: "0.68rem", color: "var(--muted)", marginLeft: 4 }}>({link.qualifier})</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommended Actions (Phase 6: hazard-specific, not generic) */}
      {recommendedActions.length > 0 && (
        <div className="pred-actions-block">
          <p className="pred-detail-label">✓ Recommended Actions</p>
          <ul className="pred-detail-list pred-actions-list">
            {recommendedActions.slice(0, 6).map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
      {!recommendedActions.length && result.affectedFacilities && result.affectedFacilities.length > 0 && (
        <div className="pred-facilities-block">
          <p className="pred-detail-label">🏥 Critical Facilities at Risk</p>
          <div className="pred-access-status">
            <span className={`access-badge access-${result.accessDifficulty?.toLowerCase() ?? "normal"}`}>
              Emergency Access: {result.accessDifficulty || "Normal"}
            </span>
          </div>
          <ul className="pred-detail-list">{(result.affectedFacilities || []).map((f)=><li key={f}>{f}</li>)}</ul>
        </div>
      )}

      {/* Emergency services (legacy / demo mode) */}
      {!hasPhase6 && (
        <div className="pred-emergency-block">
          <p className="pred-detail-label">🚨 Emergency Services</p>
          <ul className="pred-detail-list pred-emergency-list">{(result.emergencyServices || ["Standard civic readiness."]).map((i)=><li key={i}>{i}</li>)}</ul>
        </div>
      )}

      {/* Explanation */}
      <div className="pred-explanation-block">
        <p className="pred-detail-label">🔮 Impact Explanation</p>
        <p className="pred-explanation-text">{result.explanation}</p>
      </div>

      {/* Phase 6: Limitations / data boundary */}
      {limitations.length > 0 && (
        <div className="pred-detail-block" style={{ marginTop: 8 }}>
          <p className="pred-detail-label" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>⚠️ Assessment Limitations</p>
          <ul className="pred-detail-list" style={{ fontSize: "0.73rem", color: "var(--muted)" }}>
            {limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}

      {/* All detected hazards (multi-hazard) */}
      {Array.isArray(result.allDetectedHazards) && result.allDetectedHazards.length > 1 && (
        <div className="pred-other-hazards">
          <p className="pred-detail-label">Also detected</p>
          <div className="pred-other-list">
            {result.allDetectedHazards.slice(1).map((h)=>(
              <span key={h.hazard} className="pred-other-tag">{h.hazard} — {h.confidence}%</span>
            ))}
          </div>
        </div>
      )}
      <p className="pred-source">{result.dataSource}</p>
    </article>
  );
}

// ─── Actionable Advice Card ───────────────────────────────────────────────────
function ActionableAdviceCard({ result, loading }) {
  if (loading) {
    return (
      <article className="panel glass-panel advice-panel">
        <div className="panel-header">
          <div><p className="eyebrow">ACTIONABLE ADVICE</p><h3>What You Should Do Now</h3></div>
          <span className="status-meta">Analysing…</span>
        </div>
        <p className="empty-state">Generating advice…</p>
      </article>
    );
  }
  if (!result) {
    return (
      <article className="panel glass-panel advice-panel">
        <div className="panel-header">
          <div><p className="eyebrow">ACTIONABLE ADVICE</p><h3>What You Should Do Now</h3></div>
          <span className="status-meta">Unavailable</span>
        </div>
        <p className="empty-state">Advice unavailable — live weather data is required.</p>
      </article>
    );
  }
  const priorityClass = result.priority?.toLowerCase() ?? "routine";
  return (
    <article className="panel glass-panel advice-panel">
      <div className="panel-header slim">
        <div><p className="eyebrow">ACTIONABLE ADVICE</p><h3>What You Should Do Now</h3></div>
        <span className="advice-priority-badge" style={{ color:result.priorityColour, borderColor:result.priorityColour }}>{result.priority}</span>
      </div>
      <div className={`advice-title-block advice-${priorityClass}`}>
        <strong className="advice-title">{result.title}</strong>
        <p className="advice-context">{result.context}</p>
      </div>
      <div className="advice-columns">
        <div className="advice-col"><p className="advice-col-label">✅ Do Now</p><ul className="advice-list">{(result.immediateActions || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
        <div className="advice-col"><p className="advice-col-label">🚫 Avoid</p><ul className="advice-list advice-avoid">{(result.avoidActions || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
        <div className="advice-col"><p className="advice-col-label">🎒 Prepare</p><ul className="advice-list">{(result.preparationActions || []).map((i)=><li key={i}>{i}</li>)}</ul></div>
      </div>
      <div className="advice-emergency-block">
        <p className="advice-col-label">🚨 If Situation Worsens</p>
        <ul className="advice-list advice-emergency-list">{(result.emergencyGuidance || []).map((i)=><li key={i}>{i}</li>)}</ul>
      </div>
      <div className="advice-explanation-block"><p className="advice-explanation-text">{result.explanation}</p></div>
      <p className="advice-source">{result.dataSource}</p>
    </article>
  );
}

// ─── Why This Risk Card (Phase 7 Explainable AI) ─────────────────────────────
function WhyThisRiskCard({ xai, riskLevel, riskScore, riskConfidence, predHazard, locationName, loading }) {
  if (loading) {
    return (
      <article className="panel glass-panel xai-panel">
        <div className="panel-header">
          <div><p className="eyebrow">EXPLAINABLE AI (XAI)</p><h3>Why This Risk?</h3></div>
          <span className="status-meta">Attributing…</span>
        </div>
        <p className="empty-state">Running model feature attribution and atmospheric threshold analysis…</p>
      </article>
    );
  }

  const factors = Array.isArray(xai?.factors) ? xai.factors : [];
  const explanation = xai?.whyThisRisk || xai?.explanation || xai?.summary || null;
  const method = xai?.explanationMethod || "Tree-Path Feature Attribution";
  const calibMethod = xai?.confidenceExplanation?.calibrationMethod || "Platt Sigmoid (5-fold CV)";
  const isCalibrated = xai?.confidenceExplanation?.isCalibrated ?? true;

  if (!explanation && factors.length === 0 && !predHazard) {
    return (
      <article className="panel glass-panel xai-panel">
        <div className="panel-header">
          <div><p className="eyebrow">EXPLAINABLE AI (XAI)</p><h3>Why This Risk?</h3></div>
          <span className="status-meta">Unavailable</span>
        </div>
        <p className="empty-state">Model feature attribution data is currently unavailable for this location.</p>
      </article>
    );
  }

  return (
    <article className="panel glass-panel xai-panel">
      <div className="panel-header slim">
        <div>
          <p className="eyebrow">EXPLAINABLE AI (XAI)</p>
          <h3>Why This Risk? — Model Attribution &amp; Physical Reasoning</h3>
        </div>
        <span className="xai-badge">{method}</span>
      </div>

      {explanation && (
        <div className="xai-reasoning-block">
          <p className="xai-reasoning-label">🧠 Meteorological Reasoning</p>
          <p className="xai-reasoning-text">{explanation}</p>
        </div>
      )}

      {factors.length > 0 && (
        <>
          <p className="xai-reasoning-label" style={{ marginTop: 12 }}>⚡ Contributing Environmental Factors</p>
          <div className="xai-grid">
            {factors.map((f, idx) => {
              const isObj = typeof f === "object" && f !== null;
              const name = isObj ? f.name || f.feature || "Factor" : (f.includes(":") ? f.split(":")[0] : "Observation");
              const detail = isObj ? (f.detail || f.impact || f.value || "") : (f.includes(":") ? f.split(":").slice(1).join(":").trim() : f);
              return (
                <div key={idx} className="xai-factor-card">
                  <span className="xai-factor-name">{name}</span>
                  <span className="xai-factor-detail">{detail}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {predHazard && predHazard !== "No Significant Hazard" && (
        <div className="xai-calib-note">
          <span>Primary Hazard Driver: <strong>{predHazard}</strong> for {locationName || "Monitored Region"}</span>
          <span>Certainty: <strong>{riskConfidence}%</strong> ({isCalibrated ? calibMethod : "Uncalibrated"})</span>
        </div>
      )}
    </article>
  );
}

// ─── Upcoming Forecast & Hazard Window (Section E) ────────────────────────────
function ForecastWindowCard({ forecast, weather, loading, onNavigate }) {
  if (loading) {
    return (
      <article className="panel glass-panel forecast-panel">
        <div className="panel-header">
          <div><p className="eyebrow">METEOROLOGICAL OUTLOOK</p><h3>Upcoming Hazard Window &amp; Hourly Forecast</h3></div>
          <span className="status-meta">Loading…</span>
        </div>
        <p className="empty-state">Ingesting NWP hourly forecast telemetry…</p>
      </article>
    );
  }

  const hourly = Array.isArray(forecast?.hourly) ? forecast.hourly : [];
  const precipitationExpected = Number(forecast?.precipitationExpected ?? 0);
  const precipitationExpected24h = Number(
    forecast?.precipitationExpected24h ??
    forecast?.daily?.[0]?.rainSum ??
    (hourly.length > 0
      ? hourly.slice(0, 24).reduce((acc, h) => acc + Number(h.precipitation ?? h.rain ?? 0), 0)
      : precipitationExpected)
  );
  const maxRainProbability = Number(forecast?.maxRainProbability ?? 0);

  // Take next 4–6 intervals
  const displayHours = hourly.slice(0, 6);

  if (displayHours.length === 0) {
    return (
      <article className="panel glass-panel forecast-panel">
        <div className="panel-header slim">
          <div><p className="eyebrow">METEOROLOGICAL OUTLOOK</p><h3>Upcoming Hazard Window &amp; Hourly Forecast</h3></div>
          <span className="status-meta">Awaiting Data</span>
        </div>
        <p className="empty-state">Hourly forecast data is currently awaiting location acquisition. Check active location permissions or search a city.</p>
        <div className="forecast-footer-action">
          <button type="button" className="action-button secondary" onClick={() => onNavigate("Forecast & History")}>
            Open Full Forecast &amp; History →
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="panel glass-panel forecast-panel">
      <div className="panel-header slim">
        <div>
          <p className="eyebrow">METEOROLOGICAL OUTLOOK</p>
          <h3>Upcoming Hazard Window &amp; Hourly Forecast</h3>
        </div>
        <span className="status-meta active">NWP Forecast Horizon</span>
      </div>

      <div className="forecast-summary-row">
        <div className="forecast-stat-card">
          <span>24h Rain Volume (Total)</span>
          <strong>{precipitationExpected24h > 0 ? `${precipitationExpected24h.toFixed(1)} mm (24h total)` : "0.0 mm (Minimal)"}</strong>
        </div>
        <div className="forecast-stat-card">
          <span>Peak Rain Probability</span>
          <strong>{maxRainProbability}%</strong>
        </div>
        <div className="forecast-stat-card">
          <span>Hazard Trend</span>
          <strong>
            {maxRainProbability >= 70 ? "↑ Escalating Precipitation" : maxRainProbability >= 40 ? "→ Moderate Stability" : "↓ Stable Conditions"}
          </strong>
        </div>
      </div>

      <div className="forecast-timeline-track">
        {displayHours.map((h, i) => {
          const rain = Number(h.precipitation ?? h.rain ?? 0);
          const prob = Number(h.rainProbability ?? h.precipitation_probability ?? 0);
          const temp = Math.round(Number(h.temperature ?? h.temperature_2m ?? 0));
          const wind = Math.round(Number(h.windSpeed ?? h.wind_speed_10m ?? 0));
          const timeLabel = h.time?.includes("T")
            ? new Date(h.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : h.time;
          const icon = (rain > 20 || prob > 80) ? "⛈️" : (rain > 5 || prob > 50) ? "🌧️" : (wind > 45) ? "💨" : (temp > 38) ? "🌡️" : "⛅";

          return (
            <div key={i} className="forecast-hour-card">
              <span className="forecast-hour-time">{timeLabel}</span>
              <span className="forecast-hour-icon">{icon}</span>
              <strong className="forecast-hour-temp">{temp}°C</strong>
              <span className="forecast-hour-rain">💧 {prob}% ({rain} mm)</span>
              <span className="forecast-hour-wind">💨 {wind} km/h</span>
            </div>
          );
        })}
      </div>

      <div className="forecast-footer-action">
        <button type="button" className="action-button secondary" onClick={() => onNavigate("Forecast & History")}>
          View Full 7-Day Forecast &amp; History Trends →
        </button>
      </div>
    </article>
  );
}

// ─── Ask SKYRA Quick Assistant Card (Section I) ──────────────────────────────
function AskSkyraCard({ onNavigate, locationName }) {
  const [inputVal, setInputVal] = useState("");

  const suggestionPrompts = [
    "Is it safe to travel in my area right now?",
    "When will the rainfall peak today?",
    "Where is the nearest verified emergency shelter?",
    "Explain the contributing factors for my risk level",
  ];

  function handleAsk(promptText) {
    const q = (promptText || inputVal || "").trim();
    if (!q) return;
    try {
      sessionStorage.setItem("skyra_initial_query", q);
    } catch {}
    onNavigate("WeatherGPT");
  }

  function handleVoice() {
    onNavigate("WeatherGPT");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      handleAsk();
    }
  }

  return (
    <article className="panel glass-panel ask-skyra-panel">
      <div className="panel-header slim">
        <div>
          <p className="eyebrow">CONVERSATIONAL DISASTER ASSISTANT</p>
          <h3>Ask SKYRA — AI Weather &amp; Hazard Intelligence</h3>
        </div>
        <span className="xai-badge">6 Languages: EN, HI, ML, TA, TE, KN</span>
      </div>

      <p className="ask-chips-title">💬 Suggested Questions for {locationName || "Your Area"}</p>
      <div className="ask-chips-list">
        {suggestionPrompts.map((p, idx) => (
          <button key={idx} type="button" className="ask-chip-btn" onClick={() => handleAsk(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="ask-input-bar">
        <input
          type="text"
          className="ask-input-field"
          placeholder="Ask SKYRA about weather conditions, flood risk, shelters, or precautions…"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="ask-input-actions">
          <button type="button" className="action-button primary" onClick={() => handleAsk()}>
            Ask
          </button>
          <button type="button" className="action-button" onClick={handleVoice}>
            🎙️ Voice
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Alerts & Advisories Overview Block (Section H) ─────────────────────────
function AlertsSummaryCard({ activeAlert, imdAdvisories, riskLevel, onNavigate, alertSoundEnabled, setAlertSoundEnabled }) {
  const isP1 = activeAlert?.priority === "P1" || riskLevel === "Severe";
  const isP2 = activeAlert?.priority === "P2" || riskLevel === "High";
  const hasActiveAlert = Boolean(activeAlert);

  const priorityLabel = isP1 ? "P1 Critical Alert" : isP2 ? "P2 High Alert" : "P3 Advisory";
  const priorityClass = isP1 ? "severe" : isP2 ? "high" : "moderate";

  return (
    <article className="panel glass-panel alerts-overview-panel">
      <div className="panel-header slim">
        <div>
          <p className="eyebrow">SMART ALERTS &amp; WARNINGS</p>
          <h3>Active Regional Alerts &amp; CAP Feeds</h3>
        </div>
        <span className={`risk-pill ${hasActiveAlert ? priorityClass : "low"}`}>
          {hasActiveAlert ? priorityLabel : "Normal Monitoring"}
        </span>
      </div>

      <div className="alerts-overview-body">
        <div className="alerts-overview-info">
          <h4>{activeAlert?.title || (imdAdvisories?.warningColor ? `IMD ${imdAdvisories.warningColor} Warning: ${imdAdvisories.title || "Severe Weather"}` : "No Active Meteorological Warnings")}</h4>
          <p>
            {activeAlert?.message || imdAdvisories?.description || "All public early warning feeds (IMD, NDMA, SDMA) currently report baseline levels. Continuous telemetry monitoring remains active."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="action-button"
            onClick={() => setAlertSoundEnabled && setAlertSoundEnabled(!alertSoundEnabled)}
            title={alertSoundEnabled ? "Mute siren audio" : "Enable siren audio"}
          >
            {alertSoundEnabled ? "🔊 Siren On" : "🔇 Siren Muted"}
          </button>
          <button
            type="button"
            className="action-button primary"
            onClick={() => onNavigate("Alerts & Advisories")}
          >
            View All Alerts →
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

// ── City Search ───────────────────────────────────────────────────────────────
// Geocodes via Nominatim (same OSM source as RiskMap tiles).
// Calls setManualLoc from the global alert service to re-run the pipeline.
function CitySearch({ disabled, setManualLoc, clearManualLoc, manualLocation }) {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [searchErr,  setSearchErr]  = useState("");
  const [open,       setOpen]       = useState(false);
  const debounceRef  = useRef(null);
  const inputRef     = useRef(null);

  // Debounced geocode with local prioritization
  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    setSearchErr("");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim() || val.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q",              val.trim() + ", India");
        url.searchParams.set("format",         "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit",          "15");
        url.searchParams.set("countrycodes",   "in");
        const res = await fetch(url.toString(), {
          headers: { "User-Agent": "SKYRA-SIH2026/1.0 (disaster-awareness-app)" },
          signal: AbortSignal.timeout(6_000),
        });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        
        // Filter and prioritize results
        let hits = data
          .filter(r => r.lat && r.lon && r.address)
          .map(r => {
            const addr = r.address || {};
            const hierarchy = formatLocationHierarchy(addr);
            const city   = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || null;
            const state  = addr.state || addr.region || null;
            
            // Skip results that are just state/country level
            if (!hierarchy && !city) return null;
            
            return {
              id:          r.place_id,
              displayName: r.display_name,
              // Required format: CITY/LOCALITY, DISTRICT, STATE
              shortLabel:  hierarchy || [city, state].filter(Boolean).join(", "),
              lat:         Number(r.lat),
              lon:         Number(r.lon),
              // Sort priority: city/town > village > other
              priority:    r.type === "city" ? 0 : r.type === "town" ? 1 : r.type === "village" ? 2 : 3,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.priority - b.priority)
          .slice(0, 5);
        
        setResults(hits);
        setOpen(hits.length > 0);
      } catch {
        setSearchErr("Search unavailable");
        setResults([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function selectResult(hit) {
    // Store with both short label (for header) and full display name
    setManualLoc(hit.lat, hit.lon, hit.shortLabel);
    setQuery(hit.shortLabel);
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setOpen(false);
    setSearchErr("");
    clearManualLoc();
    if (inputRef.current) inputRef.current.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") { setOpen(false); setResults([]); }
    if (e.key === "Enter"  && results.length > 0) selectResult(results[0]);
  }

  const hasManual = Boolean(manualLocation);

  return (
    <div className="city-search-wrap" role="search" aria-label="City search">
      <div className="city-search-field">
        <span className="city-search-icon" aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="city-search-input"
          placeholder={disabled ? "Exit Demo to search" : "Search city…"}
          value={query}
          disabled={disabled}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          autoComplete="off"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {searching && <span className="city-search-spinner" aria-hidden="true">⏳</span>}
        {(query || hasManual) && !disabled && (
          <button
            type="button"
            className="city-search-clear"
            onClick={handleClear}
            aria-label="Clear search"
          >✕</button>
        )}
      </div>

      {searchErr && (
        <p className="city-search-error">{searchErr}</p>
      )}

      {open && results.length > 0 && (
        <ul className="city-search-dropdown" role="listbox">
          {results.map(hit => (
            <li
              key={hit.id}
              className="city-search-option"
              role="option"
              // onMouseDown avoids the blur-before-click race
              onMouseDown={() => selectResult(hit)}
            >
              <span className="city-search-option-name">{hit.shortLabel}</span>
            </li>
          ))}
        </ul>
      )}

      {hasManual && !disabled && (
        <p className="city-search-active-label">
          📍 {manualLocation.displayName}
        </p>
      )}
    </div>
  );
}

function Dashboard({ onNavigate, activePage, currentLocation, savedLocation, alertSoundEnabled, setAlertSoundEnabled }) {
  // ── All live data from the shared global hook ──────────────────────────────
  const { cache, loading, demo, demoScenario, setDemo, setScenario,
          setManualLoc, clearManualLoc, manualLocation, retryLocation } = useGlobalAlert();
  const dv = resolveDisplayValues(cache, demo, demoScenario);

  // ── Phase 13: Emergency state machine subscription ─────────────────────────
  const [emergencyData, setEmergencyData] = useState(getStoredEmergencyState);
  useEffect(() => {
    const unsub = subscribeEmergencyState((updated) => {
      setEmergencyData(updated);
    });
    return unsub;
  }, []);

  async function handleMarkSafe() {
    try {
      await apiUpdateSafetyStatus({ safetyStatus: "SAFE", note: "Marked safe from unified dashboard" });
    } catch (err) {
      console.warn("[Dashboard] Mark safe warning:", err.message);
    }
  }

  async function handleRequestHelp() {
    try {
      await apiUpdateSafetyStatus({ safetyStatus: "HELP_NEEDED", note: "Assistance requested from unified dashboard" });
    } catch (err) {
      console.warn("[Dashboard] Request help warning:", err.message);
    }
  }

  // Derive values used across the unified dashboard
  const riskLevel      = dv.mlRiskLevel;
  const riskScore      = dv.mlRiskScore;
  const riskConfidence = dv.mlConfidence;
  const predResult     = dv.pred;
  const adviceResult   = dv.advice;
  const histResult     = dv.hist;
  const locationName   = dv.locationName;
  const demoAlert      = dv.demoAlert ?? null;
  const nearestShelter = dv.nearestShelter ?? "Check local civic authority";
  const nearestHospital = dv.nearestHospital ?? "Check local hospital directory";
  const riskTone       = getRiskClass(riskLevel);
  const backendActiveAlert = cache?.alerts?.activeAlert ?? null;
  const alertIsActive  = demo ? Boolean(demoAlert) : (backendActiveAlert ? backendActiveAlert.status === "Active" : (riskLevel === "High" || riskLevel === "Severe"));
  const shouldShowAlert = demo ? Boolean(demoAlert) : alertIsActive;

  // Compute mapCenter: manual location > cache location
  // PRIORITY: manual > demo scenario > cache/GPS > null
  const computedMapCenter = demo 
    ? dv.mapCenter  // Demo scenarios have fixed mapCenter
    : manualLocation 
      ? [manualLocation.latitude, manualLocation.longitude]  // Manual city search
      : dv.mapCenter;  // Live location from cache (GPS or fallback)

  // Build weather display object from cache (or null while loading)
  const displayWeather = demo ? dv : cache;
  const weather = (displayWeather && displayWeather.temperature !== null && displayWeather.temperature !== undefined) ? {
    condition: (
      displayWeather.rainfall > 25 && displayWeather.wind > 30 ? "Heavy rainfall with strong wind" :
      displayWeather.rainfall > 25 ? "Heavy rainfall" :
      displayWeather.rainfall > 0 ? "Light rain" :
      displayWeather.wind > 80 ? "Extreme wind" :
      displayWeather.wind > 55 ? "Strong wind" :
      displayWeather.temperature > 40 ? "Extreme heat" :
      "Partly cloudy"
    ),
    temperature: displayWeather.temperature,
    feelsLike:   Math.round(displayWeather.temperature + 2),
    humidity:    `${displayWeather.humidity}%`,
    wind:        `${displayWeather.wind} km/h`,
    rainfall:    `${displayWeather.rainfall} mm/h (past 1 hr)`,
    pressure:    `${displayWeather.pressure} hPa`,
  } : null;

  // GPS & Coordinates display
  const gpsResolved    = demo || !!cache;
  const gpsSource      = displayWeather?.gpsSource  ?? null;
  const gpsCity        = displayWeather?.gpsCity    ?? null;
  const gpsRegion      = displayWeather?.gpsRegion  ?? null;
  const gpsAccuracy    = demo ? null : (displayWeather?.gpsAccuracy ?? null);
  const demoDemoGpsCity = demo ? (dv.demoGpsCity ?? null) : null;

  const activeLat = manualLocation ? manualLocation.latitude : (dv?.latitude ?? cache?.latitude ?? cache?.location?.latitude);
  const activeLon = manualLocation ? manualLocation.longitude : (dv?.longitude ?? cache?.longitude ?? cache?.location?.longitude);
  const hasCoordinates = activeLat != null && activeLon != null && !Number.isNaN(Number(activeLat));
  const coordinatesDisplay = hasCoordinates
    ? `${Number(activeLat).toFixed(4)}° N, ${Number(activeLon).toFixed(4)}° E`
    : gpsSource === "unavailable"
      ? "Location permission required"
      : "Resolving GPS coordinates…";

  const permissionStatusDisplay = demo
    ? "Simulated Demo (Offline)"
    : manualLocation
      ? "Manual City Query (Geocoded)"
      : gpsSource === "unavailable"
        ? "Permission Required / Denied"
        : "Granted (High Accuracy GPS)";

  // Forecast & XAI objects
  const forecastData = dv.forecast ?? cache?.forecast ?? null;
  const xaiData = dv.xai ?? cache?.xai ?? null;
  const imdAdvisories = dv.imdAdvisories ?? cache?.imdAdvisories ?? null;

  // Emergency status label and classes
  const emergencyBadgeLabel =
    emergencyData.state === EMERGENCY_STATES.SOS_SENT || emergencyData.state === EMERGENCY_STATES.HELP_NEEDED
      ? "SOS Distress Active"
      : emergencyData.state === EMERGENCY_STATES.EMERGENCY_ACTIVE
        ? "Emergency Active"
        : emergencyData.state === EMERGENCY_STATES.SAFE
          ? "Marked Safe"
          : emergencyData.state === EMERGENCY_STATES.QUEUED
            ? "Offline Queued"
            : "Standby / Readiness";

  const emergencyBadgeClass =
    emergencyData.state === EMERGENCY_STATES.SOS_SENT || emergencyData.state === EMERGENCY_STATES.HELP_NEEDED
      ? "sos"
      : emergencyData.state === EMERGENCY_STATES.EMERGENCY_ACTIVE
        ? "active"
        : emergencyData.state === EMERGENCY_STATES.SAFE
          ? "normal"
          : emergencyData.state === EMERGENCY_STATES.QUEUED
            ? "queued"
            : "normal";

  // ── Alert sound state tracking ──
  const previousRiskLevelRef = useRef(null);

  useEffect(() => {
    const activeAlert = cache?.alerts?.activeAlert;
    const fingerprint = activeAlert?.fingerprint || `${riskLevel}-${dv.locationName || ""}`;

    const currentRiskLevel = riskLevel;
    const wasPreviouslyBelowSevere =
      previousRiskLevelRef.current && previousRiskLevelRef.current !== "Severe";
    const isNowSevere = currentRiskLevel === "Severe";
    const isNowHigh = currentRiskLevel === "High";

    if ((isNowSevere && wasPreviouslyBelowSevere) || (isNowSevere && !previousRiskLevelRef.current)) {
      if (alertSoundEnabled) {
        playAlertAudio("P1", fingerprint);
      }
      showBrowserNotification({
        id: activeAlert?.id || `alert-${Date.now()}`,
        fingerprint,
        title: activeAlert?.title || `🚨 Severe Weather Risk Alert: ${dv.pred?.hazard || "Severe Hazard"}`,
        message: activeAlert?.message || `Severe risk detected at ${dv.locationName || "your location"}. Check safety recommendations.`,
        priority: "P1",
        onNavigate,
      });
    } else if (isNowHigh && previousRiskLevelRef.current !== "High" && previousRiskLevelRef.current !== "Severe") {
      if (alertSoundEnabled) {
        playAlertAudio("P2", fingerprint);
      }
      showBrowserNotification({
        id: activeAlert?.id || `alert-${Date.now()}`,
        fingerprint,
        title: activeAlert?.title || `⚠️ High Weather Risk: ${dv.pred?.hazard || "Elevated Hazard"}`,
        message: activeAlert?.message || `High risk detected at ${dv.locationName || "your location"}.`,
        priority: "P2",
        onNavigate,
      });
    }

    previousRiskLevelRef.current = currentRiskLevel;
  }, [riskLevel, demo, cache, dv, onNavigate, alertSoundEnabled]);

  // Trace runtime location flow to Dashboard Header
  useEffect(() => {
    const finalHeaderLocation = currentLocation ?? {
      name: !gpsResolved
        ? "Detecting current location…"
        : manualLocation
          ? manualLocation.displayName
          : demo
            ? dv.locationName
            : gpsSource === "unavailable"
              ? "Location unavailable"
              : gpsSource === "demo_fallback"
                ? `${gpsCity ?? "Demo"} (DEMO fallback)`
                : (dv.locationName ?? gpsCity ?? "Current location"),
    };
    console.log("[SKYRA Location Trace]", {
      gpsCity,
      gpsLocationDisplayName: cache?.location?.displayName,
      cacheLocation: cache?.location,
      cacheLocationName: cache?.locationName,
      dvLocationName: dv?.locationName,
      finalHeaderLocationName: finalHeaderLocation?.name,
    });
  }, [gpsCity, cache, dv, currentLocation, gpsResolved, manualLocation, demo, gpsSource]);

  return (
    <main className="skyra-page dashboard-page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        currentLocation={currentLocation ?? {
          name: !gpsResolved
            ? "Detecting current location…"
            : manualLocation
              ? manualLocation.displayName
              : demo
                ? dv.locationName
                : gpsSource === "unavailable"
                  ? "Location unavailable"
                  : gpsSource === "demo_fallback"
                    ? `${gpsCity ?? "Demo"} (DEMO fallback)`
                    : (dv.locationName ?? gpsCity ?? "Current location"),
          area: !gpsResolved
            ? ""
            : manualLocation
              ? "(Searched city)"
              : demo
                ? "Simulated — DEMO mode"
                : gpsSource === "unavailable"
                  ? "Enable GPS or search city"
                  : gpsSource === "demo_fallback"
                    ? "Demo fallback location"
                    : (gpsRegion ?? "Detected via GPS"),
        }}
        savedLocation={savedLocation ?? { name: "Saved Location", address: "Not set" }}
      />

      <div className="page-shell">
        {/* ── Top bar: Operational Overview & Quick Actions ── */}
        <section className="dashboard-topbar panel glass-panel">
          <div>
            <p className="eyebrow">LIVE DISASTER COMMAND CENTER</p>
            <h2>Operational overview</h2>
          </div>

          {/* ── City Search ── */}
          <CitySearch
            disabled={demo}
            setManualLoc={setManualLoc}
            clearManualLoc={clearManualLoc}
            manualLocation={manualLocation}
          />

          <div className="quick-actions">
            <button type="button" className="action-button primary" onClick={() => onNavigate("WeatherGPT")}>Ask SKYRA</button>
            <button type="button" className="action-button"         onClick={() => onNavigate("WeatherGPT")}>Voice 🎙️</button>
            <button type="button" className="action-button danger"  onClick={() => onNavigate("Emergency Response")}>SOS 🚨</button>
          </div>
        </section>

        {/* ── Demo Mode scenario picker ── */}
        <section className="demo-picker-section">
          <div className="demo-picker-bar">
            <button
              type="button"
              className={`action-button${demo ? " danger" : ""}`}
              onClick={() => setDemo(!demo)}
              aria-pressed={demo}
            >
              {demo ? "✕ Exit Demo Mode" : "🎭 Demo Mode"}
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
        </section>

        {/* ── Smart Alert Banner (ARE THERE ALERTS?) ── */}
        {shouldShowAlert && (
          <section className="smart-alert-banner" role="alert" aria-live="assertive">
            <div className="smart-alert-inner">
              <span className="smart-alert-icon">🚨</span>
              <div className="smart-alert-body">
                <strong className="smart-alert-title">
                  {demo ? demoAlert?.title : (backendActiveAlert?.title || `SKYRA ${riskLevel.toUpperCase()} RISK ALERT (${riskScore}/100)`)}
                  {demo && <span className="urban-flood-demo-tag"> DEMO</span>}
                </strong>
                <p className="smart-alert-detail">
                  {demo ? demoAlert?.message : (backendActiveAlert?.message || backendActiveAlert?.recommendedAction || (predResult?.hazard && predResult.hazard !== "No Significant Hazard"
                    ? `Detected: ${predResult.hazard}.`
                    : "Elevated risk detected in your area."))}{" "}
                  Check the Actionable Advice section below for immediate steps.
                </p>
              </div>
              <button type="button" className="action-button danger smart-alert-sos" onClick={() => onNavigate("Emergency Response")}>
                SOS
              </button>
            </div>
          </section>
        )}

        {/* ── Map + ML Risk Overview (WHAT IS THE RISK?) ── */}
        <section className="dashboard-grid">
          <article className="panel glass-panel map-panel">
            <div className="panel-header">
              <div><p className="eyebrow">INTELLIGENT RISK MAP</p><h3>Regional intelligence</h3></div>
              <span className="pulse-dot">Live</span>
            </div>
            <RiskMap
              riskScore={riskScore}
              riskLevel={riskLevel}
              riskConfidence={riskConfidence}
              predHazard={predResult?.hazard ?? null}
              weather={weather}
              mapCenter={computedMapCenter}
              locationLabel={demo ? dv.locationName : locationName}
              demoLocationLabel={demo ? dv.locationName : null}
              isDemoScenario={demo}
              xai={dv?.xai ?? cache?.xai ?? null}
            />
          </article>

          <aside className="panel glass-panel risk-overview-panel">
            <div className="panel-header slim">
              <div><p className="eyebrow">OVERALL RISK</p><h3>Risk intelligence</h3></div>
              <span className={`risk-pill ${riskTone}`}>{riskLevel}</span>
            </div>

            <div className="risk-score-block">
              <strong>{riskScore}</strong><span>/100</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <p style={{
                margin: 0,
                fontSize: "0.82rem",
                fontWeight: 600,
                color: riskLevel === "Severe" ? "var(--red)" : riskLevel === "High" ? "var(--amber)" : riskLevel === "Moderate" ? "var(--blue)" : "var(--green)"
              }}>
                {riskLevel === "Severe" ? "🚨 Severe Risk — Immediate Physical Threat"
                  : riskLevel === "High" ? "⚠️ High Risk — Heightened Threat Level"
                  : riskLevel === "Moderate" ? "⚡ Moderate Risk — Active Hazard Monitoring"
                  : "✅ Low Risk — Baseline Environmental Conditions"}
              </p>
            </div>

            <div className="metric-row">
              <span>ML confidence</span>
              <strong>
                {riskConfidence !== null ? `${riskConfidence}%${dv.confidenceType === "CALIBRATED" ? " (Calibrated)" : ""}` : "—"}
              </strong>
            </div>

            <div className="mini-progress">
              <span style={{ width: `${riskScore}%` }} />
            </div>

            {/* Quick summary link to XAI */}
            <div className="risk-factors">
              <h4>Primary Hazard Context</h4>
              {loading && !cache ? (
                <ul><li>Loading risk explanation…</li></ul>
              ) : (
                <ul>
                  <li>
                    Detected hazard: <strong>{predResult?.hazard || "Baseline Monitoring"}</strong> ({predResult?.impactLevel || "Advisory"}).
                  </li>
                  {locationName && <li>Location: {locationName}.</li>}
                  {xaiData?.summary && <li>{xaiData.summary}</li>}
                </ul>
              )}
            </div>
          </aside>
        </section>

        {/* ── Why This Risk? (WHY IS IT RISKY? - Explainable AI) ── */}
        <section className="why-risk-section">
          <WhyThisRiskCard
            xai={xaiData}
            riskLevel={riskLevel}
            riskScore={riskScore}
            riskConfidence={riskConfidence}
            predHazard={predResult?.hazard ?? null}
            locationName={locationName}
            loading={loading && !cache}
          />
        </section>

        {/* ── Upcoming Forecast & Hazard Window (WHAT MAY HAPPEN? - Forecast) ── */}
        <section className="forecast-section">
          <ForecastWindowCard
            forecast={forecastData}
            weather={weather}
            loading={loading && !cache}
            onNavigate={onNavigate}
          />
        </section>

        {/* ── Predictive Impact Network (WHAT MAY HAPPEN? - Predictive Impact) ── */}
        <section className="pred-impact-section">
          <PredictiveImpactCard result={predResult} loading={loading && !cache} />
        </section>

        {/* ── Actionable Advice (WHAT SHOULD I DO?) ── */}
        <section className="advice-section">
          <ActionableAdviceCard result={adviceResult} loading={loading && !cache} />
        </section>

        {/* ── Historical Pattern Intelligence ── */}
        <section className="hist-intel-section">
          <HistoricalIntelligenceCard result={histResult} loading={loading && !cache} />
        </section>

        {/* ── Active Regional Alerts & CAP Feeds (ARE THERE ALERTS?) ── */}
        <section className="alerts-summary-section">
          <AlertsSummaryCard
            activeAlert={demo ? (demoAlert ? { title: demoAlert.title, message: demoAlert.message, priority: "P1" } : null) : backendActiveAlert}
            imdAdvisories={imdAdvisories}
            riskLevel={riskLevel}
            onNavigate={onNavigate}
            alertSoundEnabled={alertSoundEnabled}
            setAlertSoundEnabled={setAlertSoundEnabled}
          />
        </section>

        {/* ── Ask SKYRA Quick Conversational Assistant (CAN I ASK SKYRA?) ── */}
        <section className="ask-skyra-section">
          <AskSkyraCard onNavigate={onNavigate} locationName={locationName} />
        </section>

        {/* ── Command Triad: Current Weather, Location Monitoring, Emergency Response (WHERE AM I? / WHAT IS WEATHER? / CAN I ENTER EMERGENCY MODE?) ── */}
        <section className="info-grid">
          {/* Current weather (WHAT IS THE WEATHER?) */}
          <article className="panel glass-panel weather-panel">
            <div className="panel-header">
              <div><p className="eyebrow">CURRENT WEATHER</p><h3>Live conditions</h3></div>
              <span className="status-meta">
                {loading && !cache ? "Loading..." : dv.dataSource ? dv.dataSource : "Updated now"}
              </span>
            </div>
            {weather ? (
              <div className="weather-summary">
                <div className="weather-big">
                  <span className="weather-icon">⛅</span>
                  <div>
                    <strong>{weather.temperature}°C</strong>
                    <span>{weather.condition}</span>
                  </div>
                </div>
                <div className="weather-stats">
                  <div><span>Feels like</span><strong>{weather.feelsLike}°C</strong></div>
                  <div><span>Humidity</span><strong>{weather.humidity}</strong></div>
                  <div><span>Wind</span><strong>{weather.wind}</strong></div>
                  <div><span>Rain Rate (1-hr past)</span><strong>{weather.rainfall}</strong></div>
                  <div><span>Pressure</span><strong>{weather.pressure}</strong></div>
                </div>
              </div>
            ) : (
              <p className="empty-state">Waiting for current weather data.</p>
            )}
          </article>

          {/* Location monitoring (WHERE AM I?) */}
          <article className="panel glass-panel monitoring-panel">
            <div className="panel-header">
              <div><p className="eyebrow">LOCATION MONITORING</p><h3>Geospatial status</h3></div>
              <span className={`status-meta ${gpsSource === "unavailable" ? "inactive" : "active"}`}>
                {gpsSource === "unavailable" ? "Unavailable" : !gpsResolved ? "Resolving" : "Active"}
              </span>
            </div>
            <ul className="monitoring-list">
              <li>
                <span>Coordinates</span>
                <strong className="location-coords-badge">{coordinatesDisplay}</strong>
              </li>
              <li>
                <span>GPS Resolution</span>
                <strong>
                  {!gpsResolved ? "Resolving…"
                    : demo ? `Demo Location${demoDemoGpsCity ? ` (${demoDemoGpsCity})` : ""}`
                    : manualLocation ? "Manual city search"
                    : gpsSource === "unavailable" ? "Location unavailable"
                    : gpsSource === "demo_fallback" ? "Demo fallback"
                    : "Resolved Satellite GPS"}
                </strong>
              </li>
              <li>
                <span>Accuracy</span>
                <strong>
                  {demo ? "±10 m (Simulated)"
                    : gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m`
                    : "N/A"}
                </strong>
              </li>
              <li>
                <span>Resolved Location</span>
                <strong>
                  {!gpsResolved ? "Detecting…"
                    : demo ? `${demoDemoGpsCity ?? dv.locationName} (Simulated)`
                    : manualLocation ? manualLocation.displayName
                    : gpsSource === "unavailable" ? "Location unavailable"
                    : gpsSource === "demo_fallback" ? `${gpsCity ?? "Demo"} (DEMO)`
                    : (dv.locationName ?? gpsCity ?? "Your location")}
                </strong>
              </li>
              <li>
                <span>Permission Status</span>
                <strong>{permissionStatusDisplay}</strong>
              </li>
              <li>
                <span>Saved Home</span>
                <strong>{savedLocation?.address ?? "Not set"}</strong>
              </li>
            </ul>

            {(gpsSource === "unavailable" || (!gpsResolved && !loading)) && !demo && !manualLocation && (
              <div className="location-retry-action" style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted, #94a3b8)" }}>
                  {cache?.pred?.explanation || "Location permission required or timed out. Allow GPS in browser or search city above."}
                </span>
                <button
                  type="button"
                  id="retry-location-btn"
                  className="btn-secondary"
                  onClick={() => retryLocation ? retryLocation() : null}
                  style={{ fontSize: "0.82rem", padding: "4px 12px", borderRadius: "6px", cursor: "pointer" }}
                >
                  🔄 Retry Location
                </button>
              </div>
            )}
          </article>

          {/* Emergency Response Readiness (CAN I ENTER EMERGENCY MODE?) */}
          <article className="panel glass-panel emergency-panel">
            <div className="panel-header">
              <div><p className="eyebrow">EMERGENCY MODE</p><h3>Response readiness</h3></div>
              <span className={`emergency-status-badge ${emergencyBadgeClass}`}>
                {emergencyBadgeLabel}
              </span>
            </div>
            <ul className="emergency-meta">
              <li>
                <span>Delivery Status</span>
                <strong>
                  {emergencyData.deliveryState === "SENT"
                    ? "📡 Live API Dispatched"
                    : emergencyData.deliveryState === "QUEUED"
                      ? "💾 Stored in Offline Queue"
                      : "Standby Readiness"}
                </strong>
              </li>
              <li>
                <span>Emergency Event</span>
                <strong>{emergencyData.eventId || "No active event"}</strong>
              </li>
              <li>
                <span>Safety Check-In</span>
                <strong style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{emergencyData.safetyStatus || "Unspecified"}</span>
                  <span style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      style={{ fontSize: "0.68rem", padding: "2px 6px", borderRadius: 4, background: "rgba(87, 211, 138, 0.2)", color: "#79f3b3", border: "1px solid rgba(87, 211, 138, 0.4)" }}
                      onClick={handleMarkSafe}
                      title="Check in as safe"
                    >
                      Safe
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: "0.68rem", padding: "2px 6px", borderRadius: 4, background: "rgba(255, 106, 106, 0.2)", color: "#ff8080", border: "1px solid rgba(255, 106, 106, 0.4)" }}
                      onClick={handleRequestHelp}
                      title="Request assistance"
                    >
                      Help
                    </button>
                  </span>
                </strong>
              </li>
              <li><span>Nearest shelter</span><strong>{nearestShelter}</strong></li>
              <li><span>Nearest hospital</span><strong>{nearestHospital}</strong></li>
              <li><span>All emergencies</span><strong>112</strong></li>
              <li><span>Ambulance</span><strong>108</strong></li>
              <li><span>Disaster EOC</span><strong>1070 / 1077</strong></li>
            </ul>

            <div className="emergency-quick-actions">
              <button
                type="button"
                className="action-button danger full-width"
                onClick={() => onNavigate("Emergency Response")}
              >
                🚨 Launch SOS Emergency Command
              </button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

export default Dashboard;
