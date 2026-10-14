import { useState, useEffect, useRef } from "react";
import {
  PRESET_REGIONS,
  downloadRegionMapPack,
  getCachedMapSummary,
  deleteRegionMapPack,
} from "../services/mapTileStorage";

export default function OfflineMapManager({ isOpen, onClose, currentLocation }) {
  const [summary, setSummary] = useState(null);
  const [downloadingRegion, setDownloadingRegion] = useState(null);
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

  async function handleDownload(region) {
    if (downloadingRegion) return;

    const lat = region.id === "current_location" ? (currentLocation?.latitude || region.lat) : region.lat;
    const lon = region.id === "current_location" ? (currentLocation?.longitude || region.lon) : region.lon;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setStatusMessage("⚠️ Geographic coordinates unavailable for this area.");
      return;
    }

    setDownloadingRegion(region.id);
    setProgress({ percent: 0, downloaded: 0, total: 0 });
    setStatusMessage(`Downloading map tiles for ${region.name}...`);

    abortControllerRef.current = new AbortController();

    try {
      await downloadRegionMapPack({
        regionId: region.id,
        lat,
        lon,
        radiusKm: region.radiusKm || 25,
        onProgress: (p) => setProgress(p),
        signal: abortControllerRef.current.signal,
      });

      setStatusMessage(`✅ ${region.name} map pack successfully cached for offline use.`);
      await loadSummary();
    } catch (err) {
      if (err.message.includes("cancelled")) {
        setStatusMessage("Download cancelled.");
      } else {
        setStatusMessage(`⚠️ Download failed: ${err.message}`);
      }
    } finally {
      setDownloadingRegion(null);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }

  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  async function handleDelete(regionId) {
    try {
      await deleteRegionMapPack(regionId);
      setStatusMessage("Map pack deleted.");
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
          maxWidth: "600px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.5rem",
          color: "#f8fafc",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
            🗺️ Offline Regional Map Packs
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
          <strong>⚠️ Offline Map Notice:</strong> Downloaded maps provide local street and terrain basemaps during network outages. Cached maps <strong>cannot</strong> display live road closures, dynamic evacuation routes, or active Doppler radar rain overlays while offline.
        </div>

        {/* Storage Summary */}
        <div style={{ background: "#1e293b", padding: "10px 14px", borderRadius: "8px", marginBottom: "1.2rem", fontSize: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Cached Offline Tiles:</span>
            <strong>{summary ? `${summary.totalTiles} tiles (~${summary.totalMB} MB)` : "Loading..."}</strong>
          </div>
        </div>

        {/* Active Download Progress */}
        {downloadingRegion && progress && (
          <div style={{ background: "#1e293b", padding: "12px", borderRadius: "8px", marginBottom: "1.2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "6px" }}>
              <span>Downloading tiles: {progress.downloaded} / {progress.total}</span>
              <span>{progress.percent}%</span>
            </div>
            <div style={{ width: "100%", height: "8px", background: "#334155", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress.percent}%`,
                  height: "100%",
                  background: "#0ea5e9",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Cancel Download
              </button>
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
            const isDownloaded = Boolean(summary?.regions?.[region.id]?.tileCount > 0);
            const tileCount = summary?.regions?.[region.id]?.tileCount || 0;
            const sizeMB = summary?.regions?.[region.id]?.bytes
              ? (summary.regions[region.id].bytes / (1024 * 1024)).toFixed(1)
              : "0";

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
                  background: isDownloaded ? "rgba(14, 165, 233, 0.05)" : "transparent",
                }}
              >
                <div style={{ flex: 1, paddingRight: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "0.9rem" }}>{region.name}</strong>
                    {isDownloaded && (
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
                        SAVED ({tileCount} tiles, {sizeMB}MB)
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.76rem", color: "#94a3b8" }}>
                    {region.description}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  {isDownloaded ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(region.id)}
                      disabled={Boolean(downloadingRegion)}
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
                      Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(region)}
                      disabled={Boolean(downloadingRegion)}
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
                      Download Pack
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
