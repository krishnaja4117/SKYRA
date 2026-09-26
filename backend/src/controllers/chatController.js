/**
 * SKYRA – Conversational Chat Controller (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP controller handling POST /api/chat for multi-turn weather, risk,
 * and disaster intelligence conversations.
 */

const { processConversationalMessage } = require("../services/conversationService");

/**
 * Handles incoming user chat queries.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function postChat(req, res) {
  try {
    const {
      message,
      locationContext,
      conversationHistory,
      customInputs,
    } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Missing or invalid 'message' in request body.",
        status: 400,
      });
    }

    const result = await processConversationalMessage({
      message: message.trim(),
      locationContext: typeof locationContext === "object" ? locationContext : {},
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      customInputs: typeof customInputs === "object" ? customInputs : null,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("⚠️ [ChatController] Error processing conversational query:", err.message);
    return res.status(500).json({
      error: "An unexpected error occurred while processing the conversation.",
      status: 500,
      diagnostic: err.message,
    });
  }
}

module.exports = {
  postChat,
};
