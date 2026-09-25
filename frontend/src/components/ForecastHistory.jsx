import { useEffect, useState } from 'react';
import Header from './Header';
import { getLiveWeather } from '../weatherApi';
import { fetchHistoricalData } from '../services/historicalDataService';
import { useGlobalAlert } from '../services/globalAlertService';

// ─── unchanged helpers ────────────────────────────────────────────────────────
function formatForecastTime(time) {
  return new Date(time).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Calculate trend indicators from historical records ─────────────────────
function calculateTrends(records) {
  if (!records || records.length < 4) {
    return {
      temperature: null,
      rainfall: null,
      humidity: null,
      extremeWeather: null,
      dataSource: 'Insufficient Data',
    };
  }

  // Split records into older and newer halves to calculate trends
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(sorted.length / 2);
  const olderRecords = sorted.slice(0, half);
  const newerRecords = sorted.slice(-half);

  // Calculate average values for each period
  const avgOf = (group, key) => {
    const values = group.map(r => r[key]).filter(v => v != null && v !== undefined);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  };

  // Temperature trend
  const oldTemp = avgOf(olderRecords, 'temperature');
  const newTemp = avgOf(newerRecords, 'temperature');
  const tempTrend = newTemp > oldTemp + 0.5 ? 'Increasing' : newTemp < oldTemp - 0.5 ? 'Decreasing' : 'Stable';

  // Rainfall trend
  const oldRain = avgOf(olderRecords, 'rainfall');
  const newRain = avgOf(newerRecords, 'rainfall');
  const rainTrend = newRain > oldRain + 2 ? 'Increasing' : newRain < oldRain - 2 ? 'Decreasing' : 'Stable';

  // Humidity trend
  const oldHumid = avgOf(olderRecords, 'humidity');
  const newHumid = avgOf(newerRecords, 'humidity');
  const humidTrend = newHumid > oldHumid + 3 ? 'Increasing' : newHumid < oldHumid - 3 ? 'Decreasing' : 'Stable';

  // Extreme weather trend (based on severity count)
  const severityScore = (sev) => {
    const scores = { Severe: 4, High: 3, Moderate: 2, Low: 1 };
    return scores[sev] || 0;
  };
  const oldExtremeScore = olderRecords.reduce((s, r) => s + severityScore(r.severity), 0) / olderRecords.length;
  const newExtremeScore = newerRecords.reduce((s, r) => s + severityScore(r.severity), 0) / newerRecords.length;
  const extremeTrend = newExtremeScore > oldExtremeScore + 0.3 ? 'Increasing' : newExtremeScore < oldExtremeScore - 0.3 ? 'Decreasing' : 'Stable';

  return {
    temperature: { trend: tempTrend, oldAvg: oldTemp.toFixed(1), newAvg: newTemp.toFixed(1) },
    rainfall: { trend: rainTrend, oldAvg: oldRain.toFixed(1), newAvg: newRain.toFixed(1) },
    humidity: { trend: humidTrend, oldAvg: oldHumid.toFixed(1), newAvg: newHumid.toFixed(1) },
    extremeWeather: { trend: extremeTrend, oldScore: oldExtremeScore.toFixed(2), newScore: newExtremeScore.toFixed(2) },
    dataSource: 'Open-Meteo ERA5',
  };
}

// ─── Format trend indicator ──────────────────────────────────────────────────
function getTrendIndicator(trend) {
  if (!trend) return '—';
  if (trend === 'Increasing') return '↑ Increasing';
  if (trend === 'Decreasing') return '↓ Decreasing';
  if (trend === 'Stable') return '→ Stable';
  return '—';
}

// ─── Component ────────────────────────────────────────────────────────────────
function ForecastHistory({ onNavigate, activePage, currentLocation, savedLocation }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendData, setTrendData] = useState(null);
  const [trendError, setTrendError] = useState(null);

  const { cache } = useGlobalAlert();
  const activeLat = Number(cache?.latitude ?? currentLocation?.latitude ?? 20.2961);
  const activeLon = Number(cache?.longitude ?? currentLocation?.longitude ?? 85.8245);
  const activeCity = cache?.location?.city ?? cache?.locationName ?? currentLocation?.name ?? 'Bhubaneswar';

  // ── Data fetch — dynamic location-aware ───────────────────────────────────
  useEffect(() => {
    async function loadForecast() {
      try {
        const data = await getLiveWeather(activeLat, activeLon);
        setWeather(data);
      } catch (error) {
        console.error('Forecast error:', error);
      } finally {
        setLoading(false);
      }
    }
    loadForecast();
  }, [activeLat, activeLon]);

  // ── Fetch historical data for trends ──────────────────────────────────────
  useEffect(() => {
    async function loadHistoricalData() {
      try {
        const records = await fetchHistoricalData(activeLat, activeLon, activeCity);
        const trends = calculateTrends(records);
        setTrendData(trends);
      } catch (error) {
        console.error('Historical data fetch error:', error);
        setTrendError(error.message || 'Failed to fetch historical data');
        // Set empty trends on error (graceful degradation)
        setTrendData({
          temperature: null,
          rainfall: null,
          humidity: null,
          extremeWeather: null,
          dataSource: 'Unavailable',
        });
      } finally {
        setTrendsLoading(false);
      }
    }
    loadHistoricalData();
  }, [activeLat, activeLon, activeCity]);

  const hourly = weather?.hourly;
  const requiredHourlyFields = [
    hourly?.time,
    hourly?.temperature_2m,
    hourly?.precipitation_probability,
    hourly?.precipitation,
    hourly?.wind_speed_10m,
  ];
  const hasHourlyForecast = requiredHourlyFields.every(
    (field) => Array.isArray(field) && field.length > 0
  );

  const currentForecastIndex = hasHourlyForecast
    ? Math.max(hourly.time.findIndex((t) => t >= weather?.current?.time), 0)
    : 0;

  const upcomingForecast = hasHourlyForecast
    ? hourly.time
        .slice(currentForecastIndex, currentForecastIndex + 6)
        .map((time, index) => {
          const i = currentForecastIndex + index;
          return {
            time,
            temperature:     hourly.temperature_2m[i],
            rainProbability: hourly.precipitation_probability[i],
            rainfall:        hourly.precipitation[i],
            windSpeed:       hourly.wind_speed_10m[i],
          };
        })
        .filter((f) => Object.values(f).every((v) => v !== null && v !== undefined))
    : [];

  const summaryRainProbability = hourly?.precipitation_probability?.[0];
  const summaryRainfall        = hourly?.precipitation?.[0];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="skyra-page forecast-page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        currentLocation={currentLocation}
        savedLocation={savedLocation}
      />

      <div className="page-shell">
        {/* ── Page heading ── */}
        <section className="panel glass-panel forecast-heading-panel">
          <p className="eyebrow">WATCH SKYRA</p>
          <h2 style={{ margin: '4px 0 8px' }}>Forecast &amp; History</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Monitor upcoming weather conditions and forecast trends.
          </p>
        </section>

        {/* ── Summary stats row ── */}
        <section className="forecast-summary-grid">

          <article className="panel glass-panel forecast-stat-card">
            <p className="eyebrow">CURRENT TEMP</p>
            <strong className="forecast-stat-value">
              {loading ? '—' : `${weather?.current?.temperature_2m ?? '—'}°C`}
            </strong>
          </article>

          <article className="panel glass-panel forecast-stat-card">
            <p className="eyebrow">RAIN PROBABILITY</p>
            <strong className="forecast-stat-value">
              {loading
                ? '—'
                : summaryRainProbability == null
                  ? 'N/A'
                  : `${summaryRainProbability}%`}
            </strong>
          </article>

          <article className="panel glass-panel forecast-stat-card">
            <p className="eyebrow">EXPECTED RAINFALL</p>
            <strong className="forecast-stat-value">
              {loading
                ? '—'
                : summaryRainfall == null
                  ? 'N/A'
                  : `${summaryRainfall} mm`}
            </strong>
          </article>

          <article className="panel glass-panel forecast-stat-card">
            <p className="eyebrow">WIND SPEED</p>
            <strong className="forecast-stat-value">
              {loading ? '—' : `${weather?.current?.wind_speed_10m ?? '—'} km/h`}
            </strong>
          </article>

        </section>

        {/* ── Hourly forecast scroll panel ── */}
        <section className="panel glass-panel forecast-hourly-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">LIVE HOURLY FORECAST</p>
              <h3>Upcoming Conditions</h3>
            </div>
            <span className="status-meta">
              {loading ? 'Loading…' : 'Updated now'}
            </span>
          </div>

          {loading ? (
            <p className="empty-state">Fetching live forecast data…</p>
          ) : upcomingForecast.length === 0 ? (
            <p className="empty-state">
              Live hourly forecast data is not available right now.
            </p>
          ) : (
            /* Horizontally scrollable row of hour cards */
            <div className="forecast-hourly-scroll">
              {upcomingForecast.map((forecast) => (
                <article key={forecast.time} className="forecast-hour-card">
                  <p className="forecast-hour-time">
                    {formatForecastTime(forecast.time)}
                  </p>

                  <div className="forecast-hour-rows">
                    <div className="forecast-hour-row">
                      <span>🌡️</span>
                      <span>{forecast.temperature}°C</span>
                    </div>
                    <div className="forecast-hour-row">
                      <span>🌧️</span>
                      <span>{forecast.rainProbability}%</span>
                    </div>
                    <div className="forecast-hour-row">
                      <span>💧</span>
                      <span>{forecast.rainfall} mm</span>
                    </div>
                    <div className="forecast-hour-row">
                      <span>💨</span>
                      <span>{forecast.windSpeed} km/h</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Climate Trend / Historical Pattern Section ── */}
        <section className="panel glass-panel forecast-climate-trends">
          <div className="panel-header">
            <div>
              <p className="eyebrow">CLIMATE TRENDS</p>
              <h3>Historical Pattern Analysis</h3>
            </div>
            {trendData && (
              <span className="status-meta">
                {trendData.dataSource}
              </span>
            )}
          </div>

          {trendsLoading ? (
            <p className="empty-state">Analyzing historical data…</p>
          ) : trendData?.dataSource === 'Insufficient Data' ? (
            <p className="empty-state">
              Insufficient historical data to calculate trends.
            </p>
          ) : trendData?.dataSource === 'Unavailable' ? (
            <p className="empty-state">
              {trendError || 'Historical data is not available right now.'}
            </p>
          ) : (
            <div className="trend-metrics-grid">
              {/* Temperature Trend */}
              <article className="trend-card">
                <p className="trend-label">Temperature Trend</p>
                <p className="trend-indicator">
                  {trendData?.temperature ? getTrendIndicator(trendData.temperature.trend) : '—'}
                </p>
                {trendData?.temperature && (
                  <p className="trend-detail">
                    {trendData.temperature.oldAvg}°C → {trendData.temperature.newAvg}°C
                  </p>
                )}
              </article>

              {/* Rainfall Trend */}
              <article className="trend-card">
                <p className="trend-label">Rainfall Trend</p>
                <p className="trend-indicator">
                  {trendData?.rainfall ? getTrendIndicator(trendData.rainfall.trend) : '—'}
                </p>
                {trendData?.rainfall && (
                  <p className="trend-detail">
                    {trendData.rainfall.oldAvg} mm → {trendData.rainfall.newAvg} mm
                  </p>
                )}
              </article>

              {/* Humidity Trend */}
              <article className="trend-card">
                <p className="trend-label">Humidity Trend</p>
                <p className="trend-indicator">
                  {trendData?.humidity ? getTrendIndicator(trendData.humidity.trend) : '—'}
                </p>
                {trendData?.humidity && (
                  <p className="trend-detail">
                    {trendData.humidity.oldAvg}% → {trendData.humidity.newAvg}%
                  </p>
                )}
              </article>

              {/* Extreme Weather Trend */}
              <article className="trend-card">
                <p className="trend-label">Extreme Weather Trend</p>
                <p className="trend-indicator">
                  {trendData?.extremeWeather ? getTrendIndicator(trendData.extremeWeather.trend) : '—'}
                </p>
                {trendData?.extremeWeather && (
                  <p className="trend-detail">
                    Severity: {trendData.extremeWeather.oldScore} → {trendData.extremeWeather.newScore}
                  </p>
                )}
              </article>
            </div>
          )}

          <p style={{ margin: '16px 0 0', color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>Data source:</strong> Trends are calculated from historical weather observations (2012–2023) 
            and represent patterns in recorded data. They distinguish between historical observations and current forecasts.
          </p>
        </section>

        {/* ── Historical note card ── */}
        <section className="panel glass-panel forecast-note-panel">
          <div className="panel-header slim">
            <div>
              <p className="eyebrow">DATA NOTE</p>
              <h3>About this forecast</h3>
            </div>
          </div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.87rem', lineHeight: 1.65 }}>
            Hourly forecast data is sourced from{' '}
            <strong style={{ color: 'var(--text)' }}>Open-Meteo</strong> using
            the current GPS location. Forecasts are refreshed each time this
            page is loaded. Historical climate trends are calculated from
            open-access ERA5 reanalysis data spanning 2012–2023.
          </p>
        </section>
      </div>
    </main>
  );
}

export default ForecastHistory;
