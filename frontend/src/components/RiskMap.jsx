/**
 * SKYRA – Intelligent Risk Map
 *
 * Fullscreen uses a React portal on document.body so it escapes any
 * parent overflow:hidden / CSS-transform stacking context.
 *
 * All map JSX is in module-level components (RiskMapLayer, RiskMapPortal)
 * to satisfy React's rules-of-hooks — components must never be defined
 * inside another component's render body.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
const INDIA_DEFAULT_CENTER = [20.5937, 78.9629];

// ─── YOU ARE HERE icon ────────────────────────────────────────────────────────
const youAreHereIcon = L.divIcon({
  className:   "",
  html:        `<div class="yah-outer"><div class="yah-inner"></div></div>`,
  iconSize:    [28, 28],
  iconAnchor:  [14, 14],
  popupAnchor: [0, -16],
});

// ─── Risk metadata ────────────────────────────────────────────────────────────
const RISK_META = {
  Low:      { icon: "🟢", colour: "#22c55e", label: "SAFE / LOW RISK" },
  Moderate: { icon: "🟡", colour: "#f59e0b", label: "MODERATE RISK" },
  High:     { icon: "🟠", colour: "#f97316", label: "HIGH RISK"     },
  Severe:   { icon: "🔴", colour: "#dc2626", label: "SEVERE RISK"   },
};
function getRiskMeta(level) { return RISK_META[level] ?? RISK_META.Low; }

// ─── Nearby zone sizes and positions ─────────────────────────────────────────
// The active zone is centred on the monitored location. The remaining levels
// occupy distinct nearby areas so the map does not imply concentric risk rings.
const RISK_ZONE_LEVELS = ["Low", "Moderate", "High", "Severe"];
const RISK_ZONE_RADIUS = {
  Low: 1000,
  Moderate: 750,
  High: 520,
  Severe: 340,
};
const RISK_ZONE_OFFSETS = {
  Low:      [-0.010, -0.010],
  Moderate: [ 0.007, -0.012],
  High:     [-0.008,  0.013],
  Severe:   [ 0.010,  0.011],
};

// ─── Why text builder ─────────────────────────────────────────────────────────
function buildWhyText(riskLevel, riskScore, predHazard, weather) {
  const parts = [`ML risk score is ${riskScore}/100 (${riskLevel}).`];
  if (predHazard && predHazard !== "No Significant Hazard" && predHazard !== "Insufficient Data")
    parts.push(`Detected hazard: ${predHazard}.`);
  if (weather) {
    if (Number(weather.rainfall) > 0) parts.push(`Current rainfall: ${weather.rainfall}.`);
    if (weather.wind)                 parts.push(`Wind: ${weather.wind}.`);
    if (weather.humidity)             parts.push(`Humidity: ${weather.humidity}%.`);
  }
  return parts.length ? parts.join(" ") : "Current conditions are within normal monitoring range.";
}

// ─── Leaflet helpers (must be children of MapContainer) ───────────────────────
function RecenterMap({ location }) {
  const map = useMap();
  useEffect(() => { map.setView(location, 12); }, [map, location]);
  return null;
}
function InvalidateSizeOnMount({ trigger }) {
  const map = useMap();
  useEffect(() => {
    // Small delay so the DOM has fully painted before Leaflet measures it.
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map, trigger]);
  return null;
}

// ─── Shared overlay UI (legend, risk summary, ⛶ button) ──────────────────────
// These are plain divs rendered *outside* MapContainer, so they sit on top of
// the map via CSS position:absolute.
function MapOverlays({ meta, riskScore, riskConfidence, whyText, fsMode, onToggle }) {
  return (
    <>
      {/* Full-screen / Exit button */}
      <button
        type="button"
        className="risk-map-fs-btn"
        onClick={onToggle}
        aria-label={fsMode ? "Exit full screen" : "Enter full screen"}
      >
        {fsMode ? "✕ Exit" : "⛶ Full Screen"}
      </button>

      {/* Risk summary — top left */}
      <div className="risk-map-summary">
        <span style={{ fontSize: "1.2rem" }}>{meta.icon}</span>
        <div>
          <strong style={{ color: meta.colour, fontSize: "0.82rem", display: "block" }}>
            {meta.label}
          </strong>
          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            Score {riskScore}/100
            {riskConfidence !== null ? ` · ${riskConfidence}% conf.` : ""}
          </span>
        </div>
      </div>

      <div className="risk-map-reason">
        <strong>Why this risk</strong>
        <p>{whyText}</p>
      </div>

      {/* Full risk-gradient key — bottom left */}
      <div className="risk-map-legend">
        <p className="risk-map-legend-title">Risk Zone Gradient</p>
        {RISK_ZONE_LEVELS.map((level) => {
          const zoneMeta = getRiskMeta(level);
          const isActive = zoneMeta.label === meta.label;

          return (
            <div key={level} className={`risk-map-legend-row${isActive ? " active" : ""}`}>
              <span style={{ color: zoneMeta.colour }}>{zoneMeta.icon}</span>
              <span>{zoneMeta.label}{isActive ? " · Active" : ""}</span>
            </div>
          );
        })}
        <div
          className="risk-map-legend-row"
          style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 6 }}
        >
          <span>📍</span><span>You are here</span>
        </div>
      </div>
    </>
  );
}

// ─── Managed gradient layers ─────────────────────────────────────────────────
// A single layer group owns all four circles. Cleanup removes the previous
// group before the location, demo state, or active ML level is applied again.
function RiskZoneGradient({ center, riskLevel, riskScore }) {
  const map = useMap();
  const [latitude, longitude] = center;

  useEffect(() => {
    const zoneGroup = L.layerGroup().addTo(map);
    const score = Number.isFinite(Number(riskScore)) ? Number(riskScore) : "—";

    RISK_ZONE_LEVELS.forEach((level) => {
      const zoneMeta = getRiskMeta(level);
      const isActive = level === riskLevel;
      const [latitudeOffset, longitudeOffset] = isActive
        ? [0, 0]
        : RISK_ZONE_OFFSETS[level];
      const popupMessage = isActive
        ? `Risk score: ${score}/100`
        : "Contextual zone shown for the local risk gradient.";

      L.circle([latitude + latitudeOffset, longitude + longitudeOffset], {
        radius: RISK_ZONE_RADIUS[level],
        color: zoneMeta.colour,
        fillColor: zoneMeta.colour,
        fillOpacity: isActive ? 0.2 : 0.035,
        weight: isActive ? 5 : 2,
        dashArray: isActive ? undefined : "6 8",
      })
        .bindPopup(
          `<strong>${zoneMeta.icon} ${zoneMeta.label}${isActive ? " — ACTIVE" : ""}</strong><br />${popupMessage}`
        )
        .addTo(zoneGroup);
    });

    return () => {
      zoneGroup.clearLayers();
      if (map.hasLayer(zoneGroup)) {
        map.removeLayer(zoneGroup);
      }
    };
  }, [latitude, longitude, map, riskLevel, riskScore]);

  return null;
}

// ─── Leaflet map layers ───────────────────────────────────────────────────────
// Module-level component — must NOT be defined inside another component.
function RiskMapLayers({
  center, locationLabel, accuracy, isDemo,
  meta, riskLevel, riskScore, whyText,
  fsMode,
}) {
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="risk-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap location={center} />
      <InvalidateSizeOnMount trigger={fsMode} />

      {/* YOU ARE HERE */}
      <Marker position={center} icon={youAreHereIcon}>
        <Tooltip permanent direction="top" offset={[0, -28]} className="risk-map-location-tooltip">
          📍 YOU ARE HERE
        </Tooltip>
        <Popup>
          <div style={{ minWidth: 180 }}>
            <strong style={{ fontSize: "0.95rem" }}>📍 YOU ARE HERE</strong><br />
            <span style={{ color: "#555", fontSize: "0.82rem" }}>{locationLabel}</span>
            {accuracy !== null && (
              <><br /><span style={{ color: "#777", fontSize: "0.78rem" }}>GPS accuracy: ±{Math.round(accuracy)} m</span></>
            )}
            {isDemo && (
              <><br /><em style={{ color: "#e67e22", fontSize: "0.76em" }}>Demo/fallback — GPS unavailable</em></>
            )}
            <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #eee" }} />
            <strong style={{ color: meta.colour, fontSize: "0.85rem" }}>
              {meta.icon} {meta.label} · {riskScore}/100
            </strong><br />
            <span style={{ fontSize: "0.78rem", color: "#444", lineHeight: 1.4, display: "block", marginTop: 4 }}>
              {whyText}
            </span>
          </div>
        </Popup>
      </Marker>

      {/* GPS accuracy circle (real GPS only) */}
      {accuracy !== null && !isDemo && (
        <Circle center={center} radius={accuracy}
          pathOptions={{ color:"#60a5fa", fillColor:"#60a5fa", fillOpacity:0.08, weight:1, dashArray:"4 4" }} />
      )}

      <RiskZoneGradient
        center={center}
        riskLevel={riskLevel}
        riskScore={riskScore}
      />
    </MapContainer>
  );
}

// ─── Full-screen portal wrapper ───────────────────────────────────────────────
// Module-level — rendered via createPortal on document.body.
function RiskMapPortal({ layerProps, overlayProps, onToggle }) {
  return createPortal(
    <div className="risk-map-portal-overlay">
      <MapOverlays {...overlayProps} fsMode onToggle={onToggle} />
      <RiskMapLayers  {...layerProps} fsMode />
    </div>,
    document.body
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function RiskMap({
  riskScore      = 0,
  riskLevel      = "Low",
  riskConfidence = null,
  predHazard     = null,
  weather        = null,
  mapCenter      = null,
  locationLabel  = null,
  demoLocationLabel = null,
  isDemoScenario = false,
}) {
  const [center,        setCenter]        = useState(INDIA_DEFAULT_CENTER);
  const [locationLabelState, setLocationLabel] = useState("Resolving location…");
  const [accuracy,      setAccuracy]      = useState(null);
  const [isDemo,        setIsDemo]        = useState(false);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const wrapperRef = useRef(null);

  // Update map center when mapCenter prop changes (for live/demo/GPS modes)
  // Priority: provided mapCenter (demo or manual) > India default when unavailable
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // This legitimately needs to call setState synchronously on prop change
    
    // CASE 1: Demo mode with scenario mapCenter — always use it, never GPS
    if (isDemoScenario && mapCenter && Array.isArray(mapCenter) && mapCenter.length === 2 && mapCenter[0] != null && mapCenter[1] != null) {
      setCenter([Number(mapCenter[0]), Number(mapCenter[1])]);
      setLocationLabel(demoLocationLabel ?? "DEMO scenario location");
      setAccuracy(null);
      setIsDemo(true);
      return;
    }

    // CASE 2: Live mode with provided mapCenter (manual city or GPS from cache)
    if (!isDemoScenario && mapCenter && Array.isArray(mapCenter) && mapCenter.length === 2 && mapCenter[0] != null && mapCenter[1] != null) {
      setCenter([Number(mapCenter[0]), Number(mapCenter[1])]);
      setLocationLabel(locationLabel ?? "Current location");
      setAccuracy(null);
      setIsDemo(false);
      return;
    }

    // CASE 3: Location unavailable or no coordinates provided
    setCenter(INDIA_DEFAULT_CENTER);
    setLocationLabel(locationLabel || "Location unavailable (Search a city)");
    setAccuracy(null);
    setIsDemo(false);
  }, [mapCenter, locationLabel, demoLocationLabel, isDemoScenario]);

  // Lock / unlock body scroll in fullscreen
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  function toggleFullscreen() { setIsFullscreen((v) => !v); }

  const displayCenter = center;
  const displayLocationLabel = locationLabelState;
  const displayAccuracy = isDemoScenario ? null : accuracy;
  const displayIsDemo = isDemoScenario || isDemo;
  const meta    = getRiskMeta(riskLevel);
  const whyText = buildWhyText(riskLevel, riskScore, predHazard, weather);

  // Props passed down to both inline and portal map trees
  const layerProps = {
    center: displayCenter,
    locationLabel: displayLocationLabel,
    accuracy: displayAccuracy,
    isDemo: displayIsDemo,
    meta, riskLevel, riskScore, whyText,
  };
  const overlayProps = { meta, riskScore, riskConfidence, whyText };

  return (
    <>
      {/* ── Inline wrapper (always in DOM; invisible while portal is active) ── */}
      <div
        ref={wrapperRef}
        className="risk-map-wrapper"
        style={{ visibility: isFullscreen ? "hidden" : "visible" }}
      >
        {/* Only mount Leaflet when not fullscreen — avoids two map instances */}
        {!isFullscreen && (
          <>
            <MapOverlays {...overlayProps} fsMode={false} onToggle={toggleFullscreen} />
            <RiskMapLayers {...layerProps} fsMode={false} />
          </>
        )}
        {isFullscreen && (
          <div className="risk-map-fs-placeholder">
            <span>Map open in full screen</span>
          </div>
        )}
      </div>

      {/* ── Full-screen portal (mounted on document.body) ── */}
      {isFullscreen && (
        <RiskMapPortal
          layerProps={layerProps}
          overlayProps={overlayProps}
          onToggle={toggleFullscreen}
        />
      )}
    </>
  );
}
