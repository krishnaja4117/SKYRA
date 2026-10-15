const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "",
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000",
  bhashiniUserId: process.env.BHASHINI_USER_ID || "",
  bhashiniApiKey: process.env.BHASHINI_API_KEY || "",
  bhashiniInferenceApiKey: process.env.BHASHINI_INFERENCE_KEY || "",
  bhashiniPipelineId: process.env.BHASHINI_PIPELINE_ID || "",
  // ISRO / MOSDAC Satellite Remote Sensing Configuration
  mosdacApiEndpoint: process.env.MOSDAC_API_ENDPOINT || "https://api.mosdac.gov.in/api/v1/satellite",
  mosdacApiKey: process.env.MOSDAC_API_KEY || "",
  mosdacUserEmail: process.env.MOSDAC_USER_EMAIL || "",
};

module.exports = env;
