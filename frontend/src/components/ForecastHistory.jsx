import { useEffect, useState, useCallback, useMemo } from 'react';
import Header from './Header';
import { fetchFullForecast, getWeatherIcon } from '../weatherApi';
import { fetchHistoricalData } from '../services/historicalDataService';
import { useGlobalAlert } from '../services/globalAlertService';
import { reverseGeocode } from '../services/locationService';

// ─── Location Name Helpers ───────────────────────────────────────────────────
function isGenericOrCoordinateString(str) {
  if (!str || typeof str !== 'string') return true;
  const lower = str.trim().toLowerCase();
  if (
    lower === 'current location' ||
    lower === 'active location' ||
    lower === 'location unavailable' ||
    lower === 'detecting current location…' ||
    lower === 'detecting current location...' ||
    lower === 'your location' ||
    lower.startsWith('lat ') ||
    lower.startsWith('latitude') ||
    /^[-+]?\d+(\.\d+)?°?\s*[nsew]?[,\s]+[-+]?\d+(\.\d+)?°?\s*[nsew]?/i.test(lower)
  ) {
    return true;
  }
  return false;
}

function formatHumanReadableLocation(locObj) {
  if (!locObj) return null;
  if (typeof locObj === 'string') {
    const s = locObj.trim();
    if (!s || isGenericOrCoordinateString(s)) return null;
    return s;
  }
  // Priority: City/town/locality, State/region, Country
  const city = locObj.city || locObj.town || locObj.village || locObj.municipality || locObj.locality || locObj.district || null;
  const region = locObj.region || locObj.state || null;
  const country = locObj.country || null;
  const parts = [city, region, country].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  if (locObj.displayName && !isGenericOrCoordinateString(locObj.displayName)) {
    return locObj.displayName;
  }
  return null;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
function formatDayLabel(dateStr, index) {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  if (!dateStr) return 'Day ' + (index + 1);
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr, index) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const formatted = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return index === 0 ? `Today (${formatted})` : index === 1 ? `Tomorrow (${formatted})` : formatted;
}

function formatHourTime(timeStr) {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCoordinates(lat, lon) {
  if (lat == null || lon == null) return '';
  const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
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

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(sorted.length / 2);
  const olderRecords = sorted.slice(0, half);
  const newerRecords = sorted.slice(-half);

  const avgOf = (group, key) => {
    const values = group.map(r => r[key]).filter(v => v != null && v !== undefined);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  };

  const oldTemp = avgOf(olderRecords, 'temperature');
  const newTemp = avgOf(newerRecords, 'temperature');
  const tempTrend = newTemp > oldTemp + 0.5 ? 'Increasing' : newTemp < oldTemp - 0.5 ? 'Decreasing' : 'Stable';

  const oldRain = avgOf(olderRecords, 'rainfall');
  const newRain = avgOf(newerRecords, 'rainfall');
  const rainTrend = newRain > oldRain + 2 ? 'Increasing' : newRain < oldRain - 2 ? 'Decreasing' : 'Stable';

  const oldHumid = avgOf(olderRecords, 'humidity');
  const newHumid = avgOf(newerRecords, 'humidity');
  const humidTrend = newHumid > oldHumid + 3 ? 'Increasing' : newHumid < oldHumid - 3 ? 'Decreasing' : 'Stable';

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
    dataSource: 'Open-Meteo ERA5 (2012–2023)',
  };
}

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
  const [forecastError, setForecastError] = useState(null);
  const [lastFetchedTime, setLastFetchedTime] = useState(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [geocodedPlaceName, setGeocodedPlaceName] = useState(null);

  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendData, setTrendData] = useState(null);
  const [trendError, setTrendError] = useState(null);

  const { cache } = useGlobalAlert();

  // Resolve dynamic coordinates strictly from location state — zero hardcoded cities
  const hasValidCoords =
    (typeof cache?.latitude === 'number' && typeof cache?.longitude === 'number' && Number.isFinite(cache.latitude) && Number.isFinite(cache.longitude)) ||
    (typeof currentLocation?.latitude === 'number' && typeof currentLocation?.longitude === 'number' && Number.isFinite(currentLocation.latitude) && Number.isFinite(currentLocation.longitude));

  const activeLat = hasValidCoords
    ? Number(typeof cache?.latitude === 'number' ? cache.latitude : currentLocation?.latitude)
    : null;

  const activeLon = hasValidCoords
    ? Number(typeof cache?.longitude === 'number' ? cache.longitude : currentLocation?.longitude)
    : null;

  // ── Resolve Human-Readable Location (City, State/Region, Country) ─────────
  useEffect(() => {
    let cancelled = false;

    async function resolvePlaceName() {
      if (!hasValidCoords || activeLat === null || activeLon === null) {
        setGeocodedPlaceName(null);
        return;
      }

      // 1. First check if a structured, non-generic location object or searched city name already exists
      const fromCacheObj = formatHumanReadableLocation(cache?.location);
      if (fromCacheObj) {
        setGeocodedPlaceName(fromCacheObj);
        return;
      }

      const fromCacheName = formatHumanReadableLocation(cache?.locationName);
      if (fromCacheName) {
        setGeocodedPlaceName(fromCacheName);
        return;
      }

      const fromCurrentLoc = formatHumanReadableLocation(currentLocation?.name);
      if (fromCurrentLoc) {
        setGeocodedPlaceName(fromCurrentLoc);
        return;
      }

      // 2. If existing state has only generic/coordinate label, resolve via Nominatim reverse-geocoding
      try {
        const geoResult = await reverseGeocode(activeLat, activeLon);
        if (!cancelled && geoResult) {
          const parts = [geoResult.city, geoResult.region, geoResult.country].filter(Boolean);
          const resolved = parts.length > 0
            ? parts.join(', ')
            : geoResult.displayName && !isGenericOrCoordinateString(geoResult.displayName)
            ? geoResult.displayName
            : null;

          if (resolved) {
            setGeocodedPlaceName(resolved);
          }
        }
      } catch (e) {
        console.warn('[SKYRA Forecast] Reverse-geocoding notice:', e.message);
      }
    }

    resolvePlaceName();
    return () => {
      cancelled = true;
    };
  }, [hasValidCoords, activeLat, activeLon, cache?.location, cache?.locationName, currentLocation?.name]);

  // Derived human-readable location display name with priority fallback
  const displayLocationName = useMemo(() => {
    if (!hasValidCoords) return 'Location Unavailable';

    // Priority 1: Resolved reverse-geocoded place name (City, Region, Country)
    if (geocodedPlaceName && !isGenericOrCoordinateString(geocodedPlaceName)) {
      return geocodedPlaceName;
    }

    // Priority 2: Structured cache.location
    if (cache?.location) {
      const fromObj = formatHumanReadableLocation(cache.location);
      if (fromObj) return fromObj;
    }

    // Priority 3: cache.locationName
    if (cache?.locationName && !isGenericOrCoordinateString(cache.locationName)) {
      return cache.locationName;
    }

    // Priority 4: currentLocation.name
    if (currentLocation?.name && !isGenericOrCoordinateString(currentLocation.name)) {
      return currentLocation.name;
    }

    // Fallback: Safe human-readable label
    return 'Current Location';
  }, [hasValidCoords, geocodedPlaceName, cache?.location, cache?.locationName, currentLocation?.name]);

  // ── Load live 7-day forecast ───────────────────────────────────────────────
  const loadForecast = useCallback(async () => {
    if (activeLat === null || activeLon === null) {
      setWeather(null);
      setLoading(false);
      setForecastError(null);
      return;
    }

    setLoading(true);
    setForecastError(null);

    try {
      const data = await fetchFullForecast(activeLat, activeLon, displayLocationName);
      setWeather(data);
      setLastFetchedTime(new Date());
    } catch (err) {
      console.error('SKYRA Forecast load error:', err);
      setForecastError(err.message || 'Failed to load live forecast. Please try again.');
      setWeather(null);
    } finally {
      setLoading(false);
    }
  }, [activeLat, activeLon, displayLocationName]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  // ── Load historical climate trends ────────────────────────────────────────
  const loadHistorical = useCallback(async () => {
    if (activeLat === null || activeLon === null) {
      setTrendData(null);
      setTrendsLoading(false);
      setTrendError(null);
      return;
    }

    setTrendsLoading(true);
    setTrendError(null);

    try {
      const records = await fetchHistoricalData(activeLat, activeLon, displayLocationName);
      const trends = calculateTrends(records);
      setTrendData(trends);
    } catch (err) {
      console.error('SKYRA Historical data error:', err);
      setTrendError(err.message || 'Failed to fetch historical observations.');
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
  }, [activeLat, activeLon, displayLocationName]);

  useEffect(() => {
    loadHistorical();
  }, [loadHistorical]);

  // ── 7-Day daily forecast list ─────────────────────────────────────────────
  const dailyForecast = useMemo(() => {
    return Array.isArray(weather?.forecast?.daily) ? weather.forecast.daily : [];
  }, [weather]);

  // Reset selected day index if daily list length changes
  useEffect(() => {
    if (selectedDayIndex >= dailyForecast.length) {
      setSelectedDayIndex(0);
    }
  }, [dailyForecast.length, selectedDayIndex]);

  const selectedDay = dailyForecast[selectedDayIndex] || dailyForecast[0] || null;

  // ── Hourly forecast for selected day ──────────────────────────────────────
  const hourlyForSelectedDay = useMemo(() => {
    if (!weather?.forecast?.hourly || !selectedDay?.date) return [];
    const datePrefix = selectedDay.date;
    const allHours = weather.forecast.hourly;

    const matchedHours = allHours.filter(
      (h) => h.time && String(h.time).startsWith(datePrefix)
    );

    if (matchedHours.length > 0) {
      return matchedHours;
    }

    // Fallback to 24h slice if date prefix mismatch
    const startIndex = selectedDayIndex * 24;
    return allHours.slice(startIndex, startIndex + 24);
  }, [weather, selectedDay, selectedDayIndex]);

  const currentHourIso = useMemo(() => {
    if (!weather?.current?.observedAt) return null;
    return String(weather.current.observedAt).slice(0, 13);
  }, [weather]);

  // ── Risk & Intelligence context ───────────────────────────────────────────
  const riskInfo = useMemo(() => {
    if (!cache) return null;
    const riskLevel = cache.riskLevel || (cache.riskScore >= 70 ? 'High' : cache.riskScore >= 40 ? 'Moderate' : 'Low');
    return {
      riskLevel,
      riskScore: cache.riskScore != null ? Number(cache.riskScore) : null,
      confidence: cache.confidence != null ? Number(cache.confidence) : null,
      explanation: cache.xai?.whyThisRisk || cache.reason || '',
      impactCategory: cache.impactAssessment?.impactCategory || cache.impactAssessment?.hazard || 'Weather Outlook',
      consequences: cache.impactAssessment?.potentialConsequences || [],
      activeAlert: cache.alerts?.activeAlert || null,
    };
  }, [cache]);

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
        {/* ── Page Header / Location & Freshness Banner ── */}
        <section className="panel glass-panel forecast-heading-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p className="eyebrow">LOCATION-AWARE WEATHER INTELLIGENCE</p>
              <h2 style={{ margin: '4px 0 8px', fontSize: '1.8rem' }}>7-Day Meteorological Forecast</h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <strong style={{ color: 'var(--text, #f8fafc)', fontWeight: 600, fontSize: '1rem' }}>
                  {displayLocationName}
                </strong>
                {hasValidCoords && (
                  <span style={{ opacity: 0.75, fontSize: '0.85rem' }}>
                    ({formatCoordinates(activeLat, activeLon)})
                  </span>
                )}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              {lastFetchedTime && (
                <span className="status-meta" style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                  Updated {lastFetchedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                type="button"
                className="mini-action"
                onClick={loadForecast}
                disabled={loading || !hasValidCoords}
                title="Refresh live forecast"
                style={{ cursor: loading || !hasValidCoords ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Location Unavailable Message (No GPS / No City) ── */}
        {!hasValidCoords && (
          <section className="panel glass-panel" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>📍</span>
            <h3 style={{ margin: '0 0 0.5rem' }}>Location Not Specified</h3>
            <p style={{ color: 'var(--muted)', maxWidth: '540px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
              Please enable device location permissions or search for any city in the search bar above to view real-time location-aware 7-day weather forecasts.
            </p>
          </section>
        )}

        {/* ── Error State with Retry Button ── */}
        {hasValidCoords && forecastError && (
          <section className="panel glass-panel" style={{ border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong style={{ color: '#fca5a5', display: 'block', marginBottom: '4px' }}>⚠️ Forecast Fetch Error</strong>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>{forecastError}</p>
              </div>
              <button
                type="button"
                className="primary-submit"
                onClick={loadForecast}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                ↻ Retry Forecast
              </button>
            </div>
          </section>
        )}

        {/* ── Live Conditions Overview ── */}
        {hasValidCoords && !forecastError && (
          <section className="forecast-summary-grid">
            <article className="panel glass-panel forecast-stat-card">
              <p className="eyebrow">CURRENT TEMPERATURE</p>
              <strong className="forecast-stat-value">
                {loading ? '—' : `${Math.round(weather?.current?.temperature ?? 0)}°C`}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                {loading ? '…' : `Feels like ${Math.round(weather?.current?.feelsLike ?? weather?.current?.temperature ?? 0)}°C`}
              </span>
            </article>

            <article className="panel glass-panel forecast-stat-card">
              <p className="eyebrow">RAIN PROBABILITY (TODAY)</p>
              <strong className="forecast-stat-value">
                {loading ? '—' : `${dailyForecast[0]?.maxRainProbability ?? weather?.forecast?.maxRainProbability ?? 0}%`}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                {loading ? '…' : `1-hr past rate: ${weather?.current?.rainfall ?? 0} mm/h`}
              </span>
            </article>

            <article className="panel glass-panel forecast-stat-card">
              <p className="eyebrow">EXPECTED RAINFALL (24H TOTAL)</p>
              <strong className="forecast-stat-value">
                {loading ? '—' : `${(dailyForecast[0]?.rainSum ?? weather?.forecast?.precipitationExpected24h ?? weather?.forecast?.precipitationExpected ?? 0).toFixed(1)} mm`}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                {loading ? '…' : `24h daily sum • ${dailyForecast[0]?.condition || weather?.current?.condition || 'Normal'}`}
              </span>
            </article>

            <article className="panel glass-panel forecast-stat-card">
              <p className="eyebrow">WIND &amp; HUMIDITY</p>
              <strong className="forecast-stat-value">
                {loading ? '—' : `${Math.round(weather?.current?.windSpeed ?? 0)} km/h`}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                {loading ? '…' : `Relative Humidity: ${Math.round(weather?.current?.humidity ?? 0)}%`}
              </span>
            </article>
          </section>
        )}

        {/* ── 7-Day Forecast Grid (Requirement 3) ── */}
        {hasValidCoords && !forecastError && (
          <section className="panel glass-panel forecast-7day-panel" style={{ padding: '1.5rem' }}>
            <div className="panel-header" style={{ marginBottom: '1.2rem' }}>
              <div>
                <p className="eyebrow">NWP MULTI-DAY MODEL</p>
                <h3 style={{ margin: '2px 0 4px', fontSize: '1.3rem' }}>7-Day Outlook</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Click on any day below to inspect its detailed 24-hour breakdown
                </span>
              </div>
              <span className="status-meta">
                {weather?.provenance?.provider || 'Open-Meteo'} • 7 Days
              </span>
            </div>

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.75rem' }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="panel glass-panel" style={{ padding: '1.2rem 0.8rem', textAlign: 'center', opacity: 0.6 }}>
                    <div style={{ height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '8px' }} />
                    <div style={{ height: '28px', background: 'rgba(255,255,255,0.15)', borderRadius: '6px', marginBottom: '8px' }} />
                    <div style={{ height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }} />
                  </div>
                ))}
              </div>
            ) : dailyForecast.length === 0 ? (
              <p className="empty-state">7-day forecast data is currently unavailable for this coordinate.</p>
            ) : (
              <div
                className="forecast-7day-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {dailyForecast.map((day, idx) => {
                  const isSelected = idx === selectedDayIndex;
                  const dayIcon = getWeatherIcon(day.weatherCode);

                  return (
                    <button
                      key={day.date || idx}
                      type="button"
                      onClick={() => setSelectedDayIndex(idx)}
                      style={{
                        background: isSelected
                          ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.22), rgba(14, 116, 144, 0.32))'
                          : 'rgba(15, 23, 42, 0.65)',
                        border: isSelected
                          ? '2px solid var(--accent, #38bdf8)'
                          : '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '14px',
                        padding: '1rem 0.75rem',
                        textAlign: 'center',
                        color: 'inherit',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        boxShadow: isSelected ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none',
                        position: 'relative',
                      }}
                      aria-label={`Select forecast for ${formatDayLabel(day.date, idx)}`}
                      aria-pressed={isSelected}
                    >
                      {/* Day Label & Date */}
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.95rem', color: isSelected ? '#38bdf8' : '#f1f5f9' }}>
                          {formatDayLabel(day.date, idx)}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                          {day.date ? day.date.slice(5) : ''}
                        </span>
                      </div>

                      {/* Icon & Condition */}
                      <div style={{ margin: '4px 0' }}>
                        <span style={{ fontSize: '1.8rem', display: 'block' }} role="img" aria-label={day.condition}>
                          {dayIcon}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'block', marginTop: '4px', lineHeight: 1.25 }}>
                          {day.condition}
                        </span>
                      </div>

                      {/* Temperatures */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '6px' }}>
                        <strong style={{ fontSize: '1.1rem', color: '#f8fafc' }}>
                          {Math.round(day.tempMax)}°
                        </strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                          {Math.round(day.tempMin)}°
                        </span>
                      </div>

                      {/* Precipitation & Wind stats */}
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span>🌧️ Rain:</span>
                          <strong style={{ color: day.maxRainProbability > 50 ? '#38bdf8' : 'inherit' }}>
                            {day.maxRainProbability}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span>💧 Total:</span>
                          <strong>{day.rainSum.toFixed(1)} mm</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span>💨 Wind:</span>
                          <strong>{Math.round(day.maxWindSpeed)} km/h</strong>
                        </div>
                        {day.humidity != null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>💧 Hum:</span>
                            <strong>{day.humidity}%</strong>
                          </div>
                        )}
                      </div>

                      {isSelected && (
                        <div style={{
                          marginTop: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#38bdf8',
                        }}>
                          ● Active Day
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Hourly Forecast for Selected Day (Requirement 4) ── */}
        {hasValidCoords && !forecastError && selectedDay && (
          <section className="panel glass-panel forecast-hourly-panel" style={{ padding: '1.5rem' }}>
            <div className="panel-header" style={{ marginBottom: '1rem' }}>
              <div>
                <p className="eyebrow">HOURLY BREAKDOWN</p>
                <h3 style={{ margin: '2px 0 4px', fontSize: '1.3rem' }}>
                  {formatDateFull(selectedDay.date, selectedDayIndex)}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Detailed hourly progression for temperature, rain probability, precipitation, and wind speed
                </span>
              </div>
              <span className="status-meta">
                {hourlyForSelectedDay.length} Hours Available
              </span>
            </div>

            {loading ? (
              <p className="empty-state">Loading hourly forecast…</p>
            ) : hourlyForSelectedDay.length === 0 ? (
              <p className="empty-state">Hourly forecast is not available for the selected day.</p>
            ) : (
              <div
                className="forecast-hourly-scroll"
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  overflowX: 'auto',
                  paddingBottom: '0.75rem',
                  scrollSnapType: 'x mandatory',
                }}
              >
                {hourlyForSelectedDay.map((hour, hIdx) => {
                  const hourIcon = getWeatherIcon(hour.weatherCode);
                  const isCurrentHour = selectedDayIndex === 0 && currentHourIso && String(hour.time).startsWith(currentHourIso);

                  return (
                    <article
                      key={hour.time || hIdx}
                      className="forecast-hour-card"
                      style={{
                        minWidth: '130px',
                        flex: '0 0 auto',
                        background: isCurrentHour
                          ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.2), rgba(15, 23, 42, 0.8))'
                          : 'rgba(15, 23, 42, 0.65)',
                        border: isCurrentHour
                          ? '2px solid #38bdf8'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '0.85rem 0.75rem',
                        textAlign: 'center',
                        scrollSnapAlign: 'start',
                      }}
                    >
                      <p className="forecast-hour-time" style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '0.85rem', color: isCurrentHour ? '#38bdf8' : '#e2e8f0' }}>
                        {formatHourTime(hour.time)}
                        {isCurrentHour && <span style={{ display: 'block', fontSize: '0.65rem', color: '#38bdf8' }}>NOW</span>}
                      </p>

                      <div style={{ margin: '6px 0' }}>
                        <span style={{ fontSize: '1.5rem', display: 'block' }}>{hourIcon}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {hour.condition}
                        </span>
                      </div>

                      <strong style={{ fontSize: '1.15rem', display: 'block', margin: '4px 0', color: '#f8fafc' }}>
                        {Math.round(hour.temperature)}°C
                      </strong>

                      <div className="forecast-hour-rows" style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'grid', gap: '3px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🌧️ Prob:</span>
                          <strong style={{ color: hour.rainProbability > 50 ? '#38bdf8' : 'inherit' }}>
                            {hour.rainProbability}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>💧 Rain:</span>
                          <strong>{Number(hour.precipitation).toFixed(1)} mm</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>💨 Wind:</span>
                          <strong>{Math.round(hour.windSpeed)} km/h</strong>
                        </div>
                        {hour.humidity != null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>💧 Hum:</span>
                            <strong>{Math.round(hour.humidity)}%</strong>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── SKYRA Operational Intelligence & Risk Context (Requirements 9 & 10) ── */}
        {hasValidCoords && (
          <section className="panel glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent, #38bdf8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.8rem' }}>
              <div>
                <p className="eyebrow">SKYRA OPERATIONAL RISK INTELLIGENCE</p>
                <h3 style={{ margin: '2px 0', fontSize: '1.2rem' }}>Forecast Risk Assessment</h3>
              </div>

              {riskInfo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    className={`chat-risk-badge badge-${riskInfo.riskLevel.toLowerCase()}`}
                    style={{ padding: '4px 12px', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    {riskInfo.riskLevel.toUpperCase()} RISK {riskInfo.riskScore != null ? `(${riskInfo.riskScore}/100)` : ''}
                  </span>
                  {riskInfo.confidence != null && (
                    <span className="status-meta" style={{ fontSize: '0.75rem' }}>
                      Confidence: {riskInfo.confidence}%
                    </span>
                  )}
                </div>
              )}
            </div>

            <p style={{ margin: '0 0 1rem', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {riskInfo?.explanation ||
                `Based on high-resolution NWP forecasts for ${displayLocationName}, conditions are being continuously evaluated by the canonical SKYRA ML risk engine and terrain susceptibility models.`}
            </p>

            {riskInfo?.activeAlert && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  color: '#fecaca',
                }}
              >
                <strong>🚨 Active Hazard Warning:</strong> {riskInfo.activeAlert.headline || riskInfo.activeAlert.description || 'Severe weather alert in effect.'}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onNavigate && onNavigate('Dashboard')}
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                View Live Risk Map &amp; Full Assessment →
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onNavigate && onNavigate('WeatherGPT')}
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                Ask WeatherGPT About Forecast →
              </button>
            </div>
          </section>
        )}

        {/* ── Climate Trend / Historical Pattern Section (Preserved) ── */}
        {hasValidCoords && (
          <section className="panel glass-panel forecast-climate-trends" style={{ padding: '1.5rem' }}>
            <div className="panel-header" style={{ marginBottom: '1.2rem' }}>
              <div>
                <p className="eyebrow">CLIMATE TRENDS</p>
                <h3 style={{ margin: '2px 0 4px', fontSize: '1.3rem' }}>Historical Pattern Analysis</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  10-year ERA5 climate reanalysis baseline (2012–2023) for {displayLocationName}
                </span>
              </div>
              {trendData && (
                <span className="status-meta">
                  {trendData.dataSource}
                </span>
              )}
            </div>

            {trendsLoading ? (
              <p className="empty-state">Analyzing historical observations…</p>
            ) : trendData?.dataSource === 'Insufficient Data' ? (
              <p className="empty-state">
                Insufficient historical data available to calculate multi-year climate trends for this coordinate.
              </p>
            ) : trendData?.dataSource === 'Unavailable' ? (
              <p className="empty-state">
                {trendError || 'Historical climate data is currently unavailable.'}
              </p>
            ) : (
              <div className="trend-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                {/* Temperature Trend */}
                <article className="trend-card panel glass-panel" style={{ padding: '1rem' }}>
                  <p className="trend-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px' }}>Temperature Trend</p>
                  <p className="trend-indicator" style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 4px', color: '#f8fafc' }}>
                    {trendData?.temperature ? getTrendIndicator(trendData.temperature.trend) : '—'}
                  </p>
                  {trendData?.temperature && (
                    <p className="trend-detail" style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
                      Baseline: {trendData.temperature.oldAvg}°C → Recent: {trendData.temperature.newAvg}°C
                    </p>
                  )}
                </article>

                {/* Rainfall Trend */}
                <article className="trend-card panel glass-panel" style={{ padding: '1rem' }}>
                  <p className="trend-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px' }}>Rainfall Trend</p>
                  <p className="trend-indicator" style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 4px', color: '#f8fafc' }}>
                    {trendData?.rainfall ? getTrendIndicator(trendData.rainfall.trend) : '—'}
                  </p>
                  {trendData?.rainfall && (
                    <p className="trend-detail" style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
                      Baseline: {trendData.rainfall.oldAvg} mm → Recent: {trendData.rainfall.newAvg} mm
                    </p>
                  )}
                </article>

                {/* Humidity Trend */}
                <article className="trend-card panel glass-panel" style={{ padding: '1rem' }}>
                  <p className="trend-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px' }}>Humidity Trend</p>
                  <p className="trend-indicator" style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 4px', color: '#f8fafc' }}>
                    {trendData?.humidity ? getTrendIndicator(trendData.humidity.trend) : '—'}
                  </p>
                  {trendData?.humidity && (
                    <p className="trend-detail" style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
                      Baseline: {trendData.humidity.oldAvg}% → Recent: {trendData.humidity.newAvg}%
                    </p>
                  )}
                </article>

                {/* Extreme Weather Trend */}
                <article className="trend-card panel glass-panel" style={{ padding: '1rem' }}>
                  <p className="trend-label" style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px' }}>Extreme Weather Index</p>
                  <p className="trend-indicator" style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 4px', color: '#f8fafc' }}>
                    {trendData?.extremeWeather ? getTrendIndicator(trendData.extremeWeather.trend) : '—'}
                  </p>
                  {trendData?.extremeWeather && (
                    <p className="trend-detail" style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
                      Severity Index: {trendData.extremeWeather.oldScore} → {trendData.extremeWeather.newScore}
                    </p>
                  )}
                </article>
              </div>
            )}
          </section>
        )}

        {/* ── Forecast Metadata & Provenance (Requirement 5) ── */}
        <section className="panel glass-panel forecast-note-panel" style={{ padding: '1.2rem 1.5rem' }}>
          <div className="panel-header slim" style={{ marginBottom: '8px' }}>
            <div>
              <p className="eyebrow">METEOROLOGICAL PROVENANCE</p>
              <h4 style={{ margin: 0, fontSize: '1rem' }}>Data Integrity &amp; Model Specifications</h4>
            </div>
          </div>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
            Live 7-day and hourly weather forecasts are ingested from{' '}
            <strong style={{ color: 'var(--text)' }}>Open-Meteo High-Resolution NWP (Best-Match Model)</strong> using exact coordinate telemetry for{' '}
            <strong style={{ color: 'var(--text)' }}>{displayLocationName}</strong>{' '}
            {hasValidCoords && `(${formatCoordinates(activeLat, activeLon)})`}. Historical climate trends are computed from verified ERA5 reanalysis observations spanning 2012–2023. Risk evaluations are derived strictly from the canonical SKYRA machine learning pipeline.
          </p>
        </section>
      </div>
    </main>
  );
}

export default ForecastHistory;
