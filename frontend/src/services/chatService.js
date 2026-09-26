/**
 * SKYRA – Conversational Chat API Service (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * Frontend client for communicating with backend POST /api/chat.
 * Sends user messages, location context, and conversation history.
 */

const API_BASE_URL = "http://localhost:5000";

/**
 * Sends a conversational query to the SKYRA backend.
 *
 * @param {Object} params
 * @param {string} params.message - User prompt or question
 * @param {Object} [params.locationContext] - { latitude, longitude, locationName }
 * @param {Array<Object>} [params.conversationHistory=[]] - Previous chat turns
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<Object>} Backend conversational response
 */
export async function sendChatMessage({
  message,
  locationContext = {},
  conversationHistory = [],
  signal,
} = {}) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) {
    throw new Error("Message cannot be empty.");
  }

  const url = `${API_BASE_URL}/api/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      message: cleanMessage,
      locationContext,
      conversationHistory: conversationHistory.slice(-6), // keep last 6 turns for context
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Chat API responded with status ${response.status}`);
  }

  return await response.json();
}
