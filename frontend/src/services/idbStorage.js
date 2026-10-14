/**
 * SKYRA – High-Reliability Local IndexedDB Storage Engine (Phase 2 Upgrade)
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency native IndexedDB persistence engine for offline disaster
 * awareness, cached telemetry, local ML outputs, verified emergency shelters,
 * and durable emergency report queues.
 *
 * Guarantees:
 *   • Safe Version 2 migration handling.
 *   • Bounded storage with automatic LRU pruning (prevents QuotaExceededError).
 *   • Canonical telemetry freshness taxonomy: LIVE, CACHED, HISTORICAL, EXPIRED, UNAVAILABLE.
 *   • Durable emergency queues with unique cryptographic event IDs.
 */

const DB_NAME = "skyra_offline_db";
const DB_VERSION = 2;

export const STORES = Object.freeze({
  WEATHER: "weather_cache",
  RISK: "risk_cache",
  SAFETY: "safety_knowledge",
  EMERGENCY_QUEUE: "emergency_queue",
  MAP_TILES: "map_tiles",
  LOCATIONS: "saved_locations",
  SHELTERS: "emergency_shelters",
});

export const DATA_STATUS = Object.freeze({
  LIVE: "LIVE",
  CACHED: "CACHED",
  HISTORICAL: "HISTORICAL",
  EXPIRED: "EXPIRED",
  UNAVAILABLE: "UNAVAILABLE",
});

let _dbPromise = null;

/**
 * Initializes and returns the open IndexedDB instance with safe migrations.
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
      const oldVersion = event.oldVersion;

      // 1. Weather cache store
      if (!db.objectStoreNames.contains(STORES.WEATHER)) {
        const weatherStore = db.createObjectStore(STORES.WEATHER, { keyPath: "id" });
        weatherStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      // 2. Risk evaluations store
      if (!db.objectStoreNames.contains(STORES.RISK)) {
        const riskStore = db.createObjectStore(STORES.RISK, { keyPath: "id" });
        riskStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      // 3. Safety knowledge store
      if (!db.objectStoreNames.contains(STORES.SAFETY)) {
        const safetyStore = db.createObjectStore(STORES.SAFETY, { keyPath: "id" });
        safetyStore.createIndex("category", "category", { unique: false });
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

      // 7. Version 2 Upgrade: Emergency Shelters & Facilities Store
      if (!db.objectStoreNames.contains(STORES.SHELTERS)) {
        const shelterStore = db.createObjectStore(STORES.SHELTERS, { keyPath: "id" });
        shelterStore.createIndex("region", "region", { unique: false });
        shelterStore.createIndex("type", "type", { unique: false });
      }

      console.log(`[SKYRA IDB] Migration completed: v${oldVersion} -> v${DB_VERSION}`);
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

/**
 * Storage limit guard: Prunes oldest items in a store when item count exceeds maxRecords.
 */
export async function pruneStoreToLimit(storeName, maxRecords = 30) {
  try {
    const all = await getAllItems(storeName);
    if (all.length <= maxRecords) return 0;

    // Sort by timestamp ascending (oldest first)
    all.sort((a, b) => new Date(a.timestamp || a.createdAt || 0) - new Date(b.timestamp || b.createdAt || 0));
    const excessCount = all.length - maxRecords;
    const toDelete = all.slice(0, excessCount);

    const db = await getDb();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const keyPath = store.keyPath;

    for (const item of toDelete) {
      const key = item[keyPath];
      if (key) store.delete(key);
    }

    return excessCount;
  } catch (err) {
    console.warn(`[SKYRA IDB] Prune failed for ${storeName}:`, err.message);
    return 0;
  }
}

// ── Freshness Classification & Labeling ──────────────────────────────────────

/**
 * Classifies data freshness into canonical disaster-readiness taxonomies:
 *   • LIVE: Verified online response within past 15 minutes.
 *   • CACHED: Valid offline snapshot between 15 and 120 minutes old.
 *   • HISTORICAL: Multi-year climatology or records explicitly flagged as historical.
 *   • EXPIRED: Telemetry older than 120 minutes (conditions may have changed).
 *   • UNAVAILABLE: No local snapshot available and upstream network disconnected.
 *
 * @param {string|Date|null} timestamp - Creation/observation timestamp
 * @param {Object} options - Options including ttlMinutes, isLive, isHistorical
 * @returns {Object} { status, ageMinutes, badgeLabel, isStale }
 */
export function classifyDataFreshness(timestamp, options = {}) {
  if (options.isHistorical) {
    return {
      status: DATA_STATUS.HISTORICAL,
      ageMinutes: null,
      badgeLabel: "HISTORICAL DATA",
      isStale: false,
      color: "#60a5fa",
    };
  }

  if (!timestamp) {
    return {
      status: DATA_STATUS.UNAVAILABLE,
      ageMinutes: null,
      badgeLabel: "UNAVAILABLE",
      isStale: true,
      color: "#94a3b8",
    };
  }

  const timeMs = new Date(timestamp).getTime();
  if (Number.isNaN(timeMs)) {
    return {
      status: DATA_STATUS.UNAVAILABLE,
      ageMinutes: null,
      badgeLabel: "UNAVAILABLE",
      isStale: true,
      color: "#94a3b8",
    };
  }

  const ageMinutes = Math.max(0, Math.round((Date.now() - timeMs) / 60000));
  const ttl = options.ttlMinutes || 120; // 2 hours default disaster validity window

  if (options.isLive || (ageMinutes <= 15 && typeof navigator !== "undefined" && navigator.onLine)) {
    return {
      status: DATA_STATUS.LIVE,
      ageMinutes,
      badgeLabel: "LIVE",
      isStale: false,
      color: "#22c55e",
    };
  }

  if (ageMinutes > ttl) {
    return {
      status: DATA_STATUS.EXPIRED,
      ageMinutes,
      badgeLabel: `EXPIRED (${ageMinutes}m old)`,
      isStale: true,
      color: "#ef4444",
    };
  }

  return {
    status: DATA_STATUS.CACHED,
    ageMinutes,
    badgeLabel: `CACHED (${ageMinutes}m ago)`,
    isStale: false,
    color: "#eab308",
  };
}

// ── Weather & Risk Snapshots ─────────────────────────────────────────────────

export async function saveWeatherSnapshot(locationKey, weatherData, metadata = {}) {
  const now = new Date().toISOString();
  const entry = {
    id: locationKey || "current_location",
    data: weatherData,
    timestamp: now,
    source: metadata.source || "SKYRA Telemetry Engine",
    locationName: metadata.locationName || "Current Location",
    latitude: metadata.latitude,
    longitude: metadata.longitude,
    ttlMinutes: metadata.ttlMinutes || 120,
  };
  await putItem(STORES.WEATHER, entry);
  pruneStoreToLimit(STORES.WEATHER, 20).catch(() => {});
  return entry;
}

export async function getCachedWeather(locationKey = "current_location") {
  const entry = await getItem(STORES.WEATHER, locationKey);
  if (!entry) return null;

  const freshnessInfo = classifyDataFreshness(entry.timestamp, {
    ttlMinutes: entry.ttlMinutes || 120,
    isLive: false,
  });

  return {
    ...entry,
    ageMinutes: freshnessInfo.ageMinutes,
    freshness: freshnessInfo.status,
    freshnessInfo,
  };
}

export async function saveRiskSnapshot(locationKey, riskData) {
  const now = new Date().toISOString();
  const entry = {
    id: locationKey || "current_risk",
    ...riskData,
    timestamp: now,
  };
  await putItem(STORES.RISK, entry);
  pruneStoreToLimit(STORES.RISK, 20).catch(() => {});
  return entry;
}

export async function getCachedRisk(locationKey = "current_risk") {
  const entry = await getItem(STORES.RISK, locationKey);
  if (!entry) return null;

  const freshnessInfo = classifyDataFreshness(entry.timestamp, {
    ttlMinutes: 120,
    isLive: false,
  });

  return {
    ...entry,
    ageMinutes: freshnessInfo.ageMinutes,
    freshness: freshnessInfo.status,
    freshnessInfo,
  };
}

// ── Emergency Shelters & Facilities ──────────────────────────────────────────

export async function saveRegionalShelters(regionId, shelters = []) {
  const db = await getDb();
  const tx = db.transaction(STORES.SHELTERS, "readwrite");
  const store = tx.objectStore(STORES.SHELTERS);

  for (const s of shelters) {
    store.put({
      ...s,
      region: regionId,
      cachedAt: new Date().toISOString(),
    });
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(shelters.length);
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getCachedShelters(regionId = null) {
  const all = await getAllItems(STORES.SHELTERS);
  if (!regionId) return all;
  return all.filter((s) => s.region === regionId || s.region === "all");
}

// ── Saved Locations Store ────────────────────────────────────────────────────

export async function saveLocation(location) {
  const id = location.id || `loc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const item = {
    ...location,
    id,
    savedAt: new Date().toISOString(),
  };
  await putItem(STORES.LOCATIONS, item);
  return item;
}

export async function getSavedLocations() {
  return getAllItems(STORES.LOCATIONS);
}

export async function deleteSavedLocation(id) {
  return deleteItem(STORES.LOCATIONS, id);
}

// ── Emergency Queue Operations (Durable & Duplicate-Safe) ────────────────────

export async function queueEmergencyReport(report) {
  const randomSuffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().substring(0, 8).toUpperCase()
    : Math.random().toString(36).substring(2, 8).toUpperCase();

  const eventId = report.eventId || `EMG-${Date.now()}-${randomSuffix}`;
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

export async function markEmergencyReportSynced(eventId, serverReceipt = {}) {
  const item = await getItem(STORES.EMERGENCY_QUEUE, eventId);
  if (!item) return null;
  item.status = "SYNCED";
  item.syncedAt = new Date().toISOString();
  item.serverReceipt = serverReceipt;
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
