const express = require("express");
const { getHealth, getApiCatalog } = require("../controllers/healthController");

const router = express.Router();

router.get("/health", getHealth);
router.get("/meta", getApiCatalog);

module.exports = router;
