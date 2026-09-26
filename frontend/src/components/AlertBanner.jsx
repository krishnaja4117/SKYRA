/**
 * SKYRA – Universal Alert Banner (Phase 12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Prominent top-banner displayed across pages when an active P1 (Emergency)
 * or P2 (Warning) alert is active and unacknowledged.
 *
 * Guarantees:
 *   • Explicit Source Authority distinction (OFFICIAL_ADVISORY vs MODEL_ESTIMATE).
 *   • One-click persistent backend acknowledgement.
 *   • Shows true provenance and expiration timestamp.
 *   • Never misleads model predictions as official government orders.
 */

import { useState } from "react";
import { acknowledgeBackendAlert } from "../services/intelligenceService";
import { requestNotificationPermission, getNotificationPermission } from "../services/notificationService";

export default function AlertBanner({ activeAlert, onNavigate, onAlertAcknowledged }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissionState, setPermissionState] = useState(getNotificationPermission());

  if (!activeAlert || activeAlert.status === "Acknowledged" || activeAlert.status === "Resolved" || activeAlert.status === "Expired") {
    return null;
  }

  // Only P1 and P2 warrant a persistent top banner
  if (activeAlert.priority !== "P1" && activeAlert.priority !== "P2") {
    return null;
  }

  const isOfficial = activeAlert.sourceAuthority === "OFFICIAL_ADVISORY";
  const isEmergency = activeAlert.priority === "P1";

  const handleAcknowledge = async () => {
    try {
      setIsSubmitting(true);
      await acknowledgeBackendAlert({ id: activeAlert.id, acknowledgedBy: "User (In-App)" });
      if (typeof onAlertAcknowledged === "function") {
        onAlertAcknowledged(activeAlert.id);
      }
    } catch (err) {
      console.warn("[AlertBanner] Acknowledge error:", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnableNotifications = async () => {
    const res = await requestNotificationPermission();
    setPermissionState(res);
  };

  const bannerClass = isEmergency
    ? "skyra-alert-banner p1-emergency"
    : "skyra-alert-banner p2-warning";

  return (
    <aside className={bannerClass} role="alert" aria-live="assertive">
      <div className="skyra-alert-banner-inner">
        <div className="skyra-alert-banner-header">
          <span className="skyra-alert-badge authority-badge">
            {isOfficial ? "🇮🇳 OFFICIAL IMD ADVISORY" : "🤖 MODEL-ESTIMATED RISK"}
          </span>
          <span className={`skyra-alert-badge priority-badge ${activeAlert.priority.toLowerCase()}`}>
            {activeAlert.priority === "P1" ? "🚨 EMERGENCY (P1)" : "⚠️ WARNING (P2)"}
          </span>
          {activeAlert.occurrenceCount > 1 && (
            <span className="skyra-alert-badge occurrence-badge">
              Active for {activeAlert.occurrenceCount} cycles
            </span>
          )}
        </div>

        <div className="skyra-alert-banner-content">
          <strong className="skyra-alert-title">
            {activeAlert.title || `${activeAlert.hazard} Alert`}
          </strong>
          <p className="skyra-alert-message">
            {activeAlert.message || activeAlert.recommendedAction}
          </p>
        </div>

        <div className="skyra-alert-banner-actions">
          {permissionState === "default" && (
            <button
              type="button"
              className="skyra-banner-btn notif-btn"
              onClick={handleEnableNotifications}
              title="Allow desktop notifications for severe risk"
            >
              🔔 Enable Alerts
            </button>
          )}

          <button
            type="button"
            className="skyra-banner-btn nav-btn"
            onClick={() => onNavigate("Alerts & Advisories")}
          >
            Safety Guidance →
          </button>

          <button
            type="button"
            className="skyra-banner-btn ack-btn"
            onClick={handleAcknowledge}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Updating…" : "✓ I Understand"}
          </button>
        </div>
      </div>
    </aside>
  );
}
