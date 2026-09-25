const env = require("../config/env");

/**
 * Fallback risk calculator used only when the Python ML service is unreachable.
 * Ensures the system stays operational with deterministic physics-based rules.
 */
function calculateFallbackRisk(inputs) {
  const rainfall = Number(inputs.rainfall || 0);
  const forecastRainfall = Number(inputs.forecastRainfall || 0);
  const windSpeed = Number(inputs.windSpeed || 0);
  const humidity = Number(inputs.humidity || 50);

  let score = 20; // baseline Low
  if (rainfall >= 50 || forecastRainfall >= 50 || windSpeed >= 70) {
    score = 85; // Severe
  } else if (rainfall >= 25 || forecastRainfall >= 30 || windSpeed >= 50) {
    score = 72; // High
  } else if (rainfall >= 10 || forecastRainfall >= 15 || windSpeed >= 30 || humidity >= 85) {
    score = 48; // Moderate
  }

  let riskLevel = "Low";
  if (score >= 80) riskLevel = "Severe";
  else if (score >= 70) riskLevel = "High";
  else if (score >= 40) riskLevel = "Moderate";

  const factors = [];
  if (rainfall > 0) factors.push({ name: "Recent Rainfall", impact: rainfall >= 25 ? "High" : "Moderate", detail: `${rainfall} mm recorded.` });
  if (windSpeed >= 30) factors.push({ name: "Wind Speed", impact: windSpeed >= 50 ? "High" : "Moderate", detail: `${windSpeed} km/h wind.` });
  if (factors.length === 0) factors.push({ name: "Baseline Weather", impact: "Low", detail: "Conditions within normal bounds." });

  return {
    riskLevel,
    riskScore: score,
    confidence: 80,
    explanation: `Heuristic fallback: conditions classified as ${riskLevel} risk with score of ${score}%.`,
    factors,
    isFallback: true,
  };
}

async function calculateRisk(inputs) {
  const mlUrl = `${env.mlServiceUrl}/predict`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(mlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputs),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[SKYRA RiskEngine] ML service error: ${response.status} - ${text}`);
      return calculateFallbackRisk(inputs);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.warn(`[SKYRA RiskEngine] ML service unavailable at ${mlUrl} (${error.message}). Using fallback.`);
    return calculateFallbackRisk(inputs);
  }
}

module.exports = {
  calculateRisk,
};