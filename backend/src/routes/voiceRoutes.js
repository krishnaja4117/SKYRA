const express = require("express");
const {
  postTranscribe,
  postTranslate,
  postSynthesize,
  getLanguages,
  getVoiceStatus,
} = require("../controllers/voiceController");
const { expensiveLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/voice/transcribe", expensiveLimiter, postTranscribe);
router.post("/voice/translate", expensiveLimiter, postTranslate);
router.post("/voice/synthesize", expensiveLimiter, postSynthesize);
router.get("/voice/languages", getLanguages);
router.get("/voice/status", getVoiceStatus);

module.exports = router;
