/**
 * SKYRA – Emergency Controller (Phase 13 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP controller endpoints for Phase 13 Emergency Mode:
 *   • POST /api/emergency/activate
 *   • POST /api/emergency/sos
 *   • POST /api/emergency/status
 *   • GET  /api/emergency/status/:eventId
 *   • POST /api/emergency/deactivate
 */

const {
  activateEmergency,
  triggerSos,
  updateSafetyStatus,
  getEmergencyStatus,
  resolveEmergency,
} = require("../services/emergencyService");

async function postActivateEmergency(req, res, next) {
  try {
    const { eventId, latitude, longitude, locationLabel, accuracyMeters, metadata } = req.body || {};
    const result = await activateEmergency({
      eventId,
      latitude,
      longitude,
      locationLabel,
      accuracyMeters,
      metadata,
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function postTriggerSos(req, res, next) {
  try {
    const {
      eventId,
      latitude,
      longitude,
      locationLabel,
      accuracyMeters,
      emergencyType,
      contacts,
      isOffline,
      note,
    } = req.body || {};

    const result = await triggerSos({
      eventId,
      latitude,
      longitude,
      locationLabel,
      accuracyMeters,
      emergencyType,
      contacts,
      isOffline: Boolean(isOffline),
      note,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function postUpdateSafetyStatus(req, res, next) {
  try {
    const { eventId, safetyStatus, note } = req.body || {};

    if (!eventId) {
      return res.status(400).json({
        error: "Missing required parameter: eventId is required.",
        status: 400,
      });
    }

    if (!safetyStatus) {
      return res.status(400).json({
        error: "Missing required parameter: safetyStatus is required ('SAFE' or 'HELP_NEEDED').",
        status: 400,
      });
    }

    const result = await updateSafetyStatus({ eventId, safetyStatus, note });
    return res.status(200).json(result);
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message, status: 404 });
    }
    if (err.message.includes("Invalid") || err.message.includes("Illegal") || err.message.includes("Missing")) {
      return res.status(400).json({ error: err.message, status: 400 });
    }
    next(err);
  }
}

async function getEmergencyStatusHandler(req, res, next) {
  try {
    const eventId = req.params.eventId || req.query.eventId;
    if (!eventId) {
      return res.status(400).json({
        error: "Missing required parameter: eventId is required.",
        status: 400,
      });
    }

    const event = await getEmergencyStatus(eventId);
    if (!event) {
      return res.status(404).json({
        error: `Emergency event with ID '${eventId}' not found.`,
        status: 404,
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      eventId,
      event,
    });
  } catch (err) {
    next(err);
  }
}

async function postDeactivateEmergency(req, res, next) {
  try {
    const { eventId, note } = req.body || {};
    if (!eventId) {
      return res.status(400).json({
        error: "Missing required parameter: eventId is required.",
        status: 400,
      });
    }

    const result = await resolveEmergency(eventId, note);
    return res.status(200).json(result);
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message, status: 404 });
    }
    next(err);
  }
}

module.exports = {
  postActivateEmergency,
  postTriggerSos,
  postUpdateSafetyStatus,
  getEmergencyStatusHandler,
  postDeactivateEmergency,
};
