import { useState, useEffect } from "react";
import { getOfflineQueueCount } from "../services/idbStorage";
import ResilienceTrustCenter from "./ResilienceTrustCenter";

export default function OfflineStatusIndicator({ lastDataTimestamp, dataSource }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [showTrustCenter, setShowTrustCenter] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setDismissed(false);
    }
    function handleOffline() {
      setIsOnline(false);
      setDismissed(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial and periodic queue count check
    async function updateQueue() {
      try {
        const count = await getOfflineQueueCount();
        setPendingCount(count);
      } catch {
        // IDB not yet initialized or error
      }
    }
    updateQueue();
    const interval = setInterval(updateQueue, 10000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (isOnline && pendingCount === 0) {
    return null;
  }

  if (dismissed && !isOnline) {
    // Show compact pill if user minimized
    return (
      <div
        className="offline-pill-minimized"
        onClick={() => setDismissed(false)}
        title="Offline Mode Active - Click for details"
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "1rem",
          zIndex: 9999,
          background: "#dc2626",
          color: "#fff",
          padding: "6px 12px",
          borderRadius: "20px",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>📡 Offline</span>
        {pendingCount > 0 && (
          <span style={{ background: "#fff", color: "#dc2626", borderRadius: "10px", padding: "1px 6px", fontSize: "0.7rem" }}>
            {pendingCount} queued
          </span>
        )}
      </div>
    );
  }

  const timeAgo = lastDataTimestamp
    ? formatTimeDifference(lastDataTimestamp)
    : "No recent snapshot";

  return (
    <>
      <aside
        className="offline-banner"
      role="status"
      aria-live="polite"
      style={{
        background: isOnline ? "rgba(14, 165, 233, 0.95)" : "rgba(220, 38, 38, 0.95)",
        color: "#ffffff",
        padding: "0.55rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "0.82rem",
        fontWeight: 500,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        position: "sticky",
        top: 0,
        zIndex: 9998,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "1rem" }}>{isOnline ? "🔄" : "📡"}</span>
        <div>
          <strong>{isOnline ? "Network Restored" : "Offline Mode Active"}</strong>
          <span style={{ marginLeft: "0.5rem", opacity: 0.95 }}>
            {isOnline
              ? pendingCount > 0
                ? `Syncing ${pendingCount} pending emergency update(s)...`
                : "All systems online and synchronized."
              : `Operating disconnected. Data age: ${timeAgo} (${dataSource || "Local Cache"}).`}
          </span>
          {!isOnline && (
            <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.85, marginTop: "2px" }}>
              Offline safety guidance, local ML risk engine, and cached map tiles remain active.
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {pendingCount > 0 && (
          <span
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.74rem",
              fontWeight: 600,
            }}
          >
            {pendingCount} Queued
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowTrustCenter(true)}
          style={{
            background: "rgba(255, 255, 255, 0.2)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: "0.74rem",
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: "6px",
          }}
          title="Open System Resilience & Trust Center"
        >
          🛡️ Trust Center
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: "1.1rem",
            padding: "2px 6px",
            lineHeight: 1,
          }}
          aria-label="Dismiss offline alert"
        >
          &times;
        </button>
      </div>
    </aside>

    <ResilienceTrustCenter
      isOpen={showTrustCenter}
      onClose={() => setShowTrustCenter(false)}
      weatherTimestamp={lastDataTimestamp}
      dataSource={dataSource}
    />
  </>
  );
}

function formatTimeDifference(isoTimestamp) {
  try {
    const diffMs = Date.now() - new Date(isoTimestamp).getTime();
    if (diffMs < 0) return "Just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "Unknown age";
  }
}
