import React, { useState } from "react";
import "./LandingPage.css";

/**
 * SKYRA – High-Performance Meteorological Intelligence Landing Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete, responsive, rich aesthetic landing page showcasing the SKYRA platform:
 *  1. Navbar (Brand, Live Telemetry Status, Smooth Links, Launch CTA)
 *  2. Hero (Impactful Value Prop, Dual CTAs, Live Telemetry Grid)
 *  3. Human Problem (The Disaster Preparedness Gap in India)
 *  4. SKYRA Intelligence (7 Telemetry Feeds, 8-Feature Vector, Calibrated ML)
 *  5. Risk Intelligence Preview (4 Tiers, Real-time XAI Attribution)
 *  6. Past → Now → Next (Temporal Continuity Architecture)
 *  7. WeatherGPT Preview (RAG Copilot, NDMA Protocols, Multilingual Readiness)
 *  8. Watch → Warn → Advise → Respond (Emergency Lifecycle)
 *  9. Feature Showcase (Leaflet Map, Dual-Model Core, S3, Graceful Degradation)
 * 10. Final CTA (High-conversion Launch Button, Zero Friction)
 * 11. Footer (Agency Attributions, Technical Architecture, Navigation)
 */

export default function LandingPage({ onLaunchApp }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState("high");

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const riskTiers = {
    low: {
      name: "Low Risk",
      range: "0 – 29",
      color: "#10b981",
      badge: "tier-low",
      desc: "Baseline meteorological stability. Rainfall and wind remain within routine seasonal thresholds. No municipal or transit disruption expected.",
      action: "Advisory: Standard monitoring. No emergency response required.",
      xai: [
        { label: "Recent Rainfall", val: 5, pct: 10, color: "#10b981" },
        { label: "Atmospheric Humidity", val: 45, pct: 25, color: "#10b981" },
        { label: "Wind Gust Velocity", val: 12, pct: 15, color: "#10b981" },
        { label: "Terrain Slope Accumulation", val: 2, pct: 8, color: "#10b981" },
      ],
    },
    mod: {
      name: "Moderate Risk",
      range: "30 – 59",
      color: "#f59e0b",
      badge: "tier-mod",
      desc: "Atmospheric instability detected. Elevated precipitation or gusty winds with potential localized urban waterlogging in poorly drained basins.",
      action: "Advisory: District flood watches active. Avoid waterlogged transit arteries.",
      xai: [
        { label: "Recent Rainfall", val: 28, pct: 45, color: "#f59e0b" },
        { label: "Atmospheric Humidity", val: 78, pct: 60, color: "#f59e0b" },
        { label: "Wind Gust Velocity", val: 32, pct: 40, color: "#f59e0b" },
        { label: "Terrain Slope Accumulation", val: 8, pct: 35, color: "#f59e0b" },
      ],
    },
    high: {
      name: "High Risk",
      range: "60 – 79",
      color: "#f97316",
      badge: "tier-high",
      desc: "Severe meteorological hazard imminent. Rapid precipitation accumulation exceeding local drainage thresholds with high-speed squall potential.",
      action: "Advisory: High alert issued. School closures recommended; low-lying evacuations prepped.",
      xai: [
        { label: "Recent Rainfall", val: 68, pct: 78, color: "#f97316" },
        { label: "Atmospheric Humidity", val: 92, pct: 88, color: "#f97316" },
        { label: "Wind Gust Velocity", val: 58, pct: 72, color: "#f97316" },
        { label: "Terrain Slope Accumulation", val: 18, pct: 65, color: "#f97316" },
      ],
    },
    severe: {
      name: "Severe Risk",
      range: "80 – 100",
      color: "#f43f5e",
      badge: "tier-severe",
      desc: "Critical life-safety emergency. Extreme precipitation surge or cyclone landfall causing widespread flash floods, power grid disruption, and structural hazard.",
      action: "Action: Immediate evacuation to designated disaster shelters. Emergency SOS broadcasting.",
      xai: [
        { label: "Recent Rainfall", val: 125, pct: 98, color: "#f43f5e" },
        { label: "Atmospheric Humidity", val: 99, pct: 95, color: "#f43f5e" },
        { label: "Wind Gust Velocity", val: 94, pct: 92, color: "#f43f5e" },
        { label: "Terrain Slope Accumulation", val: 28, pct: 85, color: "#f43f5e" },
      ],
    },
  };

  return (
    <div className="skyra-landing-root">
      {/* ───────────────────────────────────────────────────────────────────
          1. NAVBAR
      ─────────────────────────────────────────────────────────────────── */}
      <header className="lp-navbar">
        <div className="lp-container lp-nav-content">
          <div className="lp-brand" onClick={() => scrollToSection("hero")}>
            <div className="lp-brand-logo-wrap">
              <img src="/favicon.svg" alt="SKYRA Mark" />
            </div>
            <div className="lp-brand-text">
              <h1>
                SKYRA <span>2.0</span>
              </h1>
              <p className="lp-brand-tagline">Smart Disaster Awareness</p>
            </div>
          </div>

          <nav className={`lp-nav-links ${mobileMenuOpen ? "open" : ""}`}>
            <button className="lp-nav-link" onClick={() => scrollToSection("problem")}>
              The Problem
            </button>
            <button className="lp-nav-link" onClick={() => scrollToSection("intelligence")}>
              Architecture
            </button>
            <button className="lp-nav-link" onClick={() => scrollToSection("risk-preview")}>
              Risk Engine
            </button>
            <button className="lp-nav-link" onClick={() => scrollToSection("temporal")}>
              Past → Now → Next
            </button>
            <button className="lp-nav-link" onClick={() => scrollToSection("weathergpt")}>
              WeatherGPT
            </button>
            <button className="lp-nav-link" onClick={() => scrollToSection("lifecycle")}>
              Action Cycle
            </button>
            <button className="lp-nav-link" onClick={() => scrollToSection("features")}>
              Capabilities
            </button>
          </nav>

          <div className="lp-nav-actions">
            <div className="lp-status-badge">
              <span className="lp-pill-dot" />
              <span>7 Telemetry Streams Live</span>
            </div>
            <button
              type="button"
              className="lp-btn-primary"
              onClick={() => onLaunchApp?.("Dashboard")}
            >
              Launch Dashboard ↗
            </button>
            <button
              type="button"
              className="lp-mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────────────
          2. HERO SECTION
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section lp-hero" id="hero">
        {/* Cinematic Realistic Weather Atmosphere Layers */}
        <div className="lp-atmosphere-sky" />
        <div className="lp-atmosphere-cloud-back" />
        <div className="lp-atmosphere-cloud-front" />
        <div className="lp-atmosphere-rain" />
        <div className="lp-atmosphere-haze" />
        <div className="lp-atmosphere-horizon" />

        <div className="lp-container lp-hero-container">
          <div className="lp-hero-eyebrow">
            <span className="lp-eyebrow-symbol">✦</span>
            <span>AI-POWERED WEATHER & DISASTER INTELLIGENCE</span>
          </div>

          <div className="lp-hero-header-group">
            <h1 className="lp-hero-brand-title">SKYRA</h1>
            <h2 className="lp-hero-headline">See the risk before it becomes a disaster.</h2>
          </div>

          <p className="lp-hero-supporting-text">
            Real-time weather. Deep intelligence. Early warnings. For safer communities and a more resilient tomorrow.
          </p>

          <div className="lp-hero-cta-group">
            <button
              type="button"
              className="lp-btn-primary lp-hero-cta-large"
              onClick={() => onLaunchApp?.("Dashboard")}
            >
              EXPLORE SKYRA →
            </button>
            <button
              type="button"
              className="lp-btn-secondary lp-hero-cta-large"
              onClick={() => scrollToSection("problem")}
            >
              DISCOVER HOW IT WORKS ↓
            </button>
          </div>

          {/* Real-Time Meteorological Telemetry Overview */}
          <div className="lp-hero-card-preview">
            <div className="lp-telemetry-grid">
              <div className="lp-telemetry-box">
                <span className="lp-t-icon">⚡</span>
                <div className="lp-t-label">Inference Latency</div>
                <div className="lp-t-val">&lt; 15 ms</div>
                <div className="lp-t-sub">FastAPI Microservice (C-Compiled)</div>
              </div>
              <div className="lp-telemetry-box">
                <span className="lp-t-icon">🎯</span>
                <div className="lp-t-label">Model Reliability</div>
                <div className="lp-t-val">99.44%</div>
                <div className="lp-t-sub">Platt Sigmoid Calibrated Probabilities</div>
              </div>
              <div className="lp-telemetry-box">
                <span className="lp-t-icon">📡</span>
                <div className="lp-t-label">Observatory Coverage</div>
                <div className="lp-t-val">250 km</div>
                <div className="lp-t-sub">Doppler Weather Radar Radius</div>
              </div>
              <div className="lp-telemetry-box">
                <span className="lp-t-icon">🛡️</span>
                <div className="lp-t-label">Disaster Protocols</div>
                <div className="lp-t-val">100% Truthful</div>
                <div className="lp-t-sub">NDMA / SDMA Verified RAG Corpus</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          SECTION 1 — HUMAN PROBLEM (Cinematic Story Reveal)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section lp-story-section" id="problem">
        <div className="lp-story-backdrop">
          <div className="lp-story-clouds" />
          <div className="lp-story-rain" />
          <div className="lp-story-haze" />
          <div className="lp-story-cityscape" />
        </div>

        <div className="lp-container lp-story-container">
          <div className="lp-story-header">
            <div className="lp-pill">THE HUMAN STORY</div>
            <h2 className="lp-story-main-msg">
              WEATHER TELLS YOU WHAT'S HAPPENING. <br />
              <span className="lp-story-highlight">SKYRA HELPS YOU UNDERSTAND WHAT IT MEANS.</span>
            </h2>
          </div>

          <div className="lp-story-questions-grid">
            <div className="lp-story-q-card q1">
              <span className="lp-q-badge">01</span>
              <h3>"Will the rain get worse?"</h3>
              <p>Predicting precipitation accumulation thresholds over the next 1–24 hours.</p>
            </div>

            <div className="lp-story-q-card q2">
              <span className="lp-q-badge">02</span>
              <h3>"Is it safe to travel?"</h3>
              <p>Mapping urban waterlogging corridors and low-lying transit underpass risks.</p>
            </div>

            <div className="lp-story-q-card q3">
              <span className="lp-q-badge">03</span>
              <h3>"Should I prepare?"</h3>
              <p>Translating atmospheric metrics into actionable home & family protection checklists.</p>
            </div>

            <div className="lp-story-q-card q4">
              <span className="lp-q-badge">04</span>
              <h3>"What could happen next?"</h3>
              <p>Forward hazard trajectories derived from high-resolution numerical models.</p>
            </div>
          </div>

          <div className="lp-story-final-statement">
            <div className="lp-final-quote-card">
              <span className="lp-quote-icon">❝</span>
              <p>
                We check the weather. <br />
                <strong>SKYRA helps us understand it.</strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          SECTION 2 — SKYRA INTELLIGENCE (Multi-Source Visual Flow)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section lp-intel-flow-section" id="intelligence">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">MULTISOURCE INTELLIGENCE FLOW</div>
            <h2 className="lp-section-title">
              FROM WEATHER DATA TO <span>ACTIONABLE INTELLIGENCE</span>
            </h2>
            <p className="lp-section-desc">
              SKYRA brings together the signals that matter to understand not only what is happening, but what it could mean.
            </p>
          </div>

          <div className="lp-intel-system-diagram">
            {/* 4 Major Information Sources */}
            <div className="lp-sources-grid">
              <div className="lp-source-box src-weather">
                <div className="lp-src-header">
                  <span className="lp-src-icon">🌧️</span>
                  <div>
                    <span className="lp-src-meta">SOURCE 01</span>
                    <h4>WEATHER</h4>
                  </div>
                </div>
                <p>Surface rainfall, precipitation rate, relative humidity, wind velocity, and barometric pressure.</p>
                <div className="lp-src-visual weather-anim-box">
                  <div className="lp-rain-line-stream" />
                </div>
              </div>

              <div className="lp-source-box src-location">
                <div className="lp-src-header">
                  <span className="lp-src-icon">📍</span>
                  <div>
                    <span className="lp-src-meta">SOURCE 02</span>
                    <h4>LOCATION</h4>
                  </div>
                </div>
                <p>Precise ward boundaries, GPS coordinates, and 250km radar observatory range perimeters.</p>
                <div className="lp-src-visual location-anim-box">
                  <div className="lp-radar-grid-ring" />
                </div>
              </div>

              <div className="lp-source-box src-history">
                <div className="lp-src-header">
                  <span className="lp-src-icon">📊</span>
                  <div>
                    <span className="lp-src-meta">SOURCE 03</span>
                    <h4>HISTORICAL CONTEXT</h4>
                  </div>
                </div>
                <p>40-year ERA5 climate reanalysis establishing empirical return periods and localized baseline risks.</p>
                <div className="lp-src-visual history-anim-box">
                  <div className="lp-timeline-pulse-bars" />
                </div>
              </div>

              <div className="lp-source-box src-geo">
                <div className="lp-src-header">
                  <span className="lp-src-icon">⛰️</span>
                  <div>
                    <span className="lp-src-meta">SOURCE 04</span>
                    <h4>GEOSPATIAL INFORMATION</h4>
                  </div>
                </div>
                <p>DEM topographic slope angles identifying runoff accumulation basins and flash flood valleys.</p>
                <div className="lp-src-visual geo-anim-box">
                  <div className="lp-contour-anim-lines" />
                </div>
              </div>
            </div>

            {/* Central Convergence Pathway */}
            <div className="lp-convergence-pathways">
              <div className="lp-flow-line line-left-top" />
              <div className="lp-flow-line line-left-bot" />
              <div className="lp-flow-line line-right-top" />
              <div className="lp-flow-line line-right-bot" />

              <div className="lp-central-intel-node">
                <div className="lp-node-glow-ring" />
                <div className="lp-node-brand-icon">⚡</div>
                <h3>SKYRA INTELLIGENCE CORE</h3>
                <span className="lp-node-tag">8-Feature Tensor Synthesis & Platt Calibration</span>
              </div>
            </div>

            {/* Earth & Planetary Weather Intelligence Visual Banner */}
            <div className="lp-earth-intel-hero">
              <img
                src="/skyra_earth_weather_intelligence.jpg"
                alt="SKYRA Planetary Weather Intelligence Stream"
                className="lp-earth-intel-img"
              />
              <div className="lp-earth-img-overlay" />
              <div className="lp-earth-intel-caption">
                <span className="lp-pill-dot" />
                <span>CONTINUOUS GEOSPATIAL & METEOROLOGICAL OBSERVATION LAYER</span>
              </div>
            </div>

            {/* Output Transformation Pipeline */}
            <div className="lp-output-stages-row">
              <div className="lp-output-stage">
                <span className="lp-out-step">01</span>
                <h5>HAZARD DETECTION</h5>
                <p>Identifies extreme rainfall rate & wind anomalies</p>
              </div>
              <div className="lp-output-arrow">➔</div>
              <div className="lp-output-stage">
                <span className="lp-out-step">02</span>
                <h5>RISK SCORING</h5>
                <p>Calibrates probability severity score (0–100)</p>
              </div>
              <div className="lp-output-arrow">➔</div>
              <div className="lp-output-stage">
                <span className="lp-out-step">03</span>
                <h5>IMPACT ANALYSIS</h5>
                <p>Maps inundation depth & transit disruptions</p>
              </div>
              <div className="lp-output-arrow">➔</div>
              <div className="lp-output-stage">
                <span className="lp-out-step">04</span>
                <h5>ACTIONABLE PROTOCOL</h5>
                <p>Triggers certified NDMA safety SOPs & shelter routing</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          SECTION 3 — RISK → IMPACT → ACTION (The Core Transformation)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section lp-transformation-section" id="transformation">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">THE CORE TRANSFORMATION</div>
            <h2 className="lp-section-title">
              RISK <span>➔</span> IMPACT <span>➔</span> ACTION
            </h2>
            <p className="lp-section-desc">
              How SKYRA transforms complex raw meteorological observations into immediate human safety decisions.
            </p>
          </div>

          <div className="lp-transform-flow-container">
            <div className="lp-transform-grid">
              {/* Stage 1: RISK */}
              <div className="lp-t-stage-card stage-risk">
                <div className="lp-t-badge">STAGE 01 • RISK</div>
                <h3 className="lp-t-title">What is the level of danger?</h3>
                <p className="lp-t-desc">
                  Continuous physical risk calculation combining live rainfall, forecast rates, soil saturation, and local terrain slope into a calibrated severity score.
                </p>
                <div className="lp-t-demo-box">
                  <div className="lp-t-demo-label">Evaluated Hazard Tier</div>
                  <div className="lp-t-demo-value risk-high">High Risk (Score: 74/100)</div>
                  <div className="lp-t-demo-sub">Rainfall: 68mm • Humidity: 92% • Slope: 18°</div>
                </div>
              </div>

              {/* Stage Connector 1 */}
              <div className="lp-t-connector">
                <div className="lp-t-line" />
                <div className="lp-t-pulse-node">➔</div>
              </div>

              {/* Stage 2: IMPACT */}
              <div className="lp-t-stage-card stage-impact">
                <div className="lp-t-badge">STAGE 02 • IMPACT</div>
                <h3 className="lp-t-title">What could this mean for people and places?</h3>
                <p className="lp-t-desc">
                  Translates abstract numbers into concrete real-world consequences: low-lying street inundation, power grid vulnerability, and transit corridor blockages.
                </p>
                <div className="lp-t-demo-box">
                  <div className="lp-t-demo-label">Physical Consequence Model</div>
                  <div className="lp-t-demo-value impact-warning">Low-Lying Waterlogging Imminent</div>
                  <div className="lp-t-demo-sub">Velachery Basin Depth: +0.6m • Transit Interruption</div>
                </div>
              </div>

              {/* Stage Connector 2 */}
              <div className="lp-t-connector">
                <div className="lp-t-line" />
                <div className="lp-t-pulse-node">➔</div>
              </div>

              {/* Stage 3: ACTION */}
              <div className="lp-t-stage-card stage-action">
                <div className="lp-t-badge">STAGE 03 • ACTION</div>
                <h3 className="lp-t-title">What should we do next?</h3>
                <p className="lp-t-desc">
                  Delivers immediate, certified instructions: NDMA safety checklists, pre-emptive shelter routing, and automated district emergency broadcasts.
                </p>
                <div className="lp-t-demo-box">
                  <div className="lp-t-demo-label">Certified NDMA Protocol</div>
                  <div className="lp-t-demo-value action-active">Avoid Low-Lying Underpasses</div>
                  <div className="lp-t-demo-sub">Nearest Shelter: Velachery Community Center (1.2 km)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          5. RISK INTELLIGENCE PREVIEW (4 Tiers + XAI)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section" id="risk-preview">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">PREDICTIVE RISK SCORING</div>
            <h2 className="lp-section-title">
              Four Canonical Tiers & <span>Explainable AI (XAI)</span>
            </h2>
            <p className="lp-section-desc">
              Every prediction is calibrated with Platt Sigmoid regression, providing unambiguous
              severity classification and explainable feature attributions so decision-makers understand the "why".
            </p>
          </div>

          {/* Interactive Tier Selection Grid */}
          <div className="lp-tiers-grid">
            {Object.entries(riskTiers).map(([key, tier]) => (
              <div
                key={key}
                className={`lp-tier-card ${tier.badge}`}
                style={{
                  cursor: "pointer",
                  borderColor: selectedTier === key ? tier.color : undefined,
                  boxShadow: selectedTier === key ? `0 0 20px ${tier.color}33` : undefined,
                }}
                onClick={() => setSelectedTier(key)}
              >
                <div className="lp-tier-header">
                  <h4>{tier.name}</h4>
                  <span className="lp-tier-score">{tier.range}</span>
                </div>
                <p>{tier.desc}</p>
                <div className="lp-tier-action">{tier.action}</div>
              </div>
            ))}
          </div>

          {/* XAI Attribution Visualizer */}
          <div className="lp-xai-box">
            <div className="lp-xai-header">
              <h3>
                Tree-Based XAI Feature Attribution Breakdown:{" "}
                <span style={{ color: riskTiers[selectedTier].color }}>
                  {riskTiers[selectedTier].name}
                </span>
              </h3>
              <span>Model: Calibrated Random Forest & XGBoost Ensemble</span>
            </div>

            <div className="lp-attribution-list">
              {riskTiers[selectedTier].xai.map((item, idx) => (
                <div key={idx} className="lp-attr-item">
                  <div className="lp-attr-label">
                    <span>{item.label}</span>
                    <strong>{item.pct}% Weight Contribution</strong>
                  </div>
                  <div className="lp-attr-bar-bg">
                    <div
                      className="lp-attr-bar-fill"
                      style={{
                        width: `${item.pct}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          6. PAST → NOW → NEXT (Temporal Continuity)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section" id="temporal">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">TEMPORAL CONTINUITY</div>
            <h2 className="lp-section-title">
              Complete Temporal Spectrum: <span>Past → Now → Next</span>
            </h2>
            <p className="lp-section-desc">
              Effective disaster response demands more than a snapshot. SKYRA anchors real-time
              observations against 40 years of climate history and projects forward through numerical models.
            </p>
          </div>

          <div className="lp-timeline-grid">
            <div className="lp-timeline-card">
              <div className="lp-time-icon">🕰️</div>
              <div className="lp-time-tag">Phase 01: The Past</div>
              <h3>Historical Climate Memory</h3>
              <p>
                40 years of ECMWF ERA5 reanalysis data establish localized hazard baselines. The system
                instantly knows if 60mm rainfall is routine or a 1-in-10-year local anomaly for that specific basin.
              </p>
              <ul className="lp-time-specs">
                <li>ERA5 hourly climate series chunking</li>
                <li>Localized return period calculation</li>
                <li>Zero hardcoded default hazard scores</li>
              </ul>
            </div>

            <div className="lp-timeline-card">
              <div className="lp-time-icon">📡</div>
              <div className="lp-time-tag">Phase 02: The Now</div>
              <h3>Real-Time Ground Truth</h3>
              <p>
                INSAT geostationary radiance, Doppler radar polarimetric sweeps, and active IMD observatory
                stations provide live physical truth. No synthetic hallucination or guesswork.
              </p>
              <ul className="lp-time-specs">
                <li>250km Radar reflectivity (dBZ) & velocity</li>
                <li>INSAT-3D/3DR multispectral cloud radiance</li>
                <li>Official IMD color-coded advisories</li>
              </ul>
            </div>

            <div className="lp-timeline-card">
              <div className="lp-time-icon">🔮</div>
              <div className="lp-time-tag">Phase 03: The Next</div>
              <h3>Predictive Trajectory</h3>
              <p>
                Numerical Weather Prediction (NWP) forward trajectories feed the calibrated ML model,
                generating probability-weighted risk projections up to 72 hours ahead of critical impact.
              </p>
              <ul className="lp-time-specs">
                <li>Ensemble soft-voting consensus</li>
                <li>Predictive evacuation lead-time windows</li>
                <li>Dynamic inundation trajectory scoring</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          7. WEATHERGPT PREVIEW (RAG Disaster Copilot)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section" id="weathergpt">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">AI DISASTER COPILOT</div>
            <h2 className="lp-section-title">
              WeatherGPT: <span>Conversational RAG Intelligence</span>
            </h2>
            <p className="lp-section-desc">
              Natural language meteorological assistance grounded in certified NDMA guidelines,
              equipped with semantic FAISS/Pinecone vector retrieval and Bhashini multilingual voice accessibility.
            </p>
          </div>

          <div className="lp-chat-container">
            <div className="lp-chat-header">
              <div className="lp-chat-dots">
                <span className="lp-chat-dot red" />
                <span className="lp-chat-dot yellow" />
                <span className="lp-chat-dot green" />
              </div>
              <div className="lp-chat-title">WeatherGPT Intelligence Console • LangChain + FAISS RAG</div>
              <div style={{ fontSize: "0.75rem", color: "#34d399", fontWeight: 600 }}>Active</div>
            </div>

            <div className="lp-chat-body">
              <div className="lp-message">
                <div className="lp-avatar user">👤</div>
                <div className="lp-bubble user-bubble">
                  "I am in Velachery, South Chennai. Rainfall just crossed 65mm in 2 hours with steep water buildup. What immediate safety actions should my family take, and where is the nearest dry shelter?"
                </div>
              </div>

              <div className="lp-message">
                <div className="lp-avatar bot">🤖</div>
                <div className="lp-bubble">
                  <div className="lp-bubble-badge">⚠️ HIGH RISK WARNING • SCORE 74/100</div>
                  <p style={{ margin: "0 0 10px 0" }}>
                    <strong>Immediate Urban Inundation Precautions (Velachery Basin):</strong>
                  </p>
                  <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px" }}>
                    <li>Move immediately to the first floor or higher elevation. Switch off main electrical circuit breakers.</li>
                    <li><strong>Do not attempt to drive:</strong> Underpasses on Velachery Main Road & Tambaram link are prone to sudden submersions.</li>
                    <li><strong>Designated Relief Shelter:</strong> Velachery Community Center (1.2 km west, Elevation +9m, Capacity: 250 occupants).</li>
                    <li><strong>Emergency Helplines:</strong> Greater Chennai Corp: 1913 | State Emergency: 1070 | Ambulance: 108.</li>
                  </ul>
                  <div className="lp-bubble-citations">
                    <span>📚 NDMA Urban Flooding Guidelines (SOP-04)</span>
                    <span>📍 Greater Chennai Corp Shelter Database</span>
                    <span>📡 IMD Radar Bulletins #Chennai-DWR</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          8. WATCH → WARN → ADVISE → RESPOND (Action Cycle)
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section" id="lifecycle">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">EMERGENCY LIFECYCLE</div>
            <h2 className="lp-section-title">
              The 4-Stage Operational Cycle: <span>Watch → Warn → Advise → Respond</span>
            </h2>
            <p className="lp-section-desc">
              From early continuous telemetry to coordinated emergency shelter routing, SKYRA
              bridges the critical gap between detection and survival.
            </p>
          </div>

          <div className="lp-cycle-grid">
            <div className="lp-cycle-card">
              <div className="lp-cycle-step">STAGE 01</div>
              <h3>1. Watch</h3>
              <p>
                Continuous background surveillance via automated Apache Airflow pipelines ingesting
                radar sweeps, satellite radiance, and surface telemetry every 15 minutes.
              </p>
            </div>
            <div className="lp-cycle-card">
              <div className="lp-cycle-step">STAGE 02</div>
              <h3>2. Warn</h3>
              <p>
                Algorithmic threshold triggering with audible emergency sirens, visual banner broadcasts,
                and instant severity tier escalation (Low → Moderate → High → Severe).
              </p>
            </div>
            <div className="lp-cycle-card">
              <div className="lp-cycle-step">STAGE 03</div>
              <h3>3. Advise</h3>
              <p>
                Actionable, role-tailored checklists for citizens, municipal administrators, and first
                responders derived directly from official NDMA standard operating manuals.
              </p>
            </div>
            <div className="lp-cycle-card">
              <div className="lp-cycle-step">STAGE 04</div>
              <h3>4. Respond</h3>
              <p>
                Rapid emergency mobilization: one-tap SOS beaconing, proximity routing to disaster
                relief shelters, trauma center triage, and direct emergency helpline integration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          9. FEATURE SHOWCASE
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section" id="features">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-pill">PLATFORM CAPABILITIES</div>
            <h2 className="lp-section-title">
              Engineered for <span>Mission-Critical Reliability</span>
            </h2>
            <p className="lp-section-desc">
              Built on a resilient microservice architecture designed to function seamlessly even during
              cloud connectivity outages or upstream sensor degradations.
            </p>
          </div>

          <div className="lp-features-grid">
            <div className="lp-feature-card">
              <span className="lp-f-icon">🗺️</span>
              <h3>Intelligent Leaflet Risk Map</h3>
              <p>
                Interactive 250km radar perimeter rings, multi-observatory station overlays, dynamic
                hazard polygons, and location search across India.
              </p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-f-icon">🧠</span>
              <h3>Dual-Model ML Core</h3>
              <p>
                Random Forest for operational stability paired with calibrated XGBoost for boundary
                precision, unified via soft-voting ensemble consensus.
              </p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-f-icon">🛡️</span>
              <h3>Graceful Offline Degradation</h3>
              <p>
                Zero crashes if MongoDB or cloud vector stores disconnect; system gracefully degrades
                to local FAISS indexes and reliable heuristic engines.
              </p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-f-icon">🚑</span>
              <h3>Dynamic Shelter Locator</h3>
              <p>
                Real-time Haversine proximity calculations identifying the nearest certified disaster
                shelters and specialized medical trauma centers with capacity tracking.
              </p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-f-icon">🗣️</span>
              <h3>Multilingual Voice Support</h3>
              <p>
                Integrated with Web Speech API and MeitY Bhashini AI platform, enabling voice queries
                and readouts in Hindi, Tamil, Odia, Bengali, Telugu, and 12+ Indian languages.
              </p>
            </div>
            <div className="lp-feature-card">
              <span className="lp-f-icon">☁️</span>
              <h3>AWS S3 & Cloud Storage</h3>
              <p>
                Deterministic idempotent object key generation with SHA-256 payload checksums across 7
                authorized meteorological ingestion storage domains.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          10. FINAL CTA
      ─────────────────────────────────────────────────────────────────── */}
      <section className="lp-section" id="cta">
        <div className="lp-container">
          <div className="lp-cta-wrapper">
            <h2 className="lp-cta-title">
              Experience the Future of Hyper-Local Disaster Intelligence
            </h2>
            <p className="lp-cta-desc">
              Whether you are a citizen monitoring your neighborhood or an emergency responder
              coordinating regional logistics, SKYRA gives you the precision intelligence to act in time.
            </p>
            <div className="lp-cta-btns">
              <button
                type="button"
                className="lp-btn-primary lp-hero-cta-large"
                onClick={() => onLaunchApp?.("Dashboard")}
              >
                Launch Live SKYRA Dashboard ↗
              </button>
              <button
                type="button"
                className="lp-btn-secondary lp-hero-cta-large"
                onClick={() => onLaunchApp?.("WeatherGPT")}
              >
                Open WeatherGPT Copilot
              </button>
            </div>
            <div className="lp-cta-note">
              Free • Zero Registration Required • Open Telemetry Stack • Runs Instantly in Browser
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────
          11. FOOTER
      ─────────────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div className="lp-footer-brand">
              <h2>SKYRA</h2>
              <p>
                Smart Meteorological Risk Intelligence & Disaster Early Warning Platform.
                Engineering proactive climate resilience for 1.4 billion people across India.
              </p>
              <div className="lp-badges-row">
                <span className="lp-badge-chip">Phase 1–15 Verified</span>
                <span className="lp-badge-chip">FastAPI ML</span>
                <span className="lp-badge-chip">NDMA Aligned</span>
              </div>
            </div>

            <div className="lp-footer-col">
              <h4>Platform Views</h4>
              <ul>
                <li><button onClick={() => onLaunchApp?.("Dashboard")}>Live Dashboard</button></li>
                <li><button onClick={() => onLaunchApp?.("WeatherGPT")}>WeatherGPT Copilot</button></li>
                <li><button onClick={() => onLaunchApp?.("Forecast & History")}>Forecast & History</button></li>
                <li><button onClick={() => onLaunchApp?.("Alerts & Advisories")}>Alerts & Advisories</button></li>
                <li><button onClick={() => onLaunchApp?.("Emergency Response")}>Emergency Action Center</button></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h4>Architecture</h4>
              <ul>
                <li><button onClick={() => scrollToSection("intelligence")}>7 Telemetry Feeds</button></li>
                <li><button onClick={() => scrollToSection("risk-preview")}>Dual-Model ML Core</button></li>
                <li><button onClick={() => scrollToSection("temporal")}>Past → Now → Next</button></li>
                <li><button onClick={() => scrollToSection("lifecycle")}>Watch → Warn → Advise</button></li>
                <li><button onClick={() => scrollToSection("features")}>Offline Fallbacks</button></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h4>Data Authorities</h4>
              <ul>
                <li><a href="https://mausam.imd.gov.in" target="_blank" rel="noreferrer">India Meteorological Dept (IMD)</a></li>
                <li><a href="https://ndma.gov.in" target="_blank" rel="noreferrer">National Disaster Mgmt (NDMA)</a></li>
                <li><a href="https://www.mosdac.gov.in" target="_blank" rel="noreferrer">ISRO MOSDAC Satellite</a></li>
                <li><a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo Telemetry</a></li>
                <li><a href="https://cds.climate.copernicus.eu" target="_blank" rel="noreferrer">ECMWF ERA5 Reanalysis</a></li>
              </ul>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <p className="lp-copyright">
              © {new Date().getFullYear()} SKYRA – Smart Disaster Awareness Platform. Developed for humanitarian climate protection.
            </p>
            <div className="lp-badges-row">
              <span className="lp-badge-chip">CORS Hardened</span>
              <span className="lp-badge-chip">Platt Calibrated</span>
              <span className="lp-badge-chip">FAISS Vector Search</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
