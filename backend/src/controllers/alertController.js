const {
  getActiveAlert,
  getAlertHistory,
} = require("../services/monitorService");

function getAlerts(_req, res) {
  res.json({
    activeAlert: getActiveAlert(),
    history: getAlertHistory(),
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getAlerts,
};
