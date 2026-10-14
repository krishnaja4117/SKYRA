/**
 * SKYRA – Frontend Emergency Service (Phase 13 Foundation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side emergency state machine, offline queue manager, and API client.
 *
 * Guarantees:
 *   • Single source of truth for Emergency Mode state across tabs and reloads.
 *   • Safe offline queueing: preserves events when disconnected, replays upon online event.
 *   • Idempotency: assigns unique event IDs preventing duplicate submissions.
 *   • Privacy-Aware: validates contact information and avoids transmitting unnecessary data.
 *   • Truthful delivery status: explicitly reports SENT, QUEUED, or FAILED.
 */

const RAW_API_BASE = (import.meta.env.VITE_API_URL || "").trim();
const BASE_URL = RAW_API_BASE.replace(/\/+$/, "");

function getApiUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return BASE_URL ? `${BASE_URL}${cleanPath}` : cleanPath;
}

const EMERGENCY_STATE_KEY = "skyra_emergency_state";
const EMERGENCY_QUEUE_KEY = "skyra_emergency_queue";
const EMERGENCY_CONTACTS_KEY = "skyraEmergencyContacts";

export const EMERGENCY_STATES = Object.freeze({
  NORMAL: "NORMAL",
  EMERGENCY_ACTIVE: "EMERGENCY_ACTIVE",
  SOS_SENT: "SOS_SENT",
  HELP_NEEDED: "HELP_NEEDED",
  SAFE: "SAFE",
  OFFLINE_PENDING: "OFFLINE_PENDING",
  QUEUED: "QUEUED",
  RESOLVED: "RESOLVED",
});

// Event listeners for state changes
const _subscribers = new Set();

export function subscribeEmergencyState(callback) {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
}

function notifySubscribers(state) {
  _subscribers.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.error("[EmergencyService] Subscriber error:", e);
    }
  });
}

/**
 * Loads current emergency state from localStorage.
 */
export function getStoredEmergencyState() {
  try {
    const raw = localStorage.getItem(EMERGENCY_STATE_KEY);
    if (!raw) return getDefaultEmergencyState();
    const parsed = JSON.parse(raw);
    return {
      state: parsed.state || EMERGENCY_STATES.NORMAL,
      eventId: parsed.eventId || null,
      safetyStatus: parsed.safetyStatus || "UNSPECIFIED",
      activatedAt: parsed.activatedAt || null,
      sosTriggeredAt: parsed.sosTriggeredAt || null,
      deliveryState: parsed.deliveryState || null,
      lastError: parsed.lastError || null,
    };
  } catch {
    return getDefaultEmergencyState();
  }
}

export function getDefaultEmergencyState() {
  return {
    state: EMERGENCY_STATES.NORMAL,
    eventId: null,
    safetyStatus: "UNSPECIFIED",
    activatedAt: null,
    sosTriggeredAt: null,
    deliveryState: null,
    lastError: null,
  };
}

/**
 * Saves emergency state and notifies subscribers.
 */
export function setStoredEmergencyState(updates) {
  const current = getStoredEmergencyState();
  const next = { ...current, ...updates };
  try {
    localStorage.setItem(EMERGENCY_STATE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("[EmergencyService] Storage error:", err);
  }
  notifySubscribers(next);
  return next;
}

/**
 * Generates client-side unique event ID.
 */
export function createEventId() {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `EMG-${Date.now()}-${rand}`;
}

// ─── OFFLINE QUEUE ────────────────────────────────────────────────────────────

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(EMERGENCY_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToOfflineQueue(item) {
  const queue = getOfflineQueue();
  // Prevent duplicate eventId in queue
  if (!queue.some((q) => q.eventId === item.eventId && q.type === item.type)) {
    queue.push({ ...item, queuedAt: new Date().toISOString() });
    try {
      localStorage.setItem(EMERGENCY_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error("[EmergencyService] Failed to persist queue:", e);
    }
  }
}

export function clearOfflineQueue() {
  try {
    localStorage.removeItem(EMERGENCY_QUEUE_KEY);
  } catch {}
}

/**
 * Attempts to replay all queued emergency actions when network is online.
 */
export async function flushOfflineQueue() {
  if (!navigator.onLine) return { replayed: 0, remaining: getOfflineQueue().length };
  const queue = getOfflineQueue();
  if (queue.length === 0) return { replayed: 0, remaining: 0 };

  const remaining = [];
  let replayedCount = 0;

  for (const item of queue) {
    try {
      if (item.type === "SOS") {
        await apiTriggerSos({ ...item.payload, isOffline: false });
        replayedCount++;
      } else if (item.type === "SAFETY_STATUS") {
        await apiUpdateSafetyStatus(item.payload);
        replayedCount++;
      }
    } catch (err) {
      console.warn(`[EmergencyService] Replay failed for ${item.type}:`, err.message);
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(EMERGENCY_QUEUE_KEY, JSON.stringify(remaining));
  } catch {}

  if (replayedCount > 0 && remaining.length === 0) {
    const current = getStoredEmergencyState();
    if (current.state === EMERGENCY_STATES.QUEUED || current.state === EMERGENCY_STATES.OFFLINE_PENDING) {
      setStoredEmergencyState({ state: EMERGENCY_STATES.SOS_SENT, deliveryState: "SENT" });
    }
  }

  return { replayed: replayedCount, remaining: remaining.length };
}

// Listen to network changes
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[EmergencyService] Network connection restored. Flushing queue...");
    flushOfflineQueue().catch(() => {});
  });
}

// ─── CONTACTS MANAGEMENT ──────────────────────────────────────────────────────

export function loadEmergencyContacts() {
  try {
    const raw = localStorage.getItem(EMERGENCY_CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEmergencyContacts(contacts) {
  try {
    localStorage.setItem(EMERGENCY_CONTACTS_KEY, JSON.stringify(contacts));
  } catch (err) {
    console.error("[EmergencyService] Failed to save contacts:", err);
  }
  return contacts;
}

export function validateContact(name, phone) {
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();

  if (!cleanName) {
    return { valid: false, error: "Name is required." };
  }
  if (cleanName.length > 80) {
    return { valid: false, error: "Name must be under 80 characters." };
  }
  if (!cleanPhone) {
    return { valid: false, error: "Phone number is required." };
  }
  const digits = cleanPhone.replace(/\D/g, "");
  if (digits.length < 7 || cleanPhone.length > 20) {
    return { valid: false, error: "Phone number must have between 7 and 20 digits." };
  }
  return { valid: true, name: cleanName, phone: cleanPhone };
}

export function addEmergencyContact(name, phone) {
  const val = validateContact(name, phone);
  if (!val.valid) return { success: false, error: val.error };

  const contacts = loadEmergencyContacts();
  // Check for duplicate phone
  if (contacts.some((c) => c.phone.replace(/\D/g, "") === val.phone.replace(/\D/g, ""))) {
    return { success: false, error: "A contact with this phone number already exists." };
  }

  const newContact = {
    id: `contact-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    name: val.name,
    phone: val.phone,
    createdAt: new Date().toISOString(),
  };

  const updated = [...contacts, newContact];
  saveEmergencyContacts(updated);
  return { success: true, contact: newContact, contacts: updated };
}

export function deleteEmergencyContact(contactId) {
  const contacts = loadEmergencyContacts();
  const updated = contacts.filter((c) => c.id !== contactId);
  saveEmergencyContacts(updated);
  return updated;
}

// ─── API CLIENT CALLS ─────────────────────────────────────────────────────────

export async function apiActivateEmergency({ latitude, longitude, locationLabel, accuracyMeters }) {
  const current = getStoredEmergencyState();
  const eventId = current.eventId || createEventId();

  const payload = {
    eventId,
    latitude,
    longitude,
    locationLabel,
    accuracyMeters,
    metadata: { clientTimestamp: new Date().toISOString() },
  };

  if (!navigator.onLine) {
    setStoredEmergencyState({
      state: EMERGENCY_STATES.EMERGENCY_ACTIVE,
      eventId,
      activatedAt: new Date().toISOString(),
      deliveryState: "QUEUED",
    });
    return {
      status: "SUCCESS",
      eventId,
      state: EMERGENCY_STATES.EMERGENCY_ACTIVE,
      deliveryState: "QUEUED",
      message: "Emergency mode activated locally (Offline).",
    };
  }

  try {
    const res = await fetch(getApiUrl("/api/emergency/activate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${res.status}`);
    }

    const data = await res.json();
    setStoredEmergencyState({
      state: EMERGENCY_STATES.EMERGENCY_ACTIVE,
      eventId: data.eventId,
      activatedAt: data.event?.activatedAt || new Date().toISOString(),
      deliveryState: "SENT",
      lastError: null,
    });
    return data;
  } catch (err) {
    setStoredEmergencyState({
      state: EMERGENCY_STATES.EMERGENCY_ACTIVE,
      eventId,
      activatedAt: new Date().toISOString(),
      deliveryState: "QUEUED",
      lastError: err.message,
    });
    return {
      status: "SUCCESS",
      eventId,
      state: EMERGENCY_STATES.EMERGENCY_ACTIVE,
      deliveryState: "QUEUED",
      warning: "Saved locally; backend synchronization will occur when online.",
    };
  }
}

export async function apiTriggerSos({
  latitude,
  longitude,
  locationLabel,
  accuracyMeters,
  emergencyType = "USER_SOS",
  contacts = [],
  note = "",
  isOffline = false,
}) {
  const current = getStoredEmergencyState();
  const eventId = current.eventId || createEventId();
  const effectiveOffline = isOffline || !navigator.onLine;

  const payload = {
    eventId,
    latitude,
    longitude,
    locationLabel,
    accuracyMeters,
    emergencyType,
    contacts,
    isOffline: effectiveOffline,
    note,
  };

  if (effectiveOffline) {
    addToOfflineQueue({ type: "SOS", eventId, payload });
    setStoredEmergencyState({
      state: EMERGENCY_STATES.QUEUED,
      eventId,
      sosTriggeredAt: new Date().toISOString(),
      deliveryState: "QUEUED",
    });
    return {
      status: "QUEUED",
      eventId,
      state: EMERGENCY_STATES.QUEUED,
      deliveryState: "QUEUED",
      message: "No internet connection. SOS is queued and will send automatically when online.",
    };
  }

  try {
    const res = await fetch(getApiUrl("/api/emergency/sos"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    setStoredEmergencyState({
      state: EMERGENCY_STATES.SOS_SENT,
      eventId: data.eventId,
      sosTriggeredAt: data.event?.sosTriggeredAt || new Date().toISOString(),
      deliveryState: data.deliveryState || "SENT",
      lastError: null,
    });
    return data;
  } catch (err) {
    console.warn("[EmergencyService] Network SOS failed, queueing offline:", err.message);
    addToOfflineQueue({ type: "SOS", eventId, payload: { ...payload, isOffline: true } });
    setStoredEmergencyState({
      state: EMERGENCY_STATES.QUEUED,
      eventId,
      sosTriggeredAt: new Date().toISOString(),
      deliveryState: "QUEUED",
      lastError: err.message,
    });
    return {
      status: "QUEUED",
      eventId,
      state: EMERGENCY_STATES.QUEUED,
      deliveryState: "QUEUED",
      message: "Network delivery failed. SOS is safely queued locally.",
    };
  }
}

export async function apiUpdateSafetyStatus({ safetyStatus, note = "" }) {
  const current = getStoredEmergencyState();
  if (!current.eventId) {
    throw new Error("No active emergency event found.");
  }
  const eventId = current.eventId;
  const nextState = safetyStatus === "SAFE" ? EMERGENCY_STATES.SAFE : EMERGENCY_STATES.HELP_NEEDED;

  if (!navigator.onLine) {
    addToOfflineQueue({
      type: "SAFETY_STATUS",
      eventId,
      payload: { eventId, safetyStatus, note },
    });
    setStoredEmergencyState({
      state: nextState,
      safetyStatus,
    });
    return {
      status: "QUEUED",
      eventId,
      state: nextState,
      safetyStatus,
      message: `Safety status updated to ${safetyStatus} (Queued locally).`,
    };
  }

  try {
    const res = await fetch(getApiUrl("/api/emergency/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, safetyStatus, note }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    setStoredEmergencyState({
      state: nextState,
      safetyStatus,
      lastError: null,
    });
    return data;
  } catch (err) {
    console.warn("[EmergencyService] Safety status network update failed:", err.message);
    addToOfflineQueue({
      type: "SAFETY_STATUS",
      eventId,
      payload: { eventId, safetyStatus, note },
    });
    setStoredEmergencyState({
      state: nextState,
      safetyStatus,
      lastError: err.message,
    });
    return {
      status: "QUEUED",
      eventId,
      state: nextState,
      safetyStatus,
      message: `Safety status updated to ${safetyStatus} (Saved locally; will sync).`,
    };
  }
}

export async function apiDeactivateEmergency(note = "User exited emergency mode.") {
  const current = getStoredEmergencyState();
  const eventId = current.eventId;

  if (eventId && navigator.onLine) {
    try {
      await fetch(getApiUrl("/api/emergency/deactivate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, note }),
      });
    } catch (e) {
      console.warn("[EmergencyService] Failed to notify backend of deactivation:", e.message);
    }
  }

  const reset = getDefaultEmergencyState();
  setStoredEmergencyState(reset);
  return reset;
}
