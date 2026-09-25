const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const { postRisk } = require("./controllers/riskController");

const {
  initializeAlerts,
  startMonitoring,
  getActiveAlert,
  getAlertHistory,
} = require("./services/monitorService");

const app = express();

app.use(cors());
app.use(express.json());


/* ================================
   HEALTH CHECK
================================ */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "SKYRA backend is running",
  });
});


/* ================================
   RISK API
================================ */

app.post("/api/risk", postRisk);


/* ================================
   ALERT API
================================ */

app.get("/api/alerts", (req, res) => {
  res.json({
    activeAlert: getActiveAlert(),
    history: getAlertHistory(),
  });
});


/* ================================
   START SERVER
================================ */

async function startServer() {
  try {

    await mongoose.connect(
      process.env.MONGODB_URI
    );

    console.log(
      "✅ MongoDB connected successfully"
    );


    /* LOAD SAVED ALERTS */

    await initializeAlerts();


    /* START BACKEND */

    app.listen(5000, () => {

      console.log(
        "🚀 SKYRA backend running on port 5000"
      );


      /* START CONTINUOUS MONITORING */

      startMonitoring();

    });

  } catch (error) {

    console.error(
      "❌ MongoDB connection failed:",
      error.message
    );

  }
}


startServer();