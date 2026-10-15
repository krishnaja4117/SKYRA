const test = require("node:test");
const assert = require("node:assert/strict");

const {
  registerDeviceToken,
  unregisterDeviceToken,
  getRegisteredDevices,
  dispatchDisasterAlert,
  getNotificationServiceStatus,
  resetFcmState,
} = require("../services/fcmService");

test.beforeEach(() => {
  resetFcmState();
});

test("FCM Notification Service - Status reports clean initial state and mode", () => {
  const status = getNotificationServiceStatus();
  assert.equal(status.activeSubscriptions, 0);
  assert.equal(status.cooldownCount, 0);
  assert.ok(["LIVE", "DRY_RUN"].includes(status.mode));
});

test("FCM Notification Service - Register device validates token and stores location subscription", () => {
  // Missing token throws
  assert.throws(() => {
    registerDeviceToken({ token: "" });
  }, /valid, non-empty token/);

  // Valid registration with location
  const result = registerDeviceToken({
    token: "fcm_test_token_palakkad_01",
    platform: "android",
    location: {
      latitude: 10.7867,
      longitude: 76.6548,
      name: "Palakkad Home",
    },
    radiusKm: 30,
    tags: ["flood", "landslide"],
  });

  assert.equal(result.success, true);
  assert.equal(result.token, "fcm_test_token_palakkad_01");
  assert.equal(result.platform, "android");
  assert.equal(result.location.name, "Palakkad Home");

  const devices = getRegisteredDevices();
  assert.equal(devices.length, 1);
  assert.equal(devices[0].radiusKm, 30);
});

test("FCM Notification Service - Unregister device cleanly removes subscription", () => {
  registerDeviceToken({ token: "token_to_remove" });
  assert.equal(getRegisteredDevices().length, 1);

  const unreg = unregisterDeviceToken("token_to_remove");
  assert.equal(unreg.success, true);
  assert.equal(unreg.removed, true);
  assert.equal(getRegisteredDevices().length, 0);

  // Unregister non-existent token
  const unregNon = unregisterDeviceToken("random_nonexistent");
  assert.equal(unregNon.removed, false);
});

test("FCM Notification Service - Priority threshold: Skips P3 and P4 routine alerts", async () => {
  registerDeviceToken({ token: "test_token_priority" });

  const p3Result = await dispatchDisasterAlert({
    title: "Routine Forecast",
    body: "Mild breeze expected.",
    priority: "P3",
  });

  assert.equal(p3Result.status, "SKIPPED_LOW_PRIORITY");
  assert.equal(p3Result.dispatched, 0);

  const p4Result = await dispatchDisasterAlert({
    title: "Information",
    body: "Cloudy skies.",
    priority: "P4",
  });

  assert.equal(p4Result.status, "SKIPPED_LOW_PRIORITY");
});

test("FCM Notification Service - Geo-targeting: Dispatches to devices within radius, filters out distant devices", async () => {
  // Device 1: Subscribed to Palakkad (10.7867, 76.6548, 30 km radius)
  registerDeviceToken({
    token: "token_kerala_palakkad",
    location: { latitude: 10.7867, longitude: 76.6548 },
    radiusKm: 30,
  });

  // Device 2: Subscribed to Chennai (13.0827, 80.2707, 30 km radius)
  registerDeviceToken({
    token: "token_tamilnadu_chennai",
    location: { latitude: 13.0827, longitude: 80.2707 },
    radiusKm: 30,
  });

  // Alert in Chittur, Palakkad (10.7042, 76.7441) - ~13 km from Palakkad center, ~500 km from Chennai
  const dispatch = await dispatchDisasterAlert({
    id: "alert-chittur-flood-01",
    title: "Chittur Flash Flood Warning",
    body: "Rapid water rise in Kannadi river.",
    priority: "P1",
    hazard: "Flash Flood",
    latitude: 10.7042,
    longitude: 76.7441,
  });

  assert.equal(dispatch.status, "DISPATCHED");
  assert.equal(dispatch.matchedDevices, 1);
  assert.equal(dispatch.eligibleDevices, 1);
  assert.equal(dispatch.successCount, 1);
});

test("FCM Notification Service - Deduplication suppresses identical alert to same device within 30 min cooldown", async () => {
  registerDeviceToken({ token: "token_dedup_test" });

  // First dispatch succeeds
  const first = await dispatchDisasterAlert({
    id: "alert-dedup-01",
    title: "Emergency Warning",
    priority: "P2",
    hazard: "Severe Wind",
  });

  assert.equal(first.status, "DISPATCHED");
  assert.equal(first.successCount, 1);

  // Immediate second dispatch with identical ID & hazard is blocked by deduplication cooldown
  const second = await dispatchDisasterAlert({
    id: "alert-dedup-01",
    title: "Emergency Warning",
    priority: "P2",
    hazard: "Severe Wind",
  });

  assert.equal(second.status, "ALL_DEVICES_COOLDOWN_OR_UNMATCHED");
  assert.equal(second.eligibleTokens, 0);

  // Different alert ID triggers successfully
  const different = await dispatchDisasterAlert({
    id: "alert-new-different-02",
    title: "New Separate Hazard",
    priority: "P2",
    hazard: "Heavy Rainfall",
  });

  assert.equal(different.status, "DISPATCHED");
  assert.equal(different.successCount, 1);
});
