const rateLimit = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later.", status: 429 },
  skip: () => process.env.NODE_ENV === "test",
});

const expensiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Service rate limit exceeded. Please wait a moment.", status: 429 },
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = {
  apiLimiter,
  expensiveLimiter,
};
