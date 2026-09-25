function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fieldName) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    const error = new Error(`${fieldName} must be a number`);
    error.statusCode = 400;
    throw error;
  }

  return number;
}

function validateRiskInput(body = {}) {
  const rainfall = toNumber(body.rainfall, 'rainfall');
  const forecastRainfall = toNumber(
    body.forecastRainfall,
    'forecastRainfall'
  );
  const humidity = toNumber(body.humidity, 'humidity');
  const windSpeed = toNumber(body.windSpeed, 'windSpeed');
  const terrainSlope = toNumber(body.terrainSlope, 'terrainSlope');
  const historicalRisk = toNumber(
    body.historicalRisk,
    'historicalRisk'
  );
  const temperature = toNumber(body.temperature, 'temperature');
  const pressure = toNumber(body.pressure, 'pressure');

  if (
    rainfall < 0 ||
    forecastRainfall < 0 ||
    windSpeed < 0
  ) {
    const error = new Error(
      'rainfall, forecastRainfall and windSpeed cannot be negative'
    );

    error.statusCode = 400;
    throw error;
  }

  return {
    rainfall,
    forecastRainfall,
    humidity: clamp(humidity, 0, 100),
    windSpeed,
    terrainSlope: clamp(terrainSlope, 0, 90),
    historicalRisk: clamp(historicalRisk, 0, 100),
    temperature,
    pressure,
    location: body.location || null,
  };
}

module.exports = {
  validateRiskInput,
};