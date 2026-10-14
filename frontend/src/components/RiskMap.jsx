/**
 * SKYRA – Intelligent Risk Map (Phase 11)
 * ─────────────────────────────────────────────────────────────────────────────
 * Real, data-driven, location-aware geospatial risk visualization.
 *
 * Guarantees:
 *   • ZERO synthetic risk circles: removed arbitrary danger radius.
 *   • Represents ML risk as an authoritative focal point marker.
 *   • Real basemap switching via Leaflet LayersControl (Standard OSM + OpenTopoMap).
 *   • Real IMD Doppler Weather Radar station context and 250 km surveillance boundary.
 *   • Real emergency facilities (hospitals/clinics) queried from OSM Overpass API.
 *   • Real topographic elevation and slope from Open-Meteo / Copernicus DEM.
 *   • Strict XAI interpretability disclaimer (tree-path feature attribution).
 *   • Zero silent fallback to Bhubaneswar: neutral view when location unavailable.
 *   • Safe error handling: non-blocking degradation if external APIs fail.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  Circle,
  Polyline,
  LayersControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  fetchGeospatialContext,
  fetchEmergencyFacilitiesSafe,
  isValidCoordinate,
  formatDistance,
} from "../services/geospatialService";
import { getCachedShelters } from "../services/idbStorage";
import { VERIFIED_EMERGENCY_SHELTERS } from "../data/emergencyShelters";
import { assessEvacuationRoute } from "../services/evacuationService";
import OfflineMapManager from "./OfflineMapManager";
import EvacuationIntelligenceModal from "./EvacuationIntelligenceModal";
import ExplainableImpactModal from "./ExplainableImpactModal";

const INDIA_DEFAULT_CENTER = [20.5937, 78.9629];

// ─── Risk metadata ────────────────────────────────────────────────────────────
const RISK_META = {
  Low:      { icon: "🟢", colour: "#22c55e", label: "SAFE / LOW RISK" },
  Moderate: { icon: "🟡", colour: "#f59e0b", label: "MODERATE RISK" },
  High:     { icon: "🟠", colour: "#f97316", label: "HIGH RISK"     },
  Severe:   { icon: "🔴", colour: "#dc2626", label: "SEVERE RISK"   },
};

function getRiskMeta(level) {
  return RISK_META[level] ?? RISK_META.Low;
}

// ─── Custom Leaflet DivIcons ──────────────────────────────────────────────────

function createRiskFocalIcon(level, score) {
  const meta = getRiskMeta(level);
  const displayScore = Number.isFinite(Number(score)) ? Number(score) : "•";
  return L.divIcon({
    className: "skyra-focal-icon-wrapper",
    html: `
      <div class="skyra-focal-marker" style="--risk-color: ${meta.colour};">
        <div class="focal-pulse-ring"></div>
        <div class="focal-core">
          <span class="focal-score-badge">${displayScore}</span>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

const radarStationIcon = L.divIcon({
  className: "skyra-radar-icon-wrapper",
  html: `<div class="radar-station-marker" title="IMD Doppler Weather Radar">📡</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const hospitalIcon = L.divIcon({
  className: "skyra-facility-icon-wrapper",
  html: `<div class="facility-marker hospital" title="Emergency Medical Facility">🏥</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
});

const shelterIcon = L.divIcon({
  className: "skyra-facility-icon-wrapper",
  html: `<div class="facility-marker shelter" style="background: #15803d; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);" title="Verified Emergency Shelter">🛡️</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
});

// ─── Why Text & XAI Builder ───────────────────────────────────────────────────
function buildWhyText(riskLevel, riskScore, predHazard, weather, xai) {
  const parts = [`Model-evaluated risk score is ${riskScore}/100 (${riskLevel}).`];
  if (predHazard && predHazard !== "No Significant Hazard" && predHazard !== "Insufficient Data") {
    parts.push(`Primary detected hazard: ${predHazard}.`);
  }
  if (weather) {
    if (Number(weather.rainfall) > 0) parts.push(`Rainfall: ${weather.rainfall}.`);
    if (weather.wind)                 parts.push(`Wind: ${weather.wind}.`);
    if (weather.humidity)             parts.push(`Humidity: ${weather.humidity}.`);
  }
  if (xai?.summary && typeof xai.summary === "string") {
    parts.push(xai.summary);
  }
  return parts.join(" ");
}

// ─── Leaflet Helpers (Children of MapContainer) ───────────────────────────────
function RecenterMap({ location, hasValidLocation }) {
  const map = useMap();
  useEffect(() => {
    if (hasValidLocation && location) {
      map.setView(location, 12);
    } else {
      map.setView(INDIA_DEFAULT_CENTER, 5);
    }
  }, [map, location, hasValidLocation]);
  return null;
}

function InvalidateSizeOnMount({ trigger }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map, trigger]);
  return null;
}

// ─── Shared Overlay UI (HUD, Legend, Fullscreen Button) ───────────────────────
function MapOverlays({
  meta,
  riskLevel,
  riskScore,
  riskConfidence,
  predHazard,
  locationLabel,
  center,
  hasValidLocation,
  whyText,
  terrain,
  radar,
  facilities,
  facilityStatus,
  xai,
  fsMode,
  onToggle,
  onOpenOfflineMaps,
  onOpenImpactModal,
  isOnline = true,
}) {
  const nearestFacility = facilities && facilities.length > 0 ? facilities[0] : null;

  return (
    <>
      {/* Explainable Community Impact button */}
      <button
        type="button"
        className="risk-map-impact-btn"
        onClick={onOpenImpactModal}
        style={{
          position: "absolute",
          top: "12px",
          right: fsMode ? "210px" : "250px",
          zIndex: 1000,
          background: "rgba(15, 23, 42, 0.85)",
          border: "1px solid rgba(74, 222, 128, 0.4)",
          color: "#4ade80",
          padding: "5px 10px",
          borderRadius: "6px",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
        title="View Explainable Community Impact Assessment"
      >
        📊 Community Impact
      </button>

      {/* Offline Maps Manager button */}
      <button
        type="button"
        className="risk-map-offline-btn"
        onClick={onOpenOfflineMaps}
        style={{
          position: "absolute",
          top: "12px",
          right: fsMode ? "95px" : "135px",
          zIndex: 1000,
          background: "rgba(15, 23, 42, 0.85)",
          border: "1px solid rgba(56, 189, 248, 0.4)",
          color: "#38bdf8",
          padding: "5px 10px",
          borderRadius: "6px",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
        title="Manage Offline Regional Map Packs"
      >
        📥 Offline Maps
      </button>

      {/* Full-screen toggle button */}
      <button
        type="button"
        className="risk-map-fs-btn"
        onClick={onToggle}
        aria-label={fsMode ? "Exit full screen" : "Enter full screen"}
      >
        {fsMode ? "✕ Exit" : "⛶ Full Screen"}
      </button>

      {/* Top Left: Monitored Location Status */}
      <div className="risk-map-summary">
        <span style={{ fontSize: "1.2rem" }}>{meta.icon}</span>
        <div>
          <strong style={{ color: meta.colour, fontSize: "0.82rem", display: "block" }}>
            {hasValidLocation ? meta.label : "LOCATION REQUIRED"}
          </strong>
          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            {hasValidLocation
              ? `Score ${riskScore}/100${riskConfidence !== null ? ` · ${riskConfidence}% conf.` : ""}`
              : "Search a city to evaluate local risk"}
          </span>
        </div>
      </div>

      {/* Neutral state banner if coordinates are unavailable */}
      {!hasValidLocation && (
        <div className="risk-map-neutral-banner">
          <span className="neutral-icon">📍</span>
          <div>
            <strong>Location required for local risk analysis</strong>
            <p>Search a city above or allow GPS permissions to evaluate local topography, weather risk, and radar coverage.</p>
          </div>
        </div>
      )}

      {/* Geospatial HUD Bar (Top Center / Right) */}
      {hasValidLocation && (
        <div className="risk-map-hud">
          <div className="hud-metric">
            <span className="hud-label">COORDINATES</span>
            <strong className="hud-val">{center[0].toFixed(3)}°, {center[1].toFixed(3)}°</strong>
          </div>
          <div className="hud-metric">
            <span className="hud-label">TOPOGRAPHY</span>
            <strong className="hud-val">
              {terrain?.elevation != null ? `${terrain.elevation} m` : "—"}
              {terrain?.slope != null ? ` · ${terrain.slope}° slope` : ""}
            </strong>
          </div>
          <div className="hud-metric">
            <span className="hud-label">IMD RADAR</span>
            <strong className="hud-val" style={{ color: radar?.withinCoverage ? "#38bdf8" : "#f59e0b" }}>
              {radar?.withinCoverage
                ? `${radar?.nearestStation?.name ? radar.nearestStation.name.replace("DWR ", "") : "Active"} (${formatDistance(radar.distanceKm)})`
                : radar?.nearestStation
                  ? `Outside Range (${radar.nearestStation.name.replace("DWR ", "")} ${formatDistance(radar.distanceKm)})`
                  : "Radar Unavailable"}
            </strong>
          </div>
          <div className="hud-metric">
            <span className="hud-label">NEAREST CLINIC</span>
            <strong className="hud-val" title={nearestFacility?.name || "Emergency services"}>
              {nearestFacility?.name
                ? `${nearestFacility.name.substring(0, 18)}${nearestFacility.name.length > 18 ? "…" : ""}`
                : facilityStatus || "Check directory"}
            </strong>
          </div>
        </div>
      )}

      {/* Why This Risk Panel with Tree-Path XAI Disclaimer */}
      {hasValidLocation && (
        <div className="risk-map-reason">
          <div className="reason-header">
            <strong>Why this risk (ML Assessment)</strong>
            <span className="reason-badge">Point Estimate</span>
          </div>
          <p>{whyText}</p>
          {xai?.featureContributions && xai.featureContributions.length > 0 && (
            <div className="risk-map-factors-list">
              {xai.featureContributions.slice(0, 3).map((f, i) => (
                <span key={i} className="map-factor-chip">
                  {f.feature}: {f.importance != null ? `${Math.round(f.importance * 100)}%` : "Active"}
                </span>
              ))}
            </div>
          )}
          <div className="risk-map-disclaimer">
            ⚠️ These values explain the ML model&apos;s decision at this monitored coordinate. They do not represent percentages of geographic area or flood perimeters.
          </div>
        </div>
      )}

      {/* Map Legend (Bottom Left) */}
      <div className="risk-map-legend">
        <p className="risk-map-legend-title">Geospatial Legend</p>
        {["Low", "Moderate", "High", "Severe"].map((level) => {
          const zoneMeta = getRiskMeta(level);
          const isActive = hasValidLocation && zoneMeta.label === meta.label;
          return (
            <div key={level} className={`risk-map-legend-row${isActive ? " active" : ""}`}>
              <span style={{ color: zoneMeta.colour }}>{zoneMeta.icon}</span>
              <span>{zoneMeta.label}{isActive ? " · Active" : ""}</span>
            </div>
          );
        })}
        <div className="risk-map-legend-row" style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 6 }}>
          <span>📍</span><span>Monitored Location</span>
        </div>
        <div className="risk-map-legend-row">
          <span>📡</span><span>IMD Radar (250 km Range)</span>
        </div>
        <div className="risk-map-legend-row">
          <span>🏥</span><span>Emergency Hospital</span>
        </div>
        <div className="risk-map-legend-row">
          <span>🛡️</span><span>Verified Shelter / Camp</span>
        </div>
      </div>

      {!isOnline && (
        <div
          className="risk-map-offline-alert-banner"
          style={{
            position: "absolute",
            bottom: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.94)",
            border: "1px solid #eab308",
            borderRadius: "6px",
            padding: "6px 14px",
            fontSize: "0.74rem",
            color: "#fef08a",
            zIndex: 1000,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            pointerEvents: "auto",
          }}
        >
          ⚠️ <strong>Offline Map Mode:</strong> Cached static basemap & verified shelters active. Live radar sweeps and real-time road closures are unavailable offline.
        </div>
      )}
    </>
  );
}

// ─── Leaflet Map Layers Component ─────────────────────────────────────────────
function RiskMapLayers({
  center,
  hasValidLocation,
  locationLabel,
  meta,
  riskLevel,
  riskScore,
  riskConfidence,
  predHazard,
  terrain,
  radar,
  facilities,
  fsMode,
  onAssessEvacuation,
  activeEvacuation,
}) {
  const nearestRadar = radar?.nearestStation || null;

  return (
    <MapContainer
      center={hasValidLocation ? center : INDIA_DEFAULT_CENTER}
      zoom={hasValidLocation ? 12 : 5}
      scrollWheelZoom
      className="risk-map"
    >
      <RecenterMap location={center} hasValidLocation={hasValidLocation} />
      <InvalidateSizeOnMount trigger={fsMode} />

      <LayersControl position="topright">
        {/* Base Layer 1: Standard OpenStreetMap (Default) */}
        <LayersControl.BaseLayer checked name="Standard (OpenStreetMap)">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>

        {/* Base Layer 2: Real Topographic Elevation Contours (OpenTopoMap) */}
        <LayersControl.BaseLayer name="Topographic (Elevation Contours)">
          <TileLayer
            attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        </LayersControl.BaseLayer>

        {/* Overlay Layer: IMD Doppler Weather Radar Coverage */}
        <LayersControl.Overlay checked name="IMD Radar Coverage (250 km)">
          {nearestRadar && (
            <>
              {/* Radar Station Marker */}
              <Marker
                position={[nearestRadar.latitude, nearestRadar.longitude]}
                icon={radarStationIcon}
              >
                <Popup>
                  <div className="map-popup-card">
                    <strong style={{ fontSize: "0.95rem" }}>📡 {nearestRadar.name}</strong><br />
                    <span style={{ color: "#38bdf8", fontSize: "0.8rem", fontWeight: 600 }}>
                      IMD Doppler Weather Radar ({nearestRadar.band})
                    </span>
                    <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #334155" }} />
                    <div style={{ fontSize: "0.78rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                      • <strong>Surveillance Radius:</strong> 250 km<br />
                      • <strong>Distance from Monitored Point:</strong> {formatDistance(radar.distanceKm)}<br />
                      • <strong>Coverage Status:</strong>{" "}
                      <span style={{ color: radar.withinCoverage ? "#4ade80" : "#f59e0b", fontWeight: 700 }}>
                        {radar.withinCoverage ? "Within Direct Radar Surveillance Range" : `Outside Direct Coverage (${formatDistance(radar.distanceKm)} to station)`}
                      </span><br />
                      • <strong>Active Data Source:</strong>{" "}
                      <span style={{ color: "#e2e8f0" }}>
                        {radar.withinCoverage ? "Direct DWR Reflectivity Ingestion Active" : "INSAT-3DR Satellite & NWP Model Active"}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: "0.7rem", color: "#94a3b8", fontStyle: "italic" }}>
                      Note: Represents official meteorological radar surveillance boundary, NOT a hazard or danger zone.
                    </div>
                  </div>
                </Popup>
              </Marker>

              {/* 250 km Radar Surveillance Range Circle */}
              {radar.withinCoverage ? (
                /* Monitored location is WITHIN direct radar surveillance range */
                <Circle
                  center={[nearestRadar.latitude, nearestRadar.longitude]}
                  radius={250000} // 250 km in meters
                  pathOptions={{
                    color: "#38bdf8",
                    fillColor: "#38bdf8",
                    fillOpacity: 0.05,
                    weight: 1.5,
                    dashArray: "6 6",
                  }}
                />
              ) : (
                /* Monitored location is OUTSIDE direct coverage: show faint station range marker without false coverage overlay */
                <Circle
                  center={[nearestRadar.latitude, nearestRadar.longitude]}
                  radius={250000} // 250 km in meters
                  pathOptions={{
                    color: "#64748b",
                    fillColor: "#64748b",
                    fillOpacity: 0.01,
                    weight: 1,
                    dashArray: "3 8",
                  }}
                />
              )}
            </>
          )}
        </LayersControl.Overlay>

        {/* Overlay Layer: Verified Emergency Facilities (Hospitals & Shelters) */}
        <LayersControl.Overlay checked name="Emergency Facilities & Shelters">
          {facilities && facilities.length > 0 && (
            <>
              {facilities.map((fac, idx) => {
                const isShelter = fac.type === "SHELTER" || fac.type === "RELIEF_CAMP" || String(fac.type || "").toLowerCase().includes("shelter");
                return (
                  <Marker
                    key={`${fac.name}-${idx}`}
                    position={[fac.latitude, fac.longitude]}
                    icon={isShelter ? shelterIcon : hospitalIcon}
                  >
                    <Popup>
                      <div className="map-popup-card">
                        <strong style={{ fontSize: "0.9rem" }}>{isShelter ? "🛡️" : "🏥"} {fac.name}</strong><br />
                        <span style={{ color: isShelter ? "#4ade80" : "#94a3b8", fontSize: "0.78rem", fontWeight: isShelter ? 600 : 400 }}>
                          Type: {fac.type || (isShelter ? "Disaster Relief Shelter" : "Emergency Hospital")}
                        </span>
                        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #334155" }} />
                        {fac.address && (
                          <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginBottom: 3 }}>
                            📍 {fac.address}
                          </div>
                        )}
                        {fac.capacity && (
                          <div style={{ fontSize: "0.74rem", color: "#4ade80", marginBottom: 3 }}>
                            👥 Capacity: {fac.capacity} people
                          </div>
                        )}
                        <span style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                          Distance: ~{formatDistance(fac.distance)}
                        </span>
                        {fac.phone && (
                          <div style={{ fontSize: "0.76rem", color: "#38bdf8", marginTop: 2 }}>
                            📞 {fac.phone}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onAssessEvacuation && onAssessEvacuation(fac)}
                          style={{
                            marginTop: "8px",
                            width: "100%",
                            background: "linear-gradient(135deg, #0284c7, #0369a1)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 10px",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          🛡️ Evacuation Route Assessment
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </>
          )}
        </LayersControl.Overlay>
      </LayersControl>

      {/* Active Evacuation Route Polyline */}
      {activeEvacuation && activeEvacuation.mapPolyline && (
        <Polyline
          positions={activeEvacuation.mapPolyline}
          pathOptions={{
            color: activeEvacuation.status.routeCategory.includes("DESIGNATED") ? "#38bdf8" : "#f59e0b",
            weight: 4,
            opacity: 0.9,
            dashArray: activeEvacuation.status.routeCategory.includes("DESIGNATED") ? "8 6" : "4 8",
          }}
        />
      )}

      {/* Monitored Location: Precise Point Risk Marker (ZERO synthetic risk circle) */}
      {hasValidLocation && (
        <Marker position={center} icon={createRiskFocalIcon(riskLevel, riskScore)}>
          <Tooltip permanent direction="top" offset={[0, -22]} className="risk-map-location-tooltip">
            📍 MONITORED LOCATION
          </Tooltip>
          <Popup>
            <div className="map-popup-card" style={{ minWidth: 200 }}>
              <strong style={{ fontSize: "0.95rem" }}>📍 MONITORED LOCATION</strong><br />
              <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>{locationLabel}</span>
              <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #334155" }} />
              <strong style={{ color: meta.colour, fontSize: "0.86rem" }}>
                {meta.icon} {meta.label} · {riskScore}/100
              </strong>
              {riskConfidence !== null && (
                <span style={{ fontSize: "0.76rem", color: "#94a3b8" }}> ({riskConfidence}% confidence)</span>
              )}
              <div style={{ marginTop: 4, fontSize: "0.78rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                • <strong>Detected Hazard:</strong> {predHazard || "Monitoring"}<br />
                • <strong>Elevation:</strong> {terrain?.elevation != null ? `${terrain.elevation} m` : "Evaluating…"}<br />
                • <strong>Topographic Slope:</strong> {terrain?.slope != null ? `${terrain.slope}°` : "Evaluating…"}<br />
                • <strong>Radar Coverage:</strong> {radar?.withinCoverage ? `Within ${radar.nearestStation?.name || "IMD DWR"} Range` : `Outside Direct DWR (${formatDistance(radar?.distanceKm)} from nearest station) — Satellite & NWP Active`}
              </div>
              <div style={{ marginTop: 6, fontSize: "0.7rem", color: "#e2e8f0", background: "rgba(255,255,255,0.06)", padding: 4, borderRadius: 4 }}>
                Model-estimated risk at monitored location. Surrounding area risk depends on local terrain and observations.
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

// ─── Full-screen Portal Wrapper ───────────────────────────────────────────────
function RiskMapPortal({ layerProps, overlayProps, onToggle }) {
  return createPortal(
    <div className="risk-map-portal-overlay">
      <MapOverlays {...overlayProps} fsMode onToggle={onToggle} />
      <RiskMapLayers {...layerProps} fsMode />
    </div>,
    document.body
  );
}

// ─── Main RiskMap Component Export ────────────────────────────────────────────
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
  xai            = null,
}) {
  const [center, setCenter] = useState(INDIA_DEFAULT_CENTER);
  const [hasValidLocation, setHasValidLocation] = useState(false);
  const [locationLabelState, setLocationLabel] = useState("Resolving location…");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terrain, setTerrain] = useState({ available: false, elevation: null, slope: null });
  const [radar, setRadar] = useState({ available: false, nearestStation: null, distanceKm: null, withinCoverage: false });
  const [facilities, setFacilities] = useState([]);
  const [facilityStatus, setFacilityStatus] = useState("Loading…");
  const [showOfflineMaps, setShowOfflineMaps] = useState(false);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [showEvacuationModal, setShowEvacuationModal] = useState(false);
  const [activeEvacuation, setActiveEvacuation] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const wrapperRef = useRef(null);

  const handleAssessEvacuation = (facility) => {
    const assessment = assessEvacuationRoute({
      origin: center,
      facility: {
        ...facility,
        id: facility.id || facility.name,
      },
      weather,
      terrain,
      isOffline: !isOnline,
    });
    setActiveEvacuation(assessment);
    setShowEvacuationModal(true);
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Synchronize coordinates and valid location state
  useEffect(() => {
    let targetCoords = null;
    let targetLabel = locationLabel || "Current location";

    if (isDemoScenario && mapCenter && Array.isArray(mapCenter) && isValidCoordinate(mapCenter[0], mapCenter[1])) {
      targetCoords = [Number(mapCenter[0]), Number(mapCenter[1])];
      targetLabel = demoLocationLabel ?? "DEMO scenario location";
    } else if (mapCenter && Array.isArray(mapCenter) && isValidCoordinate(mapCenter[0], mapCenter[1])) {
      targetCoords = [Number(mapCenter[0]), Number(mapCenter[1])];
      targetLabel = locationLabel ?? "Current location";
    }

    if (targetCoords) {
      setCenter(targetCoords);
      setHasValidLocation(true);
      setLocationLabel(targetLabel);
    } else {
      setCenter(INDIA_DEFAULT_CENTER);
      setHasValidLocation(false);
      setLocationLabel("Location unavailable (Search a city)");
    }
  }, [mapCenter, locationLabel, demoLocationLabel, isDemoScenario]);

  // Fetch real geospatial context (terrain & radar) and emergency facilities
  useEffect(() => {
    if (!hasValidLocation) {
      setTerrain({ available: false, elevation: null, slope: null });
      setRadar({ available: false, nearestStation: null, distanceKm: null, withinCoverage: false });
      setFacilities([]);
      setFacilityStatus("Location required");
      return;
    }

    const [lat, lon] = center;
    let isCancelled = false;

    // 1. Fetch server-side geospatial context (terrain & radar coverage)
    fetchGeospatialContext({ latitude: lat, longitude: lon })
      .then((data) => {
        if (isCancelled) return;
        if (data.available) {
          setTerrain(data.terrain);
          setRadar(data.radar);
        } else {
          setTerrain({ available: false, elevation: null, slope: null, error: data.error });
          setRadar({ available: false, nearestStation: null, distanceKm: null, withinCoverage: false });
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn("[RiskMap] Geospatial context warning:", err.message);
        }
      });

    // 2. Fetch nearby emergency facilities (hospitals & shelters) with offline fallback
    setFacilityStatus("Scanning facilities…");

    function loadOfflineShelterFallback(targetLat, targetLon) {
      getCachedShelters()
        .then((cached) => {
          if (isCancelled) return;
          const list = cached && cached.length > 0 ? cached : VERIFIED_EMERGENCY_SHELTERS;
          const mapped = list.map((s) => ({
            name: s.name,
            type: s.type,
            latitude: s.lat,
            longitude: s.lon,
            address: s.address,
            phone: s.phone,
            capacity: s.capacity,
            distance: Math.sqrt(
              Math.pow((s.lat - targetLat) * 111, 2) +
                Math.pow((s.lon - targetLon) * 111 * Math.cos((targetLat * Math.PI) / 180), 2)
            ),
            isOfflineCached: true,
          }));
          mapped.sort((a, b) => a.distance - b.distance);
          setFacilities(mapped);
          setFacilityStatus("Offline Shelters Active");
        })
        .catch(() => {
          if (!isCancelled) {
            setFacilities([]);
            setFacilityStatus("Emergency facilities unavailable");
          }
        });
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      loadOfflineShelterFallback(lat, lon);
    } else {
      fetchEmergencyFacilitiesSafe({ latitude: lat, longitude: lon })
        .then((res) => {
          if (isCancelled) return;
          if (res.available && res.facilities.length > 0) {
            setFacilities(res.facilities);
            setFacilityStatus("Available");
          } else {
            loadOfflineShelterFallback(lat, lon);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            loadOfflineShelterFallback(lat, lon);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [center, hasValidLocation]);

  // Lock / unlock body scroll in fullscreen & handle Escape key
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    function handleKeyDown(e) {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    }
    if (isFullscreen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  function toggleFullscreen() {
    setIsFullscreen((v) => !v);
  }

  const meta = getRiskMeta(riskLevel);
  const whyText = buildWhyText(riskLevel, riskScore, predHazard, weather, xai);

  const layerProps = {
    center,
    hasValidLocation,
    locationLabel: locationLabelState,
    meta,
    riskLevel,
    riskScore,
    riskConfidence,
    predHazard,
    terrain,
    radar,
    facilities,
    fsMode: false,
    onAssessEvacuation: handleAssessEvacuation,
    activeEvacuation,
  };

  const overlayProps = {
    meta,
    riskLevel,
    riskScore,
    riskConfidence,
    predHazard,
    locationLabel: locationLabelState,
    center,
    hasValidLocation,
    whyText,
    terrain,
    radar,
    facilities,
    facilityStatus,
    xai,
    fsMode: false,
    isOnline,
    onToggle: toggleFullscreen,
    onOpenOfflineMaps: () => setShowOfflineMaps(true),
    onOpenImpactModal: () => setShowImpactModal(true),
  };

  return (
    <>
      <OfflineMapManager
        isOpen={showOfflineMaps}
        onClose={() => setShowOfflineMaps(false)}
        currentLocation={{ latitude: center[0], longitude: center[1] }}
      />

      <EvacuationIntelligenceModal
        isOpen={showEvacuationModal}
        onClose={() => setShowEvacuationModal(false)}
        assessment={activeEvacuation}
      />

      <ExplainableImpactModal
        isOpen={showImpactModal}
        onClose={() => setShowImpactModal(false)}
        riskScore={riskScore}
        riskLevel={riskLevel}
        riskConfidence={riskConfidence}
        predHazard={predHazard}
        weather={weather}
        terrain={terrain}
        radar={radar}
        facilities={facilities}
        xai={xai}
        locationLabel={locationLabelState}
        center={center}
        isOnline={isOnline}
        weatherTimestamp={weather?.timestamp}
        dataSource={weather?.dataSource || "Open-Meteo"}
      />

      {/* ── Inline wrapper (always in DOM; invisible while portal is active) ── */}
      <div
        ref={wrapperRef}
        className="risk-map-wrapper"
        style={{ visibility: isFullscreen ? "hidden" : "visible" }}
      >
        {!isFullscreen && (
          <>
            <MapOverlays {...overlayProps} />
            <RiskMapLayers {...layerProps} />
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
          layerProps={{ ...layerProps, fsMode: true }}
          overlayProps={{ ...overlayProps, fsMode: true }}
          onToggle={toggleFullscreen}
        />
      )}
    </>
  );
}
