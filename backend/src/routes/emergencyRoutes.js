const express = require("express");
const {
  postActivateEmergency,
  postTriggerSos,
  postUpdateSafetyStatus,
  getEmergencyStatusHandler,
  postDeactivateEmergency,
} = require("../controllers/emergencyController");

const router = express.Router();

router.post("/emergency/activate", postActivateEmergency);
router.post("/emergency/sos", postTriggerSos);
router.post("/emergency/status", postUpdateSafetyStatus);
router.get("/emergency/status/:eventId", getEmergencyStatusHandler);
router.post("/emergency/deactivate", postDeactivateEmergency);

module.exports = router;
