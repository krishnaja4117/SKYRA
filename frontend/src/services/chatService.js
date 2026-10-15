/**
 * SKYRA – Conversational Chat API Service (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * Frontend client for communicating with backend POST /api/chat.
 * Sends user messages, location context, conversation history, and language.
 */

const RAW_API_BASE = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE_URL = RAW_API_BASE.replace(/\/+$/, "");

function getApiUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

/**
 * Sends a conversational query to the SKYRA backend.
 *
 * @param {Object} params
 * @param {string} params.message - User prompt or question
 * @param {Object} [params.locationContext] - { latitude, longitude, locationName }
 * @param {Array<Object>} [params.conversationHistory=[]] - Previous chat turns
 * @param {string} [params.language="en-IN"] - BCP-47 language tag selected by the user (e.g. "hi-IN", "ml-IN")
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<Object>} Backend conversational response
 */
export async function sendChatMessage({
  message,
  locationContext = {},
  conversationHistory = [],
  language = "en-IN",
  signal,
} = {}) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) {
    throw new Error("Message cannot be empty.");
  }

  const url = getApiUrl("/api/chat");

  // Create timeout controller if no custom signal provided (20-second timeout)
  let timeoutId = null;
  let activeSignal = signal;
  if (!activeSignal && typeof AbortController !== "undefined") {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 20000);
    activeSignal = controller.signal;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        message: cleanMessage,
        locationContext: typeof locationContext === "object" && locationContext !== null ? locationContext : {},
        conversationHistory: Array.isArray(conversationHistory)
          ? conversationHistory
              .filter((m) => m && typeof m.content === "string")
              .slice(-10) // keep last 10 turns for conversational coherence
              .map((m) => ({ role: m.role || "user", content: m.content }))
          : [],
        language,
      }),
      signal: activeSignal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Chat API responded with status ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Chat request timed out. Please check your connection and try again.");
    }
    throw err;
  }
}
