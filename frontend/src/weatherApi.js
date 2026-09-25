export async function getLiveWeather(latitude, longitude) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,rain,surface_pressure` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,rain,wind_speed_10m` +
    `&forecast_days=2` +
    `&timezone=auto`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Weather API request failed');
  }

  return response.json();
}
