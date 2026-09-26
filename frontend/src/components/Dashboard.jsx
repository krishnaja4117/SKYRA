/**
 * SKYRA – Dashboard
 *
 * All live risk data now comes from useGlobalAlert() (globalAlertService.js).
 * Dashboard no longer runs its own GPS/weather/ML/pred/advice pipeline —
 * it reads from the shared module-level cache.  This guarantees Dashboard and
 * AlertsAdvisories always show identical risk values.
 */
import { useRef, useState, useEffect, useCallback } from "react";
import Header  from "./Header";
import RiskMap from "./RiskMap";
import {
  useGlobalAlert,
  resolveDisplayValues,
  getRiskClass,
  DEMO_SCENARIOS,
} from "../services/globalAlertService";
import { playAlertAudio, showBrowserNotification } from "../services/notificationService";

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
            const city   = addr.city || addr.town || addr.village || null;
            const state  = addr.state || null;
            const country = addr.country || "India";
            
            // Skip results that are just state/country level
            if (!city) return null;
            
            return {
              id:          r.place_id,
              displayName: r.display_name,
              // Format: "City, State, Country"
              shortLabel: [city, state, country].filter(Boolean).join(", "),
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

function Dashboard({ onNavigate, activePage, currentLocation, savedLocation, alertSoundEnabled }) {
  // ── All live data from the shared global hook ──────────────────────────────
  const { cache, loading, demo, demoScenario, setDemo, setScenario,
          setManualLoc, clearManualLoc, manualLocation } = useGlobalAlert();
  const dv = resolveDisplayValues(cache, demo, demoScenario);

  // Derive values used by this page
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

  // Emergency status derived from risk level (not hardcoded "Safe")
  const emergencyStatusDisplay = riskLevel;  // "Severe", "High", "Moderate", or "Low"
  const emergencyStatusClass = riskTone;    // "severe", "high", "moderate", or "low"

  // Compute mapCenter: manual location > cache location
  // PRIORITY: manual > demo scenario > cache/GPS > null
  const computedMapCenter = demo 
    ? dv.mapCenter  // Demo scenarios have fixed mapCenter
    : manualLocation 
      ? [manualLocation.latitude, manualLocation.longitude]  // Manual city search
      : dv.mapCenter;  // Live location from cache (GPS or fallback)

  // Build weather display object from cache (or null while loading)
  // In Demo Mode: use dv (demo values from resolveDisplayValues)
  // In Online Mode: use cache (live weather from API)
  const displayWeather = demo ? dv : cache;
  const weather = (displayWeather && displayWeather.temperature !== null && displayWeather.temperature !== undefined) ? {
    // Derive condition from weather inputs (rain, wind, temperature)
    // Heavy rain = "Heavy rainfall"; strong wind = "Strong wind"; extreme heat = "Extreme heat"; otherwise default
    condition: (
      displayWeather.rainfall > 25 && displayWeather.wind > 30 ? "Heavy rainfall with strong wind" :
      displayWeather.rainfall > 25 ? "Heavy rainfall" :
      displayWeather.wind > 80 ? "Extreme wind" :
      displayWeather.wind > 55 ? "Strong wind" :
      displayWeather.temperature > 40 ? "Extreme heat" :
      "Partly cloudy"
    ),
    temperature: displayWeather.temperature,
    feelsLike:   Math.round(displayWeather.temperature + 2),
    humidity:    `${displayWeather.humidity}%`,
    wind:        `${displayWeather.wind} km/h`,
    rainfall:    `${displayWeather.rainfall} mm`,
    pressure:    `${displayWeather.pressure} hPa`,
  } : null;

  // GPS display for header and monitoring panel
  const gpsResolved    = demo || !!cache;
  const gpsSource      = displayWeather?.gpsSource  ?? null;
  const gpsCity        = displayWeather?.gpsCity    ?? null;
  const gpsRegion      = displayWeather?.gpsRegion  ?? null;
  // In Demo Mode: don't show GPS accuracy (always N/A)
  // In Online Mode: show real GPS accuracy from displayWeather
  const gpsAccuracy    = demo ? null : (displayWeather?.gpsAccuracy ?? null);
  
  // Demo GPS location (simulated)
  // In Demo Mode: use demoGpsCity with (Simulated) marker
  // In Online Mode: use real GPS data
  const demoDemoGpsCity = demo ? (dv.demoGpsCity ?? null) : null;

  // Local state: reserved for future demo-note display extension
  // (no local state needed currently — all data comes from globalAlertService)

  // ── Alert sound state tracking ──
  const previousRiskLevelRef = useRef(null);

  // ── Alert audio & desktop notification on P1/P2 risk transition ──
  // Works both in Demo mode AND live production mode!
  useEffect(() => {
    const activeAlert = cache?.alerts?.activeAlert;
    const priority = activeAlert?.priority || (riskLevel === "Severe" ? "P1" : riskLevel === "High" ? "P2" : "P3");
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
                    : (gpsCity ?? dv.locationName ?? "Current location"),
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
        {/* ── Top bar ── */}
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
            <button type="button" className="action-button"         onClick={() => onNavigate("WeatherGPT")}>Voice</button>
            <button type="button" className="action-button danger"  onClick={() => onNavigate("Emergency Response")}>SOS</button>
          </div>
        </section>

        {/* ── Demo Mode scenario picker ── */}
        <section className="demo-picker-section">
          {/* Toggle button — always visible */}
          <div className="demo-picker-bar">
            <button
              type="button"
              className={`action-button${demo ? " danger" : ""}`}
              onClick={() => setDemo(!demo)}
              aria-pressed={demo}
            >
              {demo ? "✕ Exit Demo Mode" : "🎭 Demo Mode"}
            </button>

            {/* Scenario buttons — only shown when demo is active */}
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

        {/* ── Smart Alert Banner — visible immediately after picker for all scenarios ── */}
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

        {/* ── Map + ML risk side-by-side ── */}
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

            <div className="metric-row">
              <span>ML confidence</span>
              <strong>
                {riskConfidence !== null ? `${riskConfidence}%${dv.confidenceType === "CALIBRATED" ? " (Calibrated)" : ""}` : "—"}
              </strong>
            </div>

            <div className="mini-progress">
              <span style={{ width: `${riskScore}%` }} />
            </div>

            {/* Live "Why this risk" — driven by backend XAI factors & explanation */}
            <div className="risk-factors">
              <h4>Why this risk</h4>
              {loading && !cache ? (
                <ul><li>Loading risk explanation…</li></ul>
              ) : (dv.xai?.explanation || (Array.isArray(dv.xai?.factors) && dv.xai.factors.length > 0) || predResult) ? (
                <ul>
                  {dv.xai?.explanation && <li>{dv.xai.explanation}</li>}
                  {Array.isArray(dv.xai?.factors) && dv.xai.factors.length > 0 ? (
                    dv.xai.factors.map((f, idx) => (
                      <li key={idx}>• {typeof f === "object" ? `${f.name}: ${f.detail || f.impact}` : f}</li>
                    ))
                  ) : (
                    predResult?.explanation && !dv.xai?.explanation && <li>{predResult.explanation}</li>
                  )}
                  {predResult?.hazard && predResult.hazard !== "No Significant Hazard" && (
                    <li>Detected hazard: <strong>{predResult.hazard}</strong> ({predResult.impactLevel || "Advisory"}).</li>
                  )}
                  {locationName && <li>Location: {locationName}.</li>}
                </ul>
              ) : (
                <ul>
                  <li>XAI feature attribution data unavailable.</li>
                </ul>
              )}
            </div>
          </aside>
        </section>

        {/* ── Historical Pattern Intelligence ── */}
        {/* NOTE: Historical dataset covers Bhubaneswar (demo/baseline).  */}
        {/* Pattern matching uses live weather from the GPS location above. */}
        <section className="hist-intel-section">
          <HistoricalIntelligenceCard result={histResult} loading={loading && !cache} />
        </section>

        {/* ── Predictive Impact Network ── */}
        <section className="pred-impact-section">
          <PredictiveImpactCard result={predResult} loading={loading && !cache} />
        </section>

        {/* ── Actionable Advice ── */}
        <section className="advice-section">
          <ActionableAdviceCard result={adviceResult} loading={loading && !cache} />
        </section>

        {/* ── Weather + monitoring + emergency ── */}
        <section className="info-grid">
          {/* Current weather */}
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
                  <div><span>Rainfall</span><strong>{weather.rainfall}</strong></div>
                  <div><span>Pressure</span><strong>{weather.pressure}</strong></div>
                </div>
              </div>
            ) : (
              <p className="empty-state">Waiting for current weather data.</p>
            )}
          </article>

          {/* Location monitoring */}
          <article className="panel glass-panel monitoring-panel">
            <div className="panel-header">
              <div><p className="eyebrow">LOCATION MONITORING</p><h3>Monitoring status</h3></div>
              <span className="status-meta active">Active</span>
            </div>
            <ul className="monitoring-list">
              <li>
                <span>GPS</span>
                <strong>
                  {!gpsResolved ? "Resolving…"
                    : demo ? `Demo Location${demoDemoGpsCity ? ` (${demoDemoGpsCity})` : ""}`
                    : manualLocation ? "Manual city"
                    : gpsSource === "unavailable" ? "Unavailable"
                    : gpsSource === "demo_fallback" ? "Demo fallback"
                    : "Resolved"}
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
                <span>Location</span>
                <strong>
                  {!gpsResolved ? "Detecting…"
                    : demo ? `${demoDemoGpsCity ?? dv.locationName} (Simulated)`
                    : manualLocation ? manualLocation.displayName
                    : gpsSource === "unavailable" ? "Location unavailable"
                    : gpsSource === "demo_fallback" ? `${gpsCity ?? "Demo"} (DEMO)`
                    : (gpsCity ?? dv.locationName ?? "Your location")}
                </strong>
              </li>
              <li>
                <span>Saved home</span>
                <strong>{savedLocation?.address ?? "Not set"}</strong>
              </li>
            </ul>
          </article>

          {/* Emergency */}
          <article className="panel glass-panel emergency-panel">
            <div className="panel-header">
              <div><p className="eyebrow">EMERGENCY STATUS</p><h3>Response readiness</h3></div>
              <span className={`status-meta ${emergencyStatusClass}`}>{emergencyStatusDisplay}</span>
            </div>
            <ul className="emergency-meta">
              <li><span>Nearest shelter</span><strong>{nearestShelter}</strong></li>
              <li><span>Nearest hospital</span><strong>{nearestHospital}</strong></li>
              <li><span>All emergencies</span><strong>112</strong></li>
              <li><span>Ambulance</span><strong>108</strong></li>
              <li><span>Kerala State EOC</span><strong>1070 / 1079</strong></li>
              <li><span>District EOC</span><strong>1077</strong></li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}

export default Dashboard;
