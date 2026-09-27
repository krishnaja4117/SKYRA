/**
 * SKYRA – Frontend Intelligence Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean API service client for fetching canonical intelligence and managing
 * monitored locations/alerts via backend API endpoints.
 *
 * Primary Endpoints:
 *   GET /api/intelligence?lat={lat}&lon={lon}&locationName={name}
 *   POST /api/alerts/monitor
 *   GET /api/alerts
 *
 * Guarantees:
 *   • Sends exact user selected/validated coordinates and location name.
 *   • Parses response into standard SkyraIntelligenceResult data contract.
 *   • Never fabricates risk scores, confidence, or artificial feature inputs.
 *   • Preserves backend provenance and fallback status.
 */

import { normalizeIntelligenceResult } from "./dataContract";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

/**
 * Fetches unified intelligence payload from backend GET /api/intelligence.
 *
 * @param {Object} params
 * @param {number} params.latitude - Geographic latitude
 * @param {number} params.longitude - Geographic longitude
 * @param {string} [params.locationName] - Optional display name of location
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<Object>} Normalized canonical SkyraIntelligenceResult
 */
export async function fetchSkyraIntelligence({ latitude, longitude, locationName = "", signal } = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (latitude == null || longitude == null || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("Valid geographic coordinates (latitude and longitude) are required.");
  }

  const url = new URL(`${API_BASE_URL}/api/intelligence`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));

  if (locationName && String(locationName).trim()) {
    url.searchParams.set("locationName", String(locationName).trim());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
    signal: signal || AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `Backend intelligence request failed with status ${response.status}.`;
    const err = new Error(errorMessage);
    err.status = response.status;
    err.sourceStatus = errorData.sourceStatus || "http_error";
    throw err;
  }

  const rawData = await response.json();
  return normalizeIntelligenceResult(rawData);
}

/**
 * Updates backend monitored location with explicit user consent status.
 */
export async function updateMonitoredLocation({ latitude, longitude, locationName = "", consent = true } = {}) {
  const url = `${API_BASE_URL}/api/alerts/monitor`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      latitude,
      longitude,
      locationName,
      consent,
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to update backend monitored location (${response.status})`);
  }

  return await response.json();
}

/**
 * Fetches active alerts and history from backend GET /api/alerts.
 */
export async function fetchBackendAlerts({ locationName = "" } = {}) {
  const url = new URL(`${API_BASE_URL}/api/alerts`);
  if (locationName) {
    url.searchParams.set("location", String(locationName));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch backend alerts (${response.status})`);
  }

  return await response.json();
}

/**
 * Acknowledges an active backend alert by ID.
 */
export async function acknowledgeBackendAlert({ id, acknowledgedBy = "User" } = {}) {
  if (!id) throw new Error("Alert ID is required for acknowledgement.");
  const url = `${API_BASE_URL}/api/alerts/${encodeURIComponent(id)}/acknowledge`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ acknowledgedBy }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to acknowledge alert (${response.status})`);
  }

  return await response.json();
}

/**
 * Resolves an active backend alert by ID.
 */
export async function resolveBackendAlert({ id, resolvedBy = "User", reason = "Manual resolution" } = {}) {
  if (!id) throw new Error("Alert ID is required for resolution.");
  const url = `${API_BASE_URL}/api/alerts/${encodeURIComponent(id)}/resolve`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ resolvedBy, reason }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to resolve alert (${response.status})`);
  }

  return await response.json();
}
