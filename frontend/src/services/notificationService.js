/**
 * SKYRA – Notification & Audio Service (Phase 12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized, production-grade notification and acoustic alerting manager.
 *
 * Capabilities:
 *   • Web Notification API manager with user-gesture permission flows.
 *   • Web Audio API acoustic generator:
 *       - P1: 3-second modulated emergency siren (600–1200 Hz sawtooth).
 *       - P2: Dual-tone warning attention chime (880 Hz -> 1046 Hz).
 *       - P3/P4: Non-disruptive (silent).
 *   • Browser Autoplay Unlocker: Resumes AudioContext on initial user gesture.
 *   • Multi-Tab Coordination: Uses BroadcastChannel / storage events to prevent
 *     simultaneous audio or notification stacking across open tabs.
 *   • Acoustic Deduplication: Never repeats siren for an identical alert fingerprint.
 */

const PREFS_KEY = "skyra_alert_preferences";
const NOTIFIED_FINGERPRINTS_KEY = "skyra_notified_fingerprints";
const CHANNEL_NAME = "skyra_alert_coordination";

// ─── Broadcast Channel for Multi-Tab Coordination ─────────────────────────────
let _broadcastChannel = null;
try {
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    _broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch (_) {
  _broadcastChannel = null;
}

// ─── Audio Context Singleton ──────────────────────────────────────────────────
let _audioCtx = null;
let _isAudioUnlocked = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      _audioCtx = new AudioContextClass();
    }
  }
  return _audioCtx;
}

// Unlock audio context on first user interaction anywhere on the window
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => {
        _isAudioUnlocked = true;
      }).catch(() => {});
    } else if (ctx && ctx.state === "running") {
      _isAudioUnlocked = true;
    }
    // Remove listeners once running
    if (_isAudioUnlocked) {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    }
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
}

// ─── Preferences Storage ──────────────────────────────────────────────────────
export function getAlertPreferences() {
  if (typeof window === "undefined") {
    return { notificationsEnabled: true, alertSoundEnabled: true };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { notificationsEnabled: true, alertSoundEnabled: true };
    const parsed = JSON.parse(raw);
    return {
      notificationsEnabled: parsed.notificationsEnabled ?? true,
      alertSoundEnabled: parsed.alertSoundEnabled ?? true,
    };
  } catch (_) {
    return { notificationsEnabled: true, alertSoundEnabled: true };
  }
}

export function saveAlertPreferences(prefs) {
  if (typeof window === "undefined") return;
  try {
    const current = getAlertPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
  } catch (_) {}
}

// ─── Web Notification API Manager ─────────────────────────────────────────────
export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    const result = await Notification.requestPermission();
    saveAlertPreferences({ notificationsEnabled: result === "granted" });
    return result;
  } catch (err) {
    console.warn("[SKYRA Notifications] Permission request error:", err);
    return "denied";
  }
}

/**
 * Dispatches a desktop notification if permitted.
 * Restricted strictly to P1 (Emergency) and P2 (Warning) to prevent user fatigue.
 */
export function showBrowserNotification({
  id,
  fingerprint,
  title,
  message,
  priority = "P2",
  onNavigate,
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const prefs = getAlertPreferences();
  if (!prefs.notificationsEnabled) return;

  // Only P1 and P2 trigger browser popups
  if (priority !== "P1" && priority !== "P2") return;

  // Deduplication check across tabs
  if (isAlreadyNotified(fingerprint || id)) return;

  try {
    const icon = "/favicon.ico";
    const notification = new Notification(title || "SKYRA Severe Weather Alert", {
      body: message || "Immediate attention required.",
      tag: id || "skyra-live-alert", // Replaces existing notification with same ID
      renotify: true,
      icon,
    });

    notification.onclick = () => {
      window.focus();
      if (typeof onNavigate === "function") {
        onNavigate("Alerts & Advisories");
      }
      notification.close();
    };

    recordNotificationDispatched(fingerprint || id);
    broadcastDispatched(fingerprint || id);
  } catch (err) {
    console.warn("[SKYRA Notifications] Desktop notification display error:", err.message);
  }
}

// ─── Audio Siren & Chime Synthesizer (Web Audio API) ─────────────────────────

/**
 * Plays alert sound according to priority:
 *   P1: 3-second modulated emergency siren (600–1200 Hz)
 *   P2: Dual-tone warning chime (880 Hz -> 1046 Hz)
 *   P3 / P4: Silent
 */
export function playAlertAudio(priority = "P2", fingerprint = "") {
  const prefs = getAlertPreferences();
  if (!prefs.alertSoundEnabled) return;

  if (priority !== "P1" && priority !== "P2") return;

  // Multi-tab and duplicate check
  if (fingerprint && isAudioAlreadyPlayed(fingerprint)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (priority === "P1") {
      // ── P1: 3-second modulated emergency siren ──
      const duration = 3.0;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(650, now);

      lfo.type = "sine";
      lfo.frequency.value = 2.0; // 2 Hz wail rate
      lfoGain.gain.setValueAtTime(250, now); // +/- 250 Hz modulation

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.setValueAtTime(0.35, now + duration - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      osc.start(now);
      lfo.start(now);
      osc.stop(now + duration);
      lfo.stop(now + duration);
      console.log("[SKYRA Audio] P1 Emergency Siren triggered (3.0s)");
    } else {
      // ── P2: Dual-tone Warning Attention Chime ──
      const duration = 0.8;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5 tone
      osc.frequency.setValueAtTime(1046.5, now + 0.3); // C6 tone

      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.setValueAtTime(0.25, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      osc.start(now);
      osc.stop(now + duration);
      console.log("[SKYRA Audio] P2 Warning Attention Chime triggered");
    }

    if (fingerprint) {
      recordAudioPlayed(fingerprint);
      broadcastAudioPlayed(fingerprint);
    }
  } catch (err) {
    console.warn("[SKYRA Audio] Sound playback warning:", err.message);
  }
}

// ─── Multi-Tab & Deduplication Helpers ────────────────────────────────────────

const _notifiedSet = new Set();
const _audioPlayedSet = new Set();

function isAlreadyNotified(key) {
  if (!key) return false;
  return _notifiedSet.has(key);
}

function recordNotificationDispatched(key) {
  if (!key) return;
  _notifiedSet.add(key);
}

function isAudioAlreadyPlayed(key) {
  if (!key) return false;
  return _audioPlayedSet.has(key);
}

function recordAudioPlayed(key) {
  if (!key) return;
  _audioPlayedSet.add(key);
}

function broadcastDispatched(key) {
  if (_broadcastChannel) {
    try {
      _broadcastChannel.postMessage({ type: "NOTIFICATION_DISPATCHED", key });
    } catch (_) {}
  }
}

function broadcastAudioPlayed(key) {
  if (_broadcastChannel) {
    try {
      _broadcastChannel.postMessage({ type: "AUDIO_PLAYED", key });
    } catch (_) {}
  }
}

// Listen for messages from other open tabs
if (_broadcastChannel) {
  _broadcastChannel.onmessage = (event) => {
    const data = event.data;
    if (!data) return;
    if (data.type === "NOTIFICATION_DISPATCHED" && data.key) {
      _notifiedSet.add(data.key);
    } else if (data.type === "AUDIO_PLAYED" && data.key) {
      _audioPlayedSet.add(data.key);
    }
  };
}
