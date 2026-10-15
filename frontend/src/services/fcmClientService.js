/**
 * SKYRA – Client Push & FCM Registration Service (Phase 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages device registration, location subscriptions, and background disaster
 * notification permissions with the backend notification engine.
 */

const BACKEND_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
const STORAGE_KEY_TOKEN = "skyra_device_push_token";
const STORAGE_KEY_REGISTERED = "skyra_device_registered_at";

/**
 * Generates or retrieves a persistent client-side device identifier
 * when Web Push / FCM token is not yet issued by browser/Firebase.
 */
export function getOrCreateClientDeviceId() {
  if (typeof window === "undefined") return "server_placeholder";
  let token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token) {
    token = `web_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
  }
  return token;
}

/**
 * Registers this device with the backend for targeted disaster notifications.
 */
export async function registerDeviceForAlerts({
  location = null,
  radiusKm = 35,
  token = null,
}) {
  const activeToken = token || getOrCreateClientDeviceId();
  const payload = {
    token: activeToken,
    platform: typeof navigator !== "undefined" && /android/i.test(navigator.userAgent) ? "android" : "web",
    location: location && location.latitude != null && location.longitude != null
      ? {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          name: location.name || location.displayName || "Monitored Location",
        }
      : null,
    radiusKm: Number(radiusKm) || 35,
    tags: ["all_emergencies", "flash_flood", "landslide", "cyclone"],
  };

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/notifications/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Registration failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    localStorage.setItem(STORAGE_KEY_REGISTERED, new Date().toISOString());
    return {
      success: true,
      token: activeToken,
      data,
    };
  } catch (err) {
    console.warn("[SKYRA Push] Failed to register device token with backend:", err.message);
    return {
      success: false,
      token: activeToken,
      error: err.message,
    };
  }
}

/**
 * Unregisters this device from background push notifications.
 */
export async function unregisterDeviceFromAlerts() {
  const activeToken = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (!activeToken) return { success: true };

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/notifications/unregister`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: activeToken }),
    });

    localStorage.removeItem(STORAGE_KEY_REGISTERED);
    return await res.json();
  } catch (err) {
    console.warn("[SKYRA Push] Failed to unregister device token:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetches server-side FCM configuration and registration status.
 */
export async function fetchServerNotificationStatus() {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/notifications/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      configured: false,
      mode: "UNREACHABLE",
      error: err.message,
    };
  }
}
