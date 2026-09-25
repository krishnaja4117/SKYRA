require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',
};

module.exports = env;
