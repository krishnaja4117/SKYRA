function WeatherCard({ weather }) {
  return (
    <article className="status-card">
      <h2>Current Weather</h2>
      <p className="weather-temp">
        {weather.temperature}°C
        <span>{weather.condition}</span>
      </p>
      <ul className="stat-list">
        <li>
          Feels like <strong>{weather.feelsLike}°C</strong>
        </li>
        <li>
          Humidity <strong>{weather.humidity}%</strong>
        </li>
        <li>
          Wind <strong>{weather.wind}</strong>
        </li>
        <li>
          Rainfall <strong>{weather.rainfall}</strong>
        </li>
      </ul>
      <p className="card-updated">Updated {weather.updatedAt}</p>
    </article>
  );
}

export default WeatherCard;
