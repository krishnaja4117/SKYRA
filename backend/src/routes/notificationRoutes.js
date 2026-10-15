const express = require("express");
const {
  postRegisterDevice,
  postUnregisterDevice,
  getNotificationStatus,
  postTriggerTestAlert,
} = require("../controllers/notificationController");

const router = express.Router();

router.post("/notifications/register", postRegisterDevice);
router.post("/notifications/unregister", postUnregisterDevice);
router.get("/notifications/status", getNotificationStatus);
router.post("/notifications/test-trigger", postTriggerTestAlert);

module.exports = router;
