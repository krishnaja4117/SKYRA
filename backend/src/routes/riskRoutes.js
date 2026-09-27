const express = require("express");
const { postRisk } = require("../controllers/riskController");

const router = express.Router();

router.post("/risk", postRisk);

module.exports = router;
