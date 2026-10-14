/**
 * SKYRA – High-Reliability Local IndexedDB Storage Engine (Phase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency native IndexedDB persistence engine for offline disaster
 * awareness, cached telemetry, local ML outputs, and emergency queues.
 */

const DB_NAME = "skyra_offline_db";
const DB_VERSION = 1;

export const STORES = Object.freeze({
  WEATHER: "weather_cache",
  RISK: "risk_cache",
  SAFETY: "safety_knowledge",
  EMERGENCY_QUEUE: "emergency_queue",
  MAP_TILES: "map_tiles",
  LOCATIONS: "saved_locations",
});

let _dbPromise = null;

/**
 * Initializes and returns the open IndexedDB instance.
 */
export function getDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not supported in this browser environment."));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Weather cache store
      if (!db.objectStoreNames.contains(STORES.WEATHER)) {
        db.createObjectStore(STORES.WEATHER, { keyPath: "id" });
      }

      // 2. Risk evaluations store
      if (!db.objectStoreNames.contains(STORES.RISK)) {
        db.createObjectStore(STORES.RISK, { keyPath: "id" });
      }

      // 3. Safety knowledge store
      if (!db.objectStoreNames.contains(STORES.SAFETY)) {
        db.createObjectStore(STORES.SAFETY, { keyPath: "id" });
      }

      // 4. Emergency sync queue store
      if (!db.objectStoreNames.contains(STORES.EMERGENCY_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.EMERGENCY_QUEUE, { keyPath: "eventId" });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 5. Offline map tiles store
      if (!db.objectStoreNames.contains(STORES.MAP_TILES)) {
        const tileStore = db.createObjectStore(STORES.MAP_TILES, { keyPath: "key" });
        tileStore.createIndex("region", "region", { unique: false });
      }

      // 6. Saved locations store
      if (!db.objectStoreNames.contains(STORES.LOCATIONS)) {
        db.createObjectStore(STORES.LOCATIONS, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      _dbPromise = null;
      reject(new Error(`IndexedDB open error: ${event.target.error?.message}`));
    };
  });

  return _dbPromise;
}

// ── Generic IDB Helpers ──────────────────────────────────────────────────────

export async function putItem(storeName, item) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getItem(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllItems(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteItem(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function clearStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Weather & Risk Snapshots ─────────────────────────────────────────────────

export async function saveWeatherSnapshot(locationKey, weatherData, metadata = {}) {
  const now = new Date().toISOString();
  const entry = {
    id: locationKey || "current_location",
    data: weatherData,
    timestamp: now,
    source: metadata.source || "Open-Meteo API",
    locationName: metadata.locationName || "Current Location",
    latitude: metadata.latitude,
    longitude: metadata.longitude,
    ttlMinutes: metadata.ttlMinutes || 120, // 2-hour freshness window
  };
  return putItem(STORES.WEATHER, entry);
}

export async function getCachedWeather(locationKey = "current_location") {
  const entry = await getItem(STORES.WEATHER, locationKey);
  if (!entry) return null;

  const ageMinutes = (Date.now() - new Date(entry.timestamp).getTime()) / 60000;
  let freshness = "FRESH";
  if (ageMinutes > (entry.ttlMinutes || 120)) {
    freshness = "EXPIRED";
  } else if (ageMinutes > 30) {
    freshness = "CACHED";
  }

  return {
    ...entry,
    ageMinutes: Math.round(ageMinutes),
    freshness,
  };
}

export async function saveRiskSnapshot(locationKey, riskData) {
  const now = new Date().toISOString();
  const entry = {
    id: locationKey || "current_risk",
    ...riskData,
    timestamp: now,
  };
  return putItem(STORES.RISK, entry);
}

export async function getCachedRisk(locationKey = "current_risk") {
  return getItem(STORES.RISK, locationKey);
}

// ── Emergency Queue Operations ───────────────────────────────────────────────

export async function queueEmergencyReport(report) {
  const eventId = report.eventId || `EMG-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const item = {
    eventId,
    type: report.type || "STATUS_UPDATE",
    safetyStatus: report.safetyStatus || "UNSPECIFIED",
    note: report.note || "",
    latitude: report.latitude ?? null,
    longitude: report.longitude ?? null,
    locationLabel: report.locationLabel || "Unknown Location",
    status: "PENDING", // PENDING | SYNCED | FAILED
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastAttemptAt: null,
    error: null,
  };
  await putItem(STORES.EMERGENCY_QUEUE, item);
  return item;
}

export async function getPendingEmergencyReports() {
  const all = await getAllItems(STORES.EMERGENCY_QUEUE);
  return all.filter((item) => item.status === "PENDING" || item.status === "FAILED");
}

export async function getOfflineQueueCount() {
  try {
    const pending = await getPendingEmergencyReports();
    return pending.length;
  } catch {
    return 0;
  }
}

export async function markEmergencyReportSynced(eventId) {
  const item = await getItem(STORES.EMERGENCY_QUEUE, eventId);
  if (!item) return null;
  item.status = "SYNCED";
  item.syncedAt = new Date().toISOString();
  await putItem(STORES.EMERGENCY_QUEUE, item);
  return item;
}

export async function markEmergencyReportFailed(eventId, errorMessage) {
  const item = await getItem(STORES.EMERGENCY_QUEUE, eventId);
  if (!item) return null;
  item.status = "FAILED";
  item.retryCount = (item.retryCount || 0) + 1;
  item.lastAttemptAt = new Date().toISOString();
  item.error = errorMessage;
  await putItem(STORES.EMERGENCY_QUEUE, item);
  return item;
}

// ── Storage Persistence & Quotas ─────────────────────────────────────────────

export async function requestPersistentStorage() {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`[SKYRA IDB] Storage persistence: ${isPersisted ? "GRANTED" : "DEFAULT"}`);
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

export async function getStorageQuotaEstimate() {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usageBytes: estimate.usage || 0,
        quotaBytes: estimate.quota || 0,
        usageMB: Math.round((estimate.usage || 0) / (1024 * 1024)),
        quotaMB: Math.round((estimate.quota || 0) / (1024 * 1024)),
        percentUsed: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0,
      };
    } catch {
      return null;
    }
  }
  return null;
}
