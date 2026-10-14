import { useState, useEffect, useRef } from "react";
import {
  PRESET_REGIONS,
  activateRegionOfflinePack,
  getCachedMapSummary,
  deleteRegionMapPack,
  getMapCoverageInfo,
} from "../services/mapTileStorage";

export default function OfflineMapManager({ isOpen, onClose }) {
  const [summary, setSummary] = useState(null);
  const [activatingRegion, setActivatingRegion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadSummary();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen]);

  async function loadSummary() {
    try {
      const data = await getCachedMapSummary();
      setSummary(data);
    } catch (err) {
      console.warn("Failed to load map summary:", err);
    }
  }

  async function handleActivate(region) {
    if (activatingRegion) return;

    setActivatingRegion(region.id);
    setProgress({ step: "INIT", progress: 10, message: "Initializing disaster package..." });
    setStatusMessage(`Activating offline disaster package for ${region.name}...`);

    abortControllerRef.current = new AbortController();

    try {
      await activateRegionOfflinePack(region.id, {
        onProgress: (p) => setProgress(p),
        signal: abortControllerRef.current.signal,
      });

      setStatusMessage(`✅ ${region.name} offline map package & shelters activated successfully.`);
      await loadSummary();
    } catch (err) {
      if (err.message.includes("aborted")) {
        setStatusMessage("Activation cancelled.");
      } else {
        setStatusMessage(`⚠️ Activation failed: ${err.message}`);
      }
    } finally {
      setActivatingRegion(null);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }

  async function handleDelete(regionId) {
    try {
      await deleteRegionMapPack(regionId);
      setStatusMessage("Offline disaster pack removed.");
      await loadSummary();
    } catch (err) {
      setStatusMessage(`Failed to delete: ${err.message}`);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        className="modal-content glass-panel"
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.5rem",
          color: "#f8fafc",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
            🗺️ Licensed Regional Offline Disaster Maps & Shelters
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.5rem",
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        </div>

        {/* Disclaimer Banner */}
        <div
          style={{
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "0.78rem",
            color: "#fde68a",
            marginBottom: "1.2rem",
            lineHeight: 1.45,
          }}
        >
          <strong>⚠️ Offline Map Limitations:</strong> Offline packages store regional geographic basemaps and verified emergency evacuation shelters. Cached maps <strong>cannot</strong> display dynamic traffic, real-time road washouts, or live radar sweeps while disconnected.
        </div>

        {/* Storage Summary */}
        <div style={{ background: "#1e293b", padding: "10px 14px", borderRadius: "8px", marginBottom: "1.2rem", fontSize: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Active Offline Region Packs:</span>
            <strong>{summary ? `${summary.totalPacks} installed (~${summary.totalMB} MB)` : "Loading..."}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#94a3b8" }}>
            <span>Cached Disaster Shelters:</span>
            <strong style={{ color: "#38bdf8" }}>{summary?.totalShelters ?? 0} facilities available offline</strong>
          </div>
        </div>

        {/* Active Progress */}
        {activatingRegion && progress && (
          <div style={{ background: "#1e293b", padding: "12px", borderRadius: "8px", marginBottom: "1.2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "6px" }}>
              <span>{progress.message}</span>
              <span>{progress.progress}%</span>
            </div>
            <div style={{ width: "100%", height: "8px", background: "#334155", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress.progress}%`,
                  height: "100%",
                  background: "#0ea5e9",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>
        )}

        {statusMessage && (
          <div style={{ marginBottom: "1rem", fontSize: "0.8rem", color: "#38bdf8" }}>
            {statusMessage}
          </div>
        )}

        {/* Region List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {PRESET_REGIONS.map((region) => {
            const isInstalled = Boolean(summary?.installedPacks?.some((p) => p.region === region.id));
            const coverage = getMapCoverageInfo(region.id);

            return (
              <div
                key={region.id}
                style={{
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: isInstalled ? "rgba(14, 165, 233, 0.05)" : "transparent",
                }}
              >
                <div style={{ flex: 1, paddingRight: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.9rem" }}>{region.name}</strong>
                    {isInstalled ? (
                      <span
                        style={{
                          background: "#22c55e",
                          color: "#0f172a",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        ACTIVE OFFLINE ({region.shelterCount} shelters)
                      </span>
                    ) : (
                      <span
                        style={{
                          background: "#475569",
                          color: "#f8fafc",
                          fontSize: "0.68rem",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {region.shelterCount} Verified Shelters
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "4px 0 2px", fontSize: "0.76rem", color: "#cbd5e1" }}>
                    {region.description}
                  </p>
                  <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    Bounds: [{region.bbox.join(", ")}] • Zoom: 10–13 • License: {coverage.license}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  {isInstalled ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(region.id)}
                      disabled={Boolean(activatingRegion)}
                      style={{
                        background: "rgba(220, 38, 38, 0.2)",
                        border: "1px solid #dc2626",
                        color: "#fca5a5",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleActivate(region)}
                      disabled={Boolean(activatingRegion)}
                      style={{
                        background: "#0ea5e9",
                        border: "none",
                        color: "#fff",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Install Pack
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#334155",
              color: "#f8fafc",
              border: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
