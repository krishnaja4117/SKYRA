/**
 * SKYRA – Notification Controller (Phase 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP endpoints for registering push devices, inspecting FCM status,
 * and safely dispatching disaster notifications.
 */

const {
  registerDeviceToken,
  unregisterDeviceToken,
  getNotificationServiceStatus,
  dispatchDisasterAlert,
} = require("../services/fcmService");

async function postRegisterDevice(req, res, next) {
  try {
    const { token, platform, location, radiusKm, tags } = req.body || {};
    if (!token) {
      return res.status(400).json({
        error: "Missing required parameter: token is required.",
        status: 400,
      });
    }

    const result = registerDeviceToken({
      token,
      platform,
      location,
      radiusKm,
      tags,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function postUnregisterDevice(req, res, next) {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({
        error: "Missing required parameter: token is required.",
        status: 400,
      });
    }

    const result = unregisterDeviceToken(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getNotificationStatus(_req, res, next) {
  try {
    const status = getNotificationServiceStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function postTriggerTestAlert(req, res, next) {
  try {
    const { title, body, priority = "P2", hazard = "Test Exercise", latitude, longitude } = req.body || {};

    const result = await dispatchDisasterAlert({
      id: `test-${Date.now()}`,
      title: title || "SKYRA Disaster Drill Notification",
      body: body || "This is a verified test of the SKYRA background notification system.",
      priority,
      hazard,
      riskScore: 65,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
    });

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  postRegisterDevice,
  postUnregisterDevice,
  getNotificationStatus,
  postTriggerTestAlert,
};
