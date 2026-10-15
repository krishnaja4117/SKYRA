import { useState } from "react";

export default function EvacuationIntelligenceModal({
  isOpen,
  onClose,
  assessment,
}) {
  if (!isOpen || !assessment) return null;

  const { facility, routeMetrics, corridor, status, hazardFactors, safetyDisclaimer, criticalChecklist } = assessment;
  const [checkedItems, setCheckedItems] = useState({});

  const toggleCheck = (idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div
      className="skyra-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(5, 11, 24, 0.82)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="skyra-modal-content glass-panel"
        style={{
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          borderRadius: "16px",
          padding: "1.5rem",
          color: "#f8fafc",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 24px rgba(56, 189, 248, 0.15)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "1.25rem" }}>🛡️</span>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#38bdf8", fontWeight: 700 }}>
                Offline Evacuation Intelligence
              </span>
              <span
                style={{
                  background: status.routeCategory.includes("DESIGNATED") ? "rgba(34, 197, 94, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: status.routeCategory.includes("DESIGNATED") ? "#4ade80" : "#fbbf24",
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontWeight: 600,
                  border: "1px solid currentColor",
                }}
              >
                {status.routeLabel}
              </span>
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#fff" }}>
              {facility.name}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
              {facility.address} · {facility.authority}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#cbd5e1",
              borderRadius: "8px",
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Mandatory Safety Alert */}
        <div
          style={{
            background: "rgba(220, 38, 38, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.5)",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            marginBottom: "1.2rem",
            fontSize: "0.82rem",
            lineHeight: 1.5,
            color: "#fca5a5",
          }}
        >
          <strong style={{ color: "#ef4444", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span>⚠️</span> STRICT SAFETY ADVISORY (NO ROUTE IS GUARANTEED SAFE)
          </strong>
          {safetyDisclaimer}
        </div>

        {/* Navigation & Transit Vector Metrics */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "10px",
            marginBottom: "1.2rem",
          }}
        >
          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>DISTANCE</span>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#38bdf8", marginTop: "2px" }}>
              {routeMetrics.formattedDistance}
            </div>
            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Direct line vector</span>
          </div>

          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>HEADING</span>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#a855f7", marginTop: "2px" }}>
              🧭 {routeMetrics.cardinalDirection} ({routeMetrics.bearingDegrees}°)
            </div>
            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Compass bearing</span>
          </div>

          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>WALK TIME</span>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#4ade80", marginTop: "2px" }}>
              ~{routeMetrics.estimatedWalkMin} min
            </div>
            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>@ 3.5 km/h pack pace</span>
          </div>

          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>VEHICLE TRANSIT</span>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fbbf24", marginTop: "2px" }}>
              ~{routeMetrics.estimatedDriveMin} min
            </div>
            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>Avoid if roads flooded</span>
          </div>
        </div>

        {/* Designated Corridor Infrastructure Context */}
        {corridor ? (
          <div
            style={{
              background: "rgba(56, 189, 248, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1.2rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase" }}>
                🛣️ DESIGNATED CORRIDOR INFRASTRUCTURE
              </span>
              <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                Verified: {corridor.verifiedDate}
              </span>
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>
              {corridor.name}
            </div>
            <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "#cbd5e1" }}>
              {corridor.roadType} · {corridor.elevationProfile}
            </p>
            <div style={{ fontSize: "0.76rem", color: "#f59e0b", background: "rgba(245, 158, 11, 0.1)", padding: "6px 10px", borderRadius: "6px" }}>
              ⚠️ <strong>Vulnerability Note:</strong> {corridor.floodVulnerability}
            </div>
            <div style={{ marginTop: "6px", fontSize: "0.7rem", color: "#64748b" }}>
              Authority: {corridor.sourceAuthority} · License: {corridor.sourceLicense}
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px dashed rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              padding: "0.85rem",
              marginBottom: "1.2rem",
              fontSize: "0.8rem",
              color: "#94a3b8",
            }}
          >
            ℹ️ <strong>Offline Road Graph Notice:</strong> No designated municipal highway corridor is pre-mapped for this specific facility. Showing straight-line navigational bearing vector. Exercise extreme caution when following local roads.
          </div>
        )}

        {/* Hazard Factors Along Vector */}
        {hazardFactors.length > 0 && (
          <div style={{ marginBottom: "1.2rem" }}>
            <h4 style={{ fontSize: "0.82rem", textTransform: "uppercase", color: "#f87171", margin: "0 0 6px" }}>
              Active Environmental Hazards
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {hazardFactors.map((hz, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "0.78rem",
                    color: "#fecaca",
                    background: "rgba(239, 68, 68, 0.08)",
                    borderLeft: "3px solid #ef4444",
                    padding: "6px 10px",
                    borderRadius: "0 6px 6px 0",
                  }}
                >
                  {hz}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Facility Details & Helpline Actions */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "10px",
            padding: "1rem",
            marginBottom: "1.2rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase" }}>
              FACILITY AMENITIES & CAPACITY
            </span>
            {facility.capacity && (
              <span style={{ fontSize: "0.8rem", color: "#4ade80", fontWeight: 600 }}>
                👥 Capacity: {facility.capacity} people
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
            {facility.amenities.map((amenity, idx) => (
              <span
                key={idx}
                style={{
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "#86efac",
                  fontSize: "0.72rem",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                }}
              >
                ✓ {amenity}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {facility.phone && (
              <a
                href={`tel:${facility.phone.replace(/[^0-9+]/g, "")}`}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  background: "linear-gradient(135deg, #0284c7, #0369a1)",
                  color: "#fff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
                }}
              >
                📞 Call Shelter ({facility.phone})
              </a>
            )}
            <a
              href="tel:112"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              🚨 Call 112 (National SOS)
            </a>
          </div>
        </div>

        {/* Pre-Evacuation Readiness Checklist */}
        <div>
          <h4 style={{ fontSize: "0.82rem", textTransform: "uppercase", color: "#38bdf8", margin: "0 0 8px" }}>
            Pre-Evacuation Citizen Checklist
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {criticalChecklist.map((item, idx) => (
              <label
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  fontSize: "0.78rem",
                  color: checkedItems[idx] ? "#64748b" : "#e2e8f0",
                  textDecoration: checkedItems[idx] ? "line-through" : "none",
                  cursor: "pointer",
                  background: "rgba(15, 23, 42, 0.4)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!checkedItems[idx]}
                  onChange={() => toggleCheck(idx)}
                  style={{ marginTop: "2px", accentColor: "#0ea5e9" }}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
