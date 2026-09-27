const express = require("express");

const healthRoutes = require("./healthRoutes");
const weatherRoutes = require("./weatherRoutes");
const facilityRoutes = require("./facilityRoutes");
const riskRoutes = require("./riskRoutes");
const alertRoutes = require("./alertRoutes");
const emergencyRoutes = require("./emergencyRoutes");
const intelligenceRoutes = require("./intelligenceRoutes");
const ragRoutes = require("./ragRoutes");
const chatRoutes = require("./chatRoutes");
const voiceRoutes = require("./voiceRoutes");
const geospatialRoutes = require("./geospatialRoutes");

const apiRouter = express.Router();

// Mount all modular domain routers
apiRouter.use(healthRoutes);
apiRouter.use(weatherRoutes);
apiRouter.use(facilityRoutes);
apiRouter.use(riskRoutes);
apiRouter.use(alertRoutes);
apiRouter.use(emergencyRoutes);
apiRouter.use(intelligenceRoutes);
apiRouter.use(ragRoutes);
apiRouter.use(chatRoutes);
apiRouter.use(voiceRoutes);
apiRouter.use(geospatialRoutes);

module.exports = apiRouter;
