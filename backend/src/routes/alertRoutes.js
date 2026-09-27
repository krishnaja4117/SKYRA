const express = require("express");
const {
  getAlerts,
  getActiveAlertsOnly,
  postMonitoredLocation,
  postAcknowledgeAlert,
  postResolveAlert,
  getAlertCapXml,
} = require("../controllers/alertController");

const router = express.Router();

router.get("/alerts", getAlerts);
router.get("/alerts/active", getActiveAlertsOnly);
router.post("/alerts/monitor", postMonitoredLocation);
router.post("/monitor", postMonitoredLocation);
router.post("/alerts/:id/acknowledge", postAcknowledgeAlert);
router.post("/alerts/:id/resolve", postResolveAlert);
router.get("/alerts/cap", getAlertCapXml);

module.exports = router;
