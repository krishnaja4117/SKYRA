const express = require("express");
const {
  postIntelligence,
  getIntelligence,
} = require("../controllers/intelligenceController");
const { expensiveLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/intelligence", expensiveLimiter, postIntelligence);
router.get("/intelligence", expensiveLimiter, getIntelligence);

module.exports = router;
