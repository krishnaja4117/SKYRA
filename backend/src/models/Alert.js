const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },

    location: {
      type: String,
      default: "Current location",
    },

    riskLevel: {
      type: String,
      required: true,
    },

    riskScore: {
      type: Number,
      required: true,
    },

    confidence: {
      type: Number,
      default: 0,
    },

    hazard: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    recommendedAction: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      default: "Active",
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "alerts",
  }
);

module.exports = mongoose.model("Alert", alertSchema);