import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLocationHierarchy,
  formatLocationString,
  formatDashboardTopRightLocation,
  reverseGeocode,
  clearReverseGeocodeCache,
  DEMO_FALLBACK_LOCATION,
  LOCATION_UNAVAILABLE,
} from "./locationService.js";

test("formatLocationHierarchy: Full address format (City/Town, District, State, Country)", () => {
  const addr = {
    town: "Chittur",
    state_district: "Palakkad",
    state: "Kerala",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatLocationHierarchy: Suburb preference with compound town (Chittur & Chittur-Thathamangalam)", () => {
  const addr = {
    suburb: "Chittur",
    town: "Chittur-Thathamangalam",
    state_district: "Palakkad",
    state: "Kerala",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatLocationHierarchy: Locality equal to district deduplication (Chennai, Chennai)", () => {
  const addr = {
    city: "Chennai",
    state_district: "Chennai",
    state: "Tamil Nadu",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Chennai, Tamil Nadu, India");
});

test("formatLocationHierarchy: Missing district field (Bengaluru, Karnataka)", () => {
  const addr = {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Bengaluru, Karnataka, India");
});

test("formatLocationHierarchy: Missing city/town field, village present (Alathur, Palakkad)", () => {
  const addr = {
    village: "Alathur",
    district: "Palakkad",
    state: "Kerala",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Alathur, Palakkad, Kerala, India");
});

test("formatLocationHierarchy: Missing city and town, only district and state present", () => {
  const addr = {
    state_district: "Palakkad",
    state: "Kerala",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Palakkad, Kerala, India");
});

test("formatLocationHierarchy: Missing country field inferred from country_code", () => {
  const addr = {
    city: "Kochi",
    state_district: "Ernakulam",
    state: "Kerala",
    country_code: "in",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Kochi, Ernakulam, Kerala, India");
});

test("formatLocationHierarchy: Strip redundant 'District' suffix from district name", () => {
  const addr = {
    town: "Chittur",
    district: "Palakkad District",
    state: "Kerala",
    country: "India",
  };
  const result = formatLocationHierarchy(addr);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatLocationHierarchy: Graceful handling of null/empty/invalid input", () => {
  assert.equal(formatLocationHierarchy(null), "");
  assert.equal(formatLocationHierarchy(undefined), "");
  assert.equal(formatLocationHierarchy({}), "");
  assert.equal(formatLocationHierarchy("not an object"), "");
});

test("formatLocationString: Normalizes string without country by adding India", () => {
  const input = "Chittur, Palakkad, Kerala";
  const result = formatLocationString(input);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatLocationString: Preserves string that already has country", () => {
  const input = "Chittur, Palakkad, Kerala, India";
  const result = formatLocationString(input);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatLocationString: Strips pin icons and demo tags", () => {
  const input = "📍 Chittur, Palakkad, Kerala (DEMO fallback)";
  const result = formatLocationString(input);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatLocationString: Preserves status messages as-is", () => {
  assert.equal(formatLocationString("Detecting current location…"), "Detecting current location…");
  assert.equal(formatLocationString("Location unavailable"), "Location unavailable");
  assert.equal(formatLocationString("Location permission required"), "Location permission required");
});

test("formatDashboardTopRightLocation: Formats structured object with City/Town, District, State, Country", () => {
  const loc = {
    city: "Chittur",
    district: "Palakkad",
    state: "Kerala",
    country: "India",
  };
  const result = formatDashboardTopRightLocation(loc);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatDashboardTopRightLocation: Formats structured object with missing district", () => {
  const loc = {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
  };
  const result = formatDashboardTopRightLocation(loc);
  assert.equal(result, "Bengaluru, Karnataka, India");
});

test("formatDashboardTopRightLocation: Formats object with name property", () => {
  const loc = {
    name: "Chittur, Palakkad, Kerala",
  };
  const result = formatDashboardTopRightLocation(loc);
  assert.equal(result, "Chittur, Palakkad, Kerala, India");
});

test("formatDashboardTopRightLocation: Handles null or undefined gracefully", () => {
  assert.equal(formatDashboardTopRightLocation(null), "Location unavailable");
  assert.equal(formatDashboardTopRightLocation(undefined), "Location unavailable");
});

test("formatDashboardTopRightLocation: Passes through status strings without alteration", () => {
  assert.equal(formatDashboardTopRightLocation("Detecting current location…"), "Detecting current location…");
  assert.equal(formatDashboardTopRightLocation("Location unavailable"), "Location unavailable");
  assert.equal(formatDashboardTopRightLocation("Location permission required"), "Location permission required");
});

test("reverseGeocode: Rejects non-finite/null coordinates without throwing", async () => {
  const result = await reverseGeocode(null, undefined);
  assert.equal(result.city, null);
  assert.equal(result.displayName, "Location unavailable");
});

test("reverseGeocode: In-memory cache returns cached result on repeat calls", async () => {
  clearReverseGeocodeCache();

  // Test caching by setting a known mock in cache
  const lat = 10.7089;
  const lon = 76.7479;

  // First call may hit network or mock
  const res1 = await reverseGeocode(lat, lon);
  assert.ok(res1);
  assert.ok(res1.displayName);

  // Second call must return cached result
  const res2 = await reverseGeocode(lat, lon);
  assert.deepEqual(res1, res2);
});

test("Location constants: DEMO and UNAVAILABLE have valid structures", () => {
  assert.equal(DEMO_FALLBACK_LOCATION.country, "India");
  assert.equal(DEMO_FALLBACK_LOCATION.city, "Bhubaneswar");
  assert.equal(DEMO_FALLBACK_LOCATION.district, "Khordha");
  assert.equal(LOCATION_UNAVAILABLE.displayName, "Location Unavailable");
  assert.equal(LOCATION_UNAVAILABLE.latitude, null);
});
