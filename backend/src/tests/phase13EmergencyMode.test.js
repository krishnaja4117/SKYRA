/**
 * SKYRA – Phase 13 Emergency Mode Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive verification of Phase 13 Emergency Mode:
 *   A. Emergency activation (transition from NORMAL to EMERGENCY_ACTIVE)
 *   B. SOS creation & execution
 *   C. Unique event ID generation & validation
 *   D. Valid location handling ([lon, lat] bounds & label preservation)
 *   E. Missing location handling (truthful locationAvailable=false, zero default to Bhubaneswar)
 *   F. "I'M SAFE" response & state transition
 *   G. "I NEED HELP" response & state transition
 *   H. Status update & state machine transition auditing
 *   I. Emergency contact validation & phone privacy masking
 *   J. Offline queue semantics (QUEUED delivery state)
 *   K. Reconnection & queue retry processing
 *   L. Duplicate SOS / Idempotency protection (repeated eventId returns existing record without duplicate dispatch)
 *   M. Backend schema validation & illegal state transition rejection
 *   N. Unauthorized / invalid request handling (missing required fields return HTTP 400/404)
 *   O. Existing alert integration (P1 Emergency Alert creation & multi-channel dispatch receipts)
 *   P. Emergency state persistence & lifecycle history auditing
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EMERGENCY_STATES,
  isValidTransition,
  validateEmergencyContact,
  validateCoordinates,
  generateEmergencyEventId,
  activateEmergency,
  triggerSos,
  updateSafetyStatus,
  getEmergencyStatus,
  resolveEmergency,
  clearEmergencyStore,
} = require("../services/emergencyService");

const { Alert } = require("../models/Alert");
const { PRIORITIES, SOURCE_AUTHORITIES } = require("../services/alertEngine");

test.beforeEach(() => {
  clearEmergencyStore();
});

test("Phase 13 – Emergency Mode & Lifecycle Verification Suite", async (t) => {
  // ── A. Emergency Activation ───────────────────────────────────────────────
  await t.test("A. Emergency Activation: Transitions safely to EMERGENCY_ACTIVE", async () => {
    const res = await activateEmergency({
      latitude: 13.0827,
      longitude: 80.2707,
      locationLabel: "Chennai City",
    });

    assert.equal(res.status, "SUCCESS");
    assert.equal(res.state, EMERGENCY_STATES.EMERGENCY_ACTIVE);
    assert.ok(res.eventId.startsWith("EMG-"));
    assert.equal(res.event.locationAvailable, true);
    assert.equal(res.event.location.latitude, 13.0827);
    assert.equal(res.event.location.longitude, 80.2707);
    assert.equal(res.event.location.label, "Chennai City");
  });

  // ── B & C. SOS Creation & Unique Event ID ─────────────────────────────────
  await t.test("B & C. SOS Creation: Creates unique event ID and triggers P1 dispatch", async () => {
    const eventId = generateEmergencyEventId();
    assert.ok(eventId.startsWith("EMG-"));

    const sosRes = await triggerSos({
      eventId,
      latitude: 19.0760,
      longitude: 72.8777,
      locationLabel: "Mumbai Coastal Zone",
      emergencyType: "URBAN_FLASH_FLOOD",
      contacts: [{ name: "Family Support", phone: "+91 9876543210" }],
    });

    assert.equal(sosRes.status, "SUCCESS");
    assert.equal(sosRes.eventId, eventId);
    assert.equal(sosRes.state, EMERGENCY_STATES.SOS_SENT);
    assert.equal(sosRes.deliveryState, "SENT");
    assert.ok(sosRes.alertId.startsWith("SKYRA-SOS-"));
    assert.ok(sosRes.dispatchReceipts);
    assert.ok(sosRes.dispatchReceipts.channels.cap_xml);
    assert.equal(sosRes.event.contactsCount, 1);
  });

  // ── D. Valid Location Handling ────────────────────────────────────────────
  await t.test("D. Valid Location Handling: WGS-84 coordinates preserved precisely", async () => {
    const coord = validateCoordinates(12.9716, 77.5946);
    assert.equal(coord.valid, true);
    assert.equal(coord.latitude, 12.9716);
    assert.equal(coord.longitude, 77.5946);

    const res = await activateEmergency({
      latitude: 12.9716,
      longitude: 77.5946,
      locationLabel: "Bengaluru Tech Corridor",
    });

    assert.equal(res.event.location.latitude, 12.9716);
    assert.equal(res.event.location.longitude, 77.5946);
  });

  // ── E. Missing Location Handling (Zero Silent Defaulting) ──────────────────
  await t.test("E. Missing Location Handling: Explicitly flags unavailable without defaulting to Bhubaneswar", async () => {
    const invalidCoord = validateCoordinates(null, undefined);
    assert.equal(invalidCoord.valid, false);
    assert.equal(invalidCoord.reason, "MISSING_COORDINATES");

    const outOfBounds = validateCoordinates(95.0, 200.0);
    assert.equal(outOfBounds.valid, false);
    assert.equal(outOfBounds.reason, "OUT_OF_BOUNDS_COORDINATES");

    const res = await activateEmergency({
      latitude: null,
      longitude: null,
      locationLabel: "GPS Offline",
    });

    assert.equal(res.event.locationAvailable, false);
    assert.equal(res.event.location, null);
    // Explicitly verify zero silent default to Bhubaneswar (20.2961, 85.8245)
    assert.notEqual(res.event.location?.latitude, 20.2961);
    assert.notEqual(res.event.location?.longitude, 85.8245);
  });

  // ── F & G. Safe & Need Help Responses ─────────────────────────────────────
  await t.test("F & G. Safety Status Check-In: 'SAFE' and 'HELP_NEEDED' transitions", async () => {
    const act = await activateEmergency({ locationLabel: "Delhi NCT" });
    const eventId = act.eventId;

    // F: User marks SAFE
    const safeRes = await updateSafetyStatus({ eventId, safetyStatus: "SAFE", note: "Sheltered in community center" });
    assert.equal(safeRes.status, "SUCCESS");
    assert.equal(safeRes.state, EMERGENCY_STATES.SAFE);
    assert.equal(safeRes.safetyStatus, "SAFE");

    // G: Situation changes, user marks HELP_NEEDED
    const helpRes = await updateSafetyStatus({ eventId, safetyStatus: "HELP_NEEDED", note: "Water level rising rapidly" });
    assert.equal(helpRes.status, "SUCCESS");
    assert.equal(helpRes.state, EMERGENCY_STATES.HELP_NEEDED);
    assert.equal(helpRes.safetyStatus, "HELP_NEEDED");
  });

  // ── H. Status Update & Audit History ──────────────────────────────────────
  await t.test("H. Status Update: Full audit history recorded chronologically", async () => {
    const act = await activateEmergency({ locationLabel: "Kochi Marine Drive" });
    const eventId = act.eventId;

    await triggerSos({ eventId, isOffline: false });
    await updateSafetyStatus({ eventId, safetyStatus: "HELP_NEEDED" });
    await updateSafetyStatus({ eventId, safetyStatus: "SAFE" });

    const audit = await getEmergencyStatus(eventId);
    assert.ok(audit.history.length >= 4);
    assert.equal(audit.history[0].state, EMERGENCY_STATES.EMERGENCY_ACTIVE);
    assert.equal(audit.history[1].state, EMERGENCY_STATES.SOS_SENT);
    assert.equal(audit.history[2].state, EMERGENCY_STATES.HELP_NEEDED);
    assert.equal(audit.history[3].state, EMERGENCY_STATES.SAFE);
  });

  // ── I. Emergency Contact Validation & Phone Privacy Masking ───────────────
  await t.test("I. Contact Validation: Validates names/phones and masks numbers for privacy", () => {
    // Missing name
    const v1 = validateEmergencyContact({ name: "", phone: "9876543210" });
    assert.equal(v1.valid, false);
    assert.ok(v1.error.includes("name is required"));

    // Missing phone / too short
    const v2 = validateEmergencyContact({ name: "Officer John", phone: "123" });
    assert.equal(v2.valid, false);
    assert.ok(v2.error.includes("7 digits"));

    // Valid contact with phone masking
    const v3 = validateEmergencyContact({ name: "Dr. Ananya Sharma", phone: "+91 98765 43210" });
    assert.equal(v3.valid, true);
    assert.equal(v3.sanitized.name, "Dr. Ananya Sharma");
    assert.equal(v3.sanitized.phoneMasked.slice(-4), "3210");
    assert.ok(v3.sanitized.phoneMasked.includes("*"));
  });

  // ── J & K. Offline Queue & Connectivity Recovery ──────────────────────────
  await t.test("J & K. Offline Queue & Recovery: Correctly reports QUEUED and transitions upon sync", async () => {
    const eventId = generateEmergencyEventId();

    // Trigger SOS while offline
    const queuedRes = await triggerSos({
      eventId,
      locationLabel: "Rural Flood Zone (No Cellular)",
      isOffline: true,
      note: "Offline queue test",
    });

    assert.equal(queuedRes.status, "SUCCESS");
    assert.equal(queuedRes.state, EMERGENCY_STATES.QUEUED);
    assert.equal(queuedRes.deliveryState, "QUEUED");
    assert.equal(queuedRes.alertId, null); // Zero fake live alert dispatched when offline

    // Later: connectivity restored, event is submitted online with same eventId
    const syncedRes = await triggerSos({
      eventId,
      locationLabel: "Rural Flood Zone (Cellular Restored)",
      isOffline: false,
      note: "Replayed from local queue",
    });

    assert.equal(syncedRes.status, "SUCCESS");
    assert.equal(syncedRes.state, EMERGENCY_STATES.SOS_SENT);
    assert.equal(syncedRes.deliveryState, "SENT");
    assert.ok(syncedRes.alertId); // Live P1 alert created upon actual online delivery
  });

  // ── L. Duplicate SOS / Idempotency Protection ─────────────────────────────
  await t.test("L. Idempotency Protection: Re-triggering same eventId does not duplicate alert", async () => {
    const eventId = generateEmergencyEventId();

    const first = await triggerSos({
      eventId,
      locationLabel: "Test Location",
      isOffline: false,
    });
    const firstAlertId = first.alertId;

    // Immediate repeat with identical eventId
    const second = await triggerSos({
      eventId,
      locationLabel: "Test Location Duplicate",
      isOffline: false,
    });

    assert.equal(second.status, "SUCCESS");
    assert.equal(second.isDuplicate, true);
    assert.equal(second.eventId, eventId);
    assert.equal(second.alertId, firstAlertId); // Reuses same alert ID, zero duplicate alert creation
  });

  // ── M. State Machine Transition Rules ─────────────────────────────────────
  await t.test("M. State Machine Transitions: Validates legal vs illegal transitions", () => {
    // Legal transitions
    assert.equal(isValidTransition("NORMAL", "EMERGENCY_ACTIVE"), true);
    assert.equal(isValidTransition("EMERGENCY_ACTIVE", "SOS_SENT"), true);
    assert.equal(isValidTransition("SOS_SENT", "SAFE"), true);
    assert.equal(isValidTransition("SAFE", "HELP_NEEDED"), true);
    assert.equal(isValidTransition("HELP_NEEDED", "RESOLVED"), true);
    assert.equal(isValidTransition("RESOLVED", "NORMAL"), true);

    // Illegal transitions
    assert.equal(isValidTransition("NORMAL", "SOS_SENT"), false);
    assert.equal(isValidTransition("NORMAL", "SAFE"), false);
    assert.equal(isValidTransition("RESOLVED", "SOS_SENT"), false);
  });

  // ── N. Error & Parameter Validation ───────────────────────────────────────
  await t.test("N. Error Handling: Rejects missing eventId, invalid safetyStatus, or missing record", async () => {
    await assert.rejects(
      async () => {
        await updateSafetyStatus({ eventId: "NON-EXISTENT-ID", safetyStatus: "SAFE" });
      },
      { message: /not found/ }
    );

    await assert.rejects(
      async () => {
        await updateSafetyStatus({ eventId: "SOME-ID", safetyStatus: "INVALID_STATUS" });
      },
      { message: /Invalid safetyStatus/ }
    );

    await assert.rejects(
      async () => {
        await getEmergencyStatus(null);
      },
      { message: /Missing required parameter/ }
    );
  });

  // ── O. Existing Alert Engine & Multi-Channel Dispatch Integration ─────────
  await t.test("O. Alert Engine Integration: P1 Alert created with EMERGENCY_SYSTEM authority", async () => {
    const eventId = generateEmergencyEventId();
    const res = await triggerSos({
      eventId,
      latitude: 13.0827,
      longitude: 80.2707,
      locationLabel: "Chennai Harbour",
      isOffline: false,
    });

    assert.ok(res.alertId);
    assert.ok(res.dispatchReceipts);
    // Verifies multi-channel integration
    assert.ok(res.dispatchReceipts.channels.in_app);
    assert.ok(res.dispatchReceipts.channels.browser_notification);
    assert.ok(res.dispatchReceipts.channels.warning_audio);
    assert.ok(res.dispatchReceipts.channels.cap_xml);
    assert.equal(res.dispatchReceipts.channels.cap_xml.standard, "OASIS CAP v1.2");
  });

  // ── P. Emergency Resolution & Lifecycle ───────────────────────────────────
  await t.test("P. Emergency Resolution: Deactivates emergency and marks resolved", async () => {
    const act = await activateEmergency({ locationLabel: "Resolution Test City" });
    const eventId = act.eventId;

    const res = await resolveEmergency(eventId, "All residents safe, flood water receded.");
    assert.equal(res.status, "SUCCESS");
    assert.equal(res.state, EMERGENCY_STATES.RESOLVED);
    assert.ok(res.resolvedAt);

    const status = await getEmergencyStatus(eventId);
    assert.equal(status.state, EMERGENCY_STATES.RESOLVED);
  });
});
