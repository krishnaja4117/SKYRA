const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "",
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000",
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY || "",
};

module.exports = env;
