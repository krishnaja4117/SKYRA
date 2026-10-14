import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_CARDS, VERIFIED_HELPLINES, searchActionCards } from "../data/safetyKnowledgeBase.js";

test("Action Cards - Verifies all 6 core disaster action cards exist with complete phases", () => {
  assert.equal(ACTION_CARDS.length, 6);

  const categories = ACTION_CARDS.map((c) => c.category);
  assert.ok(categories.includes("flood"));
  assert.ok(categories.includes("landslide"));
  assert.ok(categories.includes("cyclone"));
  assert.ok(categories.includes("heatwave"));
  assert.ok(categories.includes("earthquake"));
  assert.ok(categories.includes("emergency_kit"));

  // Verify each card contains Before, During, and After steps
  for (const card of ACTION_CARDS) {
    assert.ok(card.phases.before.length >= 3, `${card.id} must have >= 3 before steps`);
    assert.ok(card.phases.during.length >= 3, `${card.id} must have >= 3 during steps`);
    assert.ok(card.phases.after.length >= 2, `${card.id} must have >= 2 after steps`);
    assert.ok(card.criticalDos.length >= 2, `${card.id} must have >= 2 critical dos`);
    assert.ok(card.criticalDonts.length >= 2, `${card.id} must have >= 2 critical donts`);
    assert.ok(card.source.includes("NDMA") || card.source.includes("IMD") || card.source.includes("GSI"));
    assert.ok(card.helplines.includes("112") || card.helplines.includes("1078"));
  }
});

test("Action Cards - Verified helplines contain essential national and state desks", () => {
  const numbers = VERIFIED_HELPLINES.map((h) => h.number);
  assert.ok(numbers.includes("112"), "112 National Emergency must be present");
  assert.ok(numbers.includes("1078"), "1078 NDMA helpline must be present");
  assert.ok(numbers.includes("1070"), "1070 SDMA helpline must be present");
  assert.ok(numbers.includes("1077"), "1077 DEOC helpline must be present");
  assert.ok(numbers.includes("108"), "108 Ambulance must be present");
  assert.ok(numbers.includes("101"), "101 Fire & Rescue must be present");
});

test("Action Cards - Search accurately returns matched SOPs", () => {
  // Flood search
  const floodSearch = searchActionCards("flash flood waterlogging");
  assert.equal(floodSearch.isFallback, false);
  assert.ok(floodSearch.cards.length >= 1);
  assert.equal(floodSearch.cards[0].category, "flood");

  // Landslide search
  const landslideSearch = searchActionCards("landslide slope failure cracks");
  assert.equal(landslideSearch.isFallback, false);
  assert.ok(landslideSearch.cards.length >= 1);
  assert.equal(landslideSearch.cards[0].category, "landslide");

  // Cyclone search
  const cycloneSearch = searchActionCards("eye of cyclone storm surge");
  assert.equal(cycloneSearch.isFallback, false);
  assert.ok(cycloneSearch.cards.length >= 1);
  assert.equal(cycloneSearch.cards[0].category, "cyclone");

  // Go-bag survival kit
  const kitSearch = searchActionCards("72 hour go bag rations");
  assert.equal(kitSearch.isFallback, false);
  assert.ok(kitSearch.cards.length >= 1);
  assert.equal(kitSearch.cards[0].category, "emergency_kit");
});

test("Action Cards - Unknown or unsupported query triggers safe fallback with official helplines (zero fabrication)", () => {
  const unknownSearch = searchActionCards("extraterrestrial meteor laser strike in antarctica");
  assert.equal(unknownSearch.isFallback, true);
  assert.equal(unknownSearch.cards.length, 0);
  assert.ok(unknownSearch.fallbackNotice.includes("No verified official NDMA/IMD disaster protocol was found"));
  assert.ok(unknownSearch.officialHelplines.length >= 4);
});
