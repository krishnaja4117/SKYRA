const express = require("express");
const {
  postRagAsk,
  postRagEvidence,
} = require("../controllers/ragController");
const { expensiveLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/rag/ask", expensiveLimiter, postRagAsk);
router.post("/rag/evidence", expensiveLimiter, postRagEvidence);

module.exports = router;
