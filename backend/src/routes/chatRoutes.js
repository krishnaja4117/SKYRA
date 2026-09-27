const express = require("express");
const { postChat } = require("../controllers/chatController");
const { expensiveLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/chat", expensiveLimiter, postChat);

module.exports = router;
