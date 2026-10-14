/**
 * SKYRA – Firebase Cloud Messaging (FCM) Notification Service (Phase 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative backend push notification service for emergency disaster alerts.
 *
 * Capabilities:
 *   • Secure device token registration & location-radius subscriptions.
 *   • Server-side credentials isolation (Firebase Admin SDK).
 *   • Graceful fallback: If credentials are not configured, operates in safe
 *     DRY_RUN mode with full delivery audit logging (zero crashes).
 *   • SHA-256 deduplication: 30-minute cooldown per device token per alert.
 *   • Geo-targeted multicast: Dispatches exclusively to devices subscribed
 *     within the hazard impact radius.
 *   • Stale token cleanup: Automatically removes defunct/unregistered tokens.
 */

const crypto = require("crypto");
let admin = null;
try {
  admin = require("firebase-admin");
} catch {
  admin = null;
}

let firebaseApp = null;
let isConfigured = false;
let configMode = "UNCONFIGURED";

// In-memory device subscription store (keyed by token)
const deviceRegistry = new Map();

// Deduplication cooldown store: fingerprint -> timestamp
const dispatchCooldowns = new Map();
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Delivery & error audit log (capped at 100 entries)
const deliveryAuditLogs = [];

/**
 * Initializes Firebase Admin SDK from environment variables safely.
 */
function initializeFirebase() {
  if (firebaseApp) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountJson) {
    try {
      let parsed = null;
      if (serviceAccountJson.trim().startsWith("{")) {
        parsed = JSON.parse(serviceAccountJson);
      } else {
        const fs = require("fs");
        parsed = JSON.parse(fs.readFileSync(serviceAccountJson, "utf8"));
      }

      if (admin) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(parsed),
        });
        isConfigured = true;
        configMode = "LIVE";
        console.log("✅ [FCM Service] Firebase Admin SDK initialized successfully via service account JSON.");
        return;
      }
    } catch (err) {
      console.warn("⚠️ [FCM Service] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err.message);
    }
  }

  if (projectId && clientEmail && privateKey) {
    try {
      // Handle escaped newlines in .env private keys
      if (privateKey.includes("\\n")) {
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      if (admin) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        isConfigured = true;
        configMode = "LIVE";
        console.log("✅ [FCM Service] Firebase Admin SDK initialized successfully via discrete environment variables.");
        return;
      }
    } catch (err) {
      console.warn("⚠️ [FCM Service] Failed to initialize Firebase cert with discrete env vars:", err.message);
    }
  }

  isConfigured = false;
  configMode = "DRY_RUN";
  console.log("ℹ️ [FCM Service] Firebase credentials not configured in environment. Operating in secure DRY_RUN audit mode.");
}

// Auto-initialize on module load
initializeFirebase();

/**
 * Calculates Great Circle distance between two coordinates in kilometers.
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Registers or updates a device token with subscribed locations and preferences.
 */
function registerDeviceToken({
  token,
  platform = "web",
  location = null,
  radiusKm = 35,
  tags = ["all_emergencies"],
}) {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Device registration requires a valid, non-empty token string.");
  }

  const existing = deviceRegistry.get(token);
  const now = new Date().toISOString();

  const record = {
    token: token.trim(),
    platform: platform.toLowerCase(),
    location: location && typeof location.latitude === "number" && typeof location.longitude === "number"
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name || "Monitored Location",
        }
      : null,
    radiusKm: Number(radiusKm) || 35,
    tags: Array.isArray(tags) ? tags : ["all_emergencies"],
    registeredAt: existing ? existing.registeredAt : now,
    lastActiveAt: now,
  };

  deviceRegistry.set(token, record);

  return {
    success: true,
    message: "Device token registered successfully.",
    token: record.token,
    platform: record.platform,
    registeredAt: record.registeredAt,
    location: record.location,
  };
}

/**
 * Unregisters a device token.
 */
function unregisterDeviceToken(token) {
  if (!token) return { success: false, message: "Token required." };
  const existed = deviceRegistry.delete(token);
  return {
    success: true,
    removed: existed,
    message: existed ? "Device subscription removed." : "Token was not registered.",
  };
}

/**
 * Returns all active registered devices.
 */
function getRegisteredDevices() {
  return Array.from(deviceRegistry.values());
}

/**
 * Clears expired entries from cooldown cache.
 */
function pruneCooldowns() {
  const now = Date.now();
  for (const [key, timestamp] of dispatchCooldowns.entries()) {
    if (now - timestamp > COOLDOWN_MS) {
      dispatchCooldowns.delete(key);
    }
  }
}

/**
 * Dispatches an emergency disaster push notification to registered devices.
 */
async function dispatchDisasterAlert({
  id = `alert-${Date.now()}`,
  title,
  body,
  priority = "P2",
  hazard = "General Disaster",
  riskScore = 0,
  latitude = null,
  longitude = null,
  fingerprint = null,
}) {
  pruneCooldowns();

  // Strict priority gate: Only P1 (Emergency) and P2 (Warning) trigger push notifications
  if (priority !== "P1" && priority !== "P2") {
    return {
      status: "SKIPPED_LOW_PRIORITY",
      message: `Alert priority ${priority} does not meet push threshold (P1/P2 required).`,
      matchedDevices: 0,
      dispatched: 0,
    };
  }

  // Find eligible devices based on location proximity or global subscription
  const matchedTokens = [];
  for (const [token, dev] of deviceRegistry.entries()) {
    // If alert has coordinates and device has subscribed location, check radius
    if (
      latitude != null &&
      longitude != null &&
      dev.location &&
      dev.location.latitude != null &&
      dev.location.longitude != null
    ) {
      const dist = calculateDistanceKm(
        latitude,
        longitude,
        dev.location.latitude,
        dev.location.longitude
      );
      if (dist <= dev.radiusKm) {
        matchedTokens.push(token);
      }
    } else {
      // If alert has no coordinates or device has no location constraint, dispatch globally
      matchedTokens.push(token);
    }
  }

  // Deduplication filtering: Filter out tokens that received this alert within cooldown window
  const fp = fingerprint || crypto.createHash("sha256").update(`${id}_${hazard}_${priority}`).digest("hex");
  const eligibleTokens = matchedTokens.filter((token) => {
    const key = `${fp}_${token}`;
    const lastSent = dispatchCooldowns.get(key);
    if (lastSent && Date.now() - lastSent < COOLDOWN_MS) {
      return false;
    }
    return true;
  });

  if (eligibleTokens.length === 0) {
    return {
      status: "ALL_DEVICES_COOLDOWN_OR_UNMATCHED",
      matchedDevices: matchedTokens.length,
      eligibleTokens: 0,
      message: "No eligible devices found (devices either outside impact zone or in 30-min cooldown).",
    };
  }

  const payload = {
    notification: {
      title: title || `SKYRA ${priority === "P1" ? "EMERGENCY" : "WARNING"}: ${hazard}`,
      body: body || "Immediate attention advised. Review local guidance and precautions.",
    },
    data: {
      alertId: String(id),
      priority: String(priority),
      hazard: String(hazard),
      riskScore: String(riskScore),
      latitude: latitude != null ? String(latitude) : "",
      longitude: longitude != null ? String(longitude) : "",
      url: "/dashboard",
      timestamp: new Date().toISOString(),
    },
  };

  let successCount = 0;
  let failureCount = 0;
  const errors = [];

  if (isConfigured && firebaseApp) {
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: eligibleTokens,
        ...payload,
        android: {
          priority: "high",
          notification: {
            channelId: "skyra_emergency_alerts",
            priority: "max",
            sound: "default",
          },
        },
      });

      successCount = response.successCount;
      failureCount = response.failureCount;

      // Handle invalid / stale tokens
      response.responses.forEach((resp, idx) => {
        const token = eligibleTokens[idx];
        if (resp.success) {
          dispatchCooldowns.set(`${fp}_${token}`, Date.now());
        } else {
          const errCode = resp.error?.code;
          errors.push({ token: token.substring(0, 10) + "…", error: errCode });
          if (
            errCode === "messaging/invalid-registration-token" ||
            errCode === "messaging/registration-token-not-registered"
          ) {
            deviceRegistry.delete(token);
          }
        }
      });
    } catch (sendErr) {
      failureCount = eligibleTokens.length;
      errors.push({ generalError: sendErr.message });
    }
  } else {
    // DRY_RUN mode: Simulate delivery and register cooldowns
    successCount = eligibleTokens.length;
    failureCount = 0;
    eligibleTokens.forEach((token) => {
      dispatchCooldowns.set(`${fp}_${token}`, Date.now());
    });
  }

  const auditEntry = {
    alertId: id,
    priority,
    hazard,
    timestamp: new Date().toISOString(),
    mode: configMode,
    matchedCount: matchedTokens.length,
    eligibleCount: eligibleTokens.length,
    successCount,
    failureCount,
    errors: errors.slice(0, 5),
  };

  deliveryAuditLogs.unshift(auditEntry);
  if (deliveryAuditLogs.length > 100) deliveryAuditLogs.pop();

  return {
    status: "DISPATCHED",
    mode: configMode,
    matchedDevices: matchedTokens.length,
    eligibleDevices: eligibleTokens.length,
    successCount,
    failureCount,
    errors,
  };
}

/**
 * Returns complete FCM service status and delivery metrics.
 */
function getNotificationServiceStatus() {
  return {
    configured: isConfigured,
    mode: configMode,
    activeSubscriptions: deviceRegistry.size,
    recentAuditLogs: deliveryAuditLogs.slice(0, 10),
    cooldownCount: dispatchCooldowns.size,
  };
}

/**
 * Test helper to clear in-memory registries for clean testing.
 */
function resetFcmState() {
  deviceRegistry.clear();
  dispatchCooldowns.clear();
  deliveryAuditLogs.length = 0;
}

module.exports = {
  initializeFirebase,
  registerDeviceToken,
  unregisterDeviceToken,
  getRegisteredDevices,
  dispatchDisasterAlert,
  getNotificationServiceStatus,
  resetFcmState,
};
