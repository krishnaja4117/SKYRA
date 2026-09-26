/**
 * SKYRA – Alert Controller (Phase 12)
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP controller endpoints for retrieving, managing, acknowledging, and resolving
 * meteorological risk alerts and continuous monitoring location context.
 */

const {
  getActiveAlert,
  getAlertHistory,
  getMonitoredLocation,
  setMonitoredLocation,
  acknowledgeAlert,
  resolveAlert,
} = require("../services/monitorService");

function getAlerts(req, res) {
  const { location, locationName, name } = req.query || {};
  const requestedLocation = location || locationName || name || null;

  let activeAlert = getActiveAlert();
  const monitoredLocation = getMonitoredLocation();

  // Location isolation: if query requested a specific location and active alert belongs to another, return null for requested location
  if (
    requestedLocation &&
    activeAlert &&
    activeAlert.location &&
    activeAlert.location.toLowerCase() !== String(requestedLocation).toLowerCase()
  ) {
    activeAlert = null;
  }

  res.json({
    activeAlert,
    history: getAlertHistory(),
    monitoredLocation,
    timestamp: new Date().toISOString(),
  });
}

function getActiveAlertsOnly(_req, res) {
  res.json({
    activeAlert: getActiveAlert(),
    timestamp: new Date().toISOString(),
  });
}

async function postMonitoredLocation(req, res, next) {
  try {
    const { latitude, longitude, lat, lon, locationName, name, consent } = req.body || {};
    const targetLat = latitude ?? lat;
    const targetLon = longitude ?? lon;

    if (consent === false || targetLat == null || targetLon == null) {
      await setMonitoredLocation(null, null);
      return res.json({
        status: "idle",
        message: "Monitoring location cleared; monitor returned to idle.",
        monitoredLocation: null,
        activeAlert: null,
      });
    }

    await setMonitoredLocation(
      Number(targetLat),
      Number(targetLon),
      locationName || name || "Monitored Location"
    );

    res.json({
      status: "active",
      message: "Monitored location updated successfully.",
      monitoredLocation: getMonitoredLocation(),
      activeAlert: getActiveAlert(),
    });
  } catch (err) {
    next(err);
  }
}

async function postAcknowledgeAlert(req, res, next) {
  try {
    const alertId = req.params.id || req.body.alertId || req.body.id;
    const acknowledgedBy = req.body.acknowledgedBy || "User";

    if (!alertId) {
      return res.status(400).json({
        error: "Missing required parameter: alert ID is required for acknowledgement.",
        status: 400,
      });
    }

    const updatedAlert = await acknowledgeAlert(alertId, acknowledgedBy);
    res.json({
      status: "success",
      message: `Alert ${alertId} acknowledged successfully.`,
      alert: updatedAlert,
    });
  } catch (err) {
    next(err);
  }
}

async function postResolveAlert(req, res, next) {
  try {
    const alertId = req.params.id || req.body.alertId || req.body.id;
    const resolvedBy = req.body.resolvedBy || "User";
    const reason = req.body.reason || "Manual resolution via API";

    if (!alertId) {
      return res.status(400).json({
        error: "Missing required parameter: alert ID is required for resolution.",
        status: 400,
      });
    }

    const updatedAlert = await resolveAlert(alertId, resolvedBy, reason);
    res.json({
      status: "success",
      message: `Alert ${alertId} resolved successfully.`,
      alert: updatedAlert,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAlerts,
  getActiveAlertsOnly,
  postMonitoredLocation,
  postAcknowledgeAlert,
  postResolveAlert,
};
