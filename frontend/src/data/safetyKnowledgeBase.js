/**
 * SKYRA – Verified Disaster Safety Knowledge Base & Action Cards (Phase 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative, NDMA & IMD aligned safety instructions for offline consultation
 * during floods, landslides, cyclones, heatwaves, earthquakes, and emergencies.
 *
 * Sourced directly from National Disaster Management Authority (NDMA) standard
 * operating procedures and India Meteorological Department (IMD) warning protocols.
 */

export const SAFETY_CORPUS_VERSION = "2.2.0";

export const SAFETY_TOPICS = {
  flood: {
    title: "Flood & Flash Flood Safety SOP",
    keywords: ["flood", "flooding", "waterlogging", "submerged", "inundation", "overflow", "dam", "drowning", "river", "deluge"],
    guidelines: [
      "Do NOT walk, swim, or drive through moving water. 15 cm of fast-moving water can knock an adult down, and 30 cm can carry away a vehicle (Turn Around, Don't Drown).",
      "Immediately move to higher ground or upper floors if water levels begin rising. Do not wait for an official evacuation order if in low-lying riverbeds.",
      "Switch off main electrical breakers and gas cylinders before evacuating to prevent electrocution and explosive leaks.",
      "Never touch fallen power lines or electrical equipment standing in floodwaters.",
      "Drink only boiled, chlorinated, or sealed bottled water. Flood waters carry dangerous bacterial pathogens and sewage contamination.",
      "Keep your 72-hour emergency survival bag, dry food, whistle, and mobile phone sealed in waterproof bags.",
    ],
    source: "NDMA Standard Operating Procedure for Flood Management",
  },
  landslide: {
    title: "Landslide & Slope Debris Flow Safety SOP",
    keywords: ["landslide", "mudslide", "slope", "hill", "debris", "mountain", "rockfall", "slip", "slump", "creek"],
    guidelines: [
      "Watch for early warning signs: new cracks in ground or plaster, doors/windows jamming, leaning utility poles, or sudden muddy stream discharges.",
      "If you suspect imminent slope failure, evacuate immediately uphill or away from the direct path of the flow. Do not cross the channel.",
      "Stay awake and alert during intense, prolonged rainfall (especially > 100 mm in 24 hours). Many landslide casualties occur when people are sleeping.",
      "Never seek shelter in hollows or river valleys directly downstream of steep unstable hill slopes.",
      "Listen for unusual rumbling sounds, breaking trees, or boulder collisions, which indicate advancing debris flow.",
    ],
    source: "Geological Survey of India (GSI) & NDMA Landslide Guidelines",
  },
  cyclone: {
    title: "Cyclone & High-Velocity Wind Safety SOP",
    keywords: ["cyclone", "storm", "hurricane", "typhoon", "gale", "tempest", "wind", "gust", "storm surge"],
    guidelines: [
      "Secure or bring indoors all loose objects (sheet metal, signage, potted plants) that could become deadly flying missiles in strong winds.",
      "Stay indoors in the strongest part of your house (interior rooms without windows) until the storm officially passes.",
      "Beware the 'Eye of the Cyclone': if winds suddenly die down, do NOT go outside. The second half of the storm with reverse winds will follow shortly.",
      "Stay away from coastlines and low-lying coastal areas to avoid fatal storm surges (often 3 to 6 meters high).",
      "Keep battery-powered torches, radios, and emergency batteries charged and ready.",
    ],
    source: "India Meteorological Department (IMD) Cyclone Warning Protocol",
  },
  emergency_kit: {
    title: "72-Hour Disaster Preparedness Survival Kit",
    keywords: ["kit", "bag", "supplies", "survival", "prepare", "emergency bag", "go bag", "rations", "flashlight", "torch"],
    guidelines: [
      "Water: At least 3 liters of potable drinking water per person per day for a minimum of 3 days.",
      "Food: Non-perishable, ready-to-eat items (biscuits, energy bars, dry fruits, roasted grams, canned goods).",
      "First Aid: Antiseptic lotion, sterile gauze, bandages, rehydration salts (ORS), paracetamol, and a 7-day supply of personal prescription medications.",
      "Tools: Waterproof LED torch, spare alkaline batteries, multi-tool knife, emergency signaling whistle, and a power bank.",
      "Documents: Aadhaar, ration card, insurance papers, and emergency cash stored in a sealed heavy-duty ziplock bag.",
      "Hygiene: Hand sanitizer, sanitary napkins, masks, matches/lighter in a waterproof pouch.",
    ],
    source: "NDMA Community Emergency Preparedness Standard",
  },
  heatwave: {
    title: "Heatwave & Hyperthermia Prevention SOP",
    keywords: ["heat", "heatwave", "sunstroke", "dehydration", "hyperthermia", "hot", "scorching"],
    guidelines: [
      "Avoid direct sun exposure between 12:00 PM and 3:30 PM.",
      "Drink sufficient water and oral rehydration solutions (ORS, lemon water, buttermilk), even if not feeling thirsty.",
      "Wear lightweight, light-colored, loose, and breathable cotton clothing.",
      "Never leave children, elderly family members, or pets in closed parked vehicles.",
      "If someone exhibits signs of heatstroke (high body temperature, absence of sweating, confusion, nausea), immediately move them to a shaded area, apply wet towels, and call 108 or 112.",
    ],
    source: "NDMA National Guidelines for Preparation of Action Plan - Prevention and Management of Heat Wave",
  },
};

export const VERIFIED_HELPLINES = [
  { service: "National Emergency Helpline", number: "112", description: "Single unified emergency number for Police, Fire, and Ambulance across India.", badge: "All-Emergency" },
  { service: "NDMA Disaster Helpline", number: "1078", description: "National Disaster Management Authority round-the-clock emergency desk.", badge: "National" },
  { service: "State Disaster Management (SDMA)", number: "1070", description: "State Emergency Operations Centre (SEOC) toll-free line.", badge: "State" },
  { service: "District Emergency Operations (DEOC)", number: "1077", description: "District-level control room for local rescue and relief coordination.", badge: "District" },
  { service: "Emergency Ambulance Service", number: "108", description: "Toll-free emergency medical transit and paramedical assistance.", badge: "Medical" },
  { service: "Fire & Rescue Service", number: "101", description: "Firefighting, flood rescue, and structural extrication.", badge: "Rescue" },
];

export const ACTION_CARDS = [
  // ── 1. FLOOD & FLASH FLOOD ──
  {
    id: "card_flood",
    category: "flood",
    title: "Flood & Flash Flood Safety SOP",
    tagline: "Turn Around, Don't Drown · Rapid Inundation Protocol",
    icon: "🌊",
    severity: "High",
    source: "NDMA Standard Operating Procedure for Flood Management (Rev 4)",
    lastVerified: "2026-10",
    keywords: ["flood", "flooding", "waterlogging", "submerged", "inundation", "overflow", "dam", "drowning", "river", "deluge", "flash flood"],
    helplines: ["112", "1078", "1077", "101"],
    phases: {
      before: [
        "Identify high-ground evacuation routes and local multi-purpose relief centers in your neighborhood.",
        "Seal essential legal papers (Aadhaar, property deed, insurance) and emergency cash in heavy-duty waterproof ziplock bags.",
        "Prepare your 72-hour survival go-bag: 3 liters drinking water per person/day, non-perishable food, torch, and medicines.",
        "Clear internal and courtyard rainwater drains; install non-return drainage valves on toilets to prevent sewer backflow.",
      ],
      during: [
        "Do NOT walk, swim, or drive through moving water. Just 15 cm of fast-moving water can knock an adult down, and 30 cm can float a vehicle.",
        "Switch off main household electrical breaker and LPG gas cylinder valves immediately before evacuating.",
        "Move to upper floors or high ground immediately if river or drainage levels surge. Do not wait for an official order if in low-lying riverbeds.",
        "Never touch fallen power lines, metal poles, or electrical equipment standing in floodwaters (risk of lethal electrocution).",
        "If trapped inside a building by rapidly rising water, move to the roof only if necessary; signal for help with a whistle, bright cloth, or flashlight.",
      ],
      after: [
        "Drink ONLY boiled, chlorinated, or sealed bottled water. Floodwaters carry severe bacterial pathogens, leptospirosis, and cholera.",
        "Do NOT turn on electrical appliances or main breakers until a certified electrician inspects internal wiring for moisture short-circuits.",
        "Watch out for venomous snakes, scorpions, and rodents that seek dry refuge in elevated corners, cupboards, and attics.",
        "Disinfect all flooded floors and walls with a diluted bleach solution (1 part bleach to 9 parts water).",
      ],
    },
    criticalDos: [
      "Keep phone in battery saver mode and use SMS/messaging instead of voice calls to preserve network bandwidth.",
      "Listen to battery-operated radio or local administration broadcast for shelter opening notices.",
      "Help children, elderly neighbors, and persons with disabilities evacuate first.",
    ],
    criticalDonts: [
      "NEVER drive through submerged bridges or low-water crossings.",
      "Do NOT eat food that has come into direct contact with floodwaters.",
      "Do NOT spread unverified panic rumors on social media.",
    ],
  },

  // ── 2. LANDSLIDE & DEBRIS FLOW ──
  {
    id: "card_landslide",
    category: "landslide",
    title: "Landslide & Slope Debris Flow Safety SOP",
    tagline: "Early Warning Recognition & Slope Hazard Clearance",
    icon: "⛰️",
    severity: "Severe",
    source: "Geological Survey of India (GSI) & NDMA Landslide Guidelines",
    lastVerified: "2026-10",
    keywords: ["landslide", "mudslide", "slope", "hill", "debris", "mountain", "rockfall", "slip", "slump", "creek", "mudflow"],
    helplines: ["112", "1078", "1077", "108"],
    phases: {
      before: [
        "Watch for early warning signs: new ground cracks, doors/windows jamming tightly, leaning fences or utility poles.",
        "Notice sudden changes in spring discharges, such as clear mountain streams turning suddenly muddy or volume abruptly dropping (indicates upstream blockage).",
        "Avoid building, excavating, or clearing vegetation on slopes steeper than 15 degrees without professional geotechnical engineering.",
        "Familiarize yourself with designated community safe havens located on ridge lines rather than ravine outlets.",
      ],
      during: [
        "If you suspect imminent slope failure, evacuate immediately uphill or sideways away from the direct channel path. Never run downhill.",
        "Listen for unusual sounds: cracking trees, rolling boulder collisions, or a deep rumbling freight-train roar.",
        "Stay awake and vigilant during intense, prolonged rainfall (> 100 mm in 24 hours), especially at night when most casualties occur.",
        "If escape is impossible, curl into a tight fetal ball and protect your head and neck with your arms, backpack, or a mattress.",
      ],
      after: [
        "Stay away from the landslide slide zone. Secondary and tertiary slides often follow initial failures within hours or days.",
        "Check for injured or trapped persons around the perimeter without directly entering the unstable slide debris path.",
        "Report broken gas pipes, severed electrical cables, and damaged road surfaces immediately to 112 or local emergency desks.",
        "Inspect foundation walls, chimneys, and surrounding ground for structural dislocation before re-occupying.",
      ],
    },
    criticalDos: [
      "Evacuate perpendicular (sideways) to the direction of debris flow.",
      "Cooperate with local disaster management teams and follow evacuation advisories promptly.",
      "Notify neighbors downhill if you detect an upstream slope collapse.",
    ],
    criticalDonts: [
      "Do NOT cross swollen mountain streams or debris flow gullies.",
      "Do NOT seek shelter in hollows, valleys, or ravine outlets during heavy downpours.",
      "Do NOT excavate toe of an unstable slope to clear a blocked driveway without stabilization.",
    ],
  },

  // ── 3. CYCLONE & HIGH-VELOCITY GALES ──
  {
    id: "card_cyclone",
    category: "cyclone",
    title: "Cyclone & High-Velocity Wind Safety SOP",
    tagline: "Structure Hardening & Eye-of-the-Storm Awareness",
    icon: "🌀",
    severity: "Severe",
    source: "India Meteorological Department (IMD) Cyclone Warning Protocol",
    lastVerified: "2026-10",
    keywords: ["cyclone", "storm", "hurricane", "typhoon", "gale", "tempest", "wind", "gust", "storm surge", "cyclonic"],
    helplines: ["112", "1078", "1070", "108"],
    phases: {
      before: [
        "Trim dead tree branches and weak limbs close to houses to prevent roof crushing and electrical wire damage.",
        "Secure or move indoors loose items: corrugated tin sheets, signage, potted plants, garbage bins, which turn into lethal airborne missiles in 100+ km/h winds.",
        "Board up or tape glass window panes with heavy-duty masking tape in cross/X patterns to prevent shattering.",
        "Charge mobile phones, power banks, emergency lanterns, and maintain spare alkaline radio batteries.",
      ],
      during: [
        "Stay indoors in the strongest, central room of your house (interior bathroom or hallway) away from all windows and glass doors.",
        "Beware the 'Eye of the Cyclone': if high winds suddenly drop to dead calm, do NOT step outside. The second half of the storm with reverse winds will hit abruptly.",
        "Keep away from sea beaches and low-lying coastal zones to avoid fatal storm surges (often 3 to 6 meters high).",
        "Disconnect all sensitive electronic appliances and turn off main gas cylinders.",
      ],
      after: [
        "Remain indoors until the official all-clear is announced by the IMD or local disaster authority.",
        "Beware of dangling or fallen high-voltage cables; report downed poles immediately to 112 / Electricity board.",
        "Avoid eating exposed wet food; clean all water containers before refilling.",
        "Drive only if absolutely essential; watch for washed-out bridges, fallen trees, and compromised roads.",
      ],
    },
    criticalDos: [
      "Keep battery-powered radio tuned to official All India Radio / IMD bulletins.",
      "Store sufficient potable water (at least 3 days) as municipal piped water is often contaminated post-landfall.",
      "Stay grounded inside an interior room until the full storm passes.",
    ],
    criticalDonts: [
      "Do NOT go outside when the calm 'eye' of the storm passes overhead.",
      "Do NOT touch loose or fallen electrical wires under any circumstances.",
      "Do NOT venture out to the beach to take photos or watch storm surges.",
    ],
  },

  // ── 4. HEATWAVE & HYPERTHERMIA ──
  {
    id: "card_heatwave",
    category: "heatwave",
    title: "Severe Heatwave & Hyperthermia Prevention SOP",
    tagline: "Hydration Regimen & Heatstroke Emergency Response",
    icon: "☀️",
    severity: "Moderate",
    source: "NDMA National Guidelines for Preparation of Action Plan - Prevention and Management of Heat Wave",
    lastVerified: "2026-10",
    keywords: ["heat", "heatwave", "sunstroke", "dehydration", "hyperthermia", "hot", "scorching", "loo", "temperature"],
    helplines: ["112", "108", "1078"],
    phases: {
      before: [
        "Stock up on Oral Rehydration Salts (ORS), electrolyte powders, lemon, cumin (jeera), and buttermilk ingredients.",
        "Keep homes cool: use white curtains, reflective window blinds, and open cross-ventilation during cool nighttime hours.",
        "Reschedule heavy outdoor manual labor, sports, and construction activities to cooler early morning (before 10:00 AM) or evening hours.",
      ],
      during: [
        "Avoid direct sun exposure between 12:00 PM and 3:30 PM (peak solar ultraviolet and thermal intensity).",
        "Drink water frequently, even if you do not feel thirsty. Supplement with ORS, coconut water, lemon water, and lassi.",
        "Wear lightweight, light-colored, loose, and breathable cotton clothing. Protect head and eyes with a wide-brimmed hat, umbrella, or cloth.",
        "NEVER leave infants, young children, elderly adults, or domestic pets inside locked, parked cars (interior temperatures exceed 60°C within 15 minutes).",
      ],
      after: [
        "Recognize heatstroke symptoms: core body temp > 40°C, absence of sweating with hot dry red skin, confusion, rapid pulse, dizziness, nausea.",
        "Heatstroke Emergency First Aid: Move victim immediately to shaded/air-conditioned area, apply wet towels or ice packs to neck, armpits, and groin, fan vigorously, and call 108 / 112 immediately.",
        "Do NOT give fluids to an unconscious or disoriented person (choking hazard).",
      ],
    },
    criticalDos: [
      "Carry a water bottle whenever stepping out.",
      "Place shallow water bowls in shaded areas for birds and stray animals.",
      "Take cool showers and rest in shaded well-ventilated areas.",
    ],
    criticalDonts: [
      "Do NOT consume alcohol, heavily caffeinated energy drinks, or carbonated soft drinks (accelerates dehydration).",
      "Do NOT skip meals; eat small, light, frequent meals rich in water content (cucumber, watermelon, gourds).",
      "Do NOT exert yourself during peak afternoon hours.",
    ],
  },

  // ── 5. EARTHQUAKE & STRUCTURAL SHAKING ──
  {
    id: "card_earthquake",
    category: "earthquake",
    title: "Earthquake & Structural Shaking Safety SOP",
    tagline: "Drop, Cover, and Hold On · Structural Protection",
    icon: "🏚️",
    severity: "Severe",
    source: "NDMA National Disaster Management Guidelines - Management of Earthquakes",
    lastVerified: "2026-10",
    keywords: ["earthquake", "quake", "tremor", "shake", "shaking", "seismic", "fault", "structural", "collapse", "aftershock"],
    helplines: ["112", "1078", "1077", "101"],
    phases: {
      before: [
        "Fasten heavy furniture, bookshelves, and water heaters firmly to wall studs with L-brackets.",
        "Store heavy and breakable objects on lower shelves rather than overhead cabinets.",
        "Identify safe drop spots in every room: under sturdy wooden desks/tables or against interior load-bearing walls.",
        "Conduct regular family earthquake drills: practice the 'Drop, Cover, and Hold On' drill.",
      ],
      during: [
        "DROP down onto your hands and knees. This position protects you from being knocked over by sudden ground heave.",
        "COVER your head and neck under a sturdy table or desk. If no shelter is nearby, drop next to an interior wall.",
        "HOLD ON to your shelter until the shaking stops completely. Be prepared for the shelter to shift.",
        "If in bed, stay in bed; curl over and protect your head with pillows.",
        "If outdoors, move immediately to an open area away from buildings, overhead power lines, chimneys, and billboards.",
        "If inside a moving car, pull over safely away from flyovers, overpasses, and utility poles; remain inside until shaking ceases.",
      ],
      after: [
        "Expect aftershocks. Each aftershock can bring down already weakened structures; apply 'Drop, Cover, Hold' whenever shaking resumes.",
        "Check for gas leaks: if you smell gas or hear a hissing noise, open windows and evacuate immediately. Do NOT use matches or light switches.",
        "Inspect electrical wiring and water pipes for damage before using them.",
        "Do NOT use elevators; always take stairways, watching for displaced concrete steps or cracked landings.",
      ],
    },
    criticalDos: [
      "Drop to your knees and protect your head immediately.",
      "Extinguish all open flames, gas stoves, and candles immediately after shaking stops.",
      "Wear sturdy shoes when moving through broken glass and plaster debris.",
    ],
    criticalDonts: [
      "Do NOT rush outside during shaking (most injuries occur from falling exterior masonry and glass).",
      "Do NOT stand in doorways unless you know they are strongly supported and load-bearing.",
      "Do NOT light matches, candles, or lighters until sure there are no flammable gas leaks.",
    ],
  },

  // ── 6. 72-HOUR SURVIVAL GO-BAG ──
  {
    id: "card_emergency_kit",
    category: "emergency_kit",
    title: "72-Hour Disaster Preparedness Survival Kit",
    tagline: "Lifesaving Essentials for 3 Days of Total Self-Sufficiency",
    icon: "🎒",
    severity: "Routine",
    source: "NDMA Community Emergency Preparedness Standard",
    lastVerified: "2026-10",
    keywords: ["kit", "bag", "supplies", "survival", "prepare", "emergency bag", "go bag", "rations", "flashlight", "torch", "first aid"],
    helplines: ["112", "1078"],
    phases: {
      before: [
        "Water: Minimum 3 liters of potable drinking water per person per day for at least 3 days (9 liters per person total).",
        "Food: Non-perishable, ready-to-eat rations requiring zero cooking or water (energy bars, roasted nuts, dry fruits, biscuits, canned goods, ORS).",
        "First Aid & Medicines: Sterile gauze, bandages, antiseptic solution (Povidone Iodine), pain relievers, blister plasters, and a minimum 7-day reserve of essential daily prescription drugs.",
        "Lighting & Power: High-output waterproof LED torch, spare alkaline batteries, a high-capacity power bank with charging cables, and an emergency signaling whistle.",
        "Documents: Aadhaar cards, voter IDs, ration cards, property documents, medical records, and emergency cash in small denominations sealed in waterproof ziplock bags.",
        "Sanitation & Warmth: Hand sanitizer, wet wipes, masks, sanitary napkins, toothbrush, soap, a lightweight thermal mylar foil blanket, and sturdy rain ponchos.",
      ],
      during: [
        "Keep the survival kit within arm's reach near your primary exit door.",
        "If instructed to evacuate, grab your go-bag and proceed immediately to the nearest high-ground relief shelter.",
        "Do not overload yourself with heavy non-essential possessions; prioritize water, medicine, and warm clothing.",
      ],
      after: [
        "Replenish consumed items immediately after returning home or reaching safe recovery.",
        "Check expiration dates of food, water, and medicines every 6 months (align with Daylight Saving or monsoon start dates).",
      ],
    },
    criticalDos: [
      "Keep go-bag in an accessible location known to all family members.",
      "Store family emergency contact numbers written on waterproof paper inside the kit.",
      "Include special supplies for infants (milk powder, diapers) and elderly family members.",
    ],
    criticalDonts: [
      "Do NOT pack heavy glass containers or perishable dairy/meat.",
      "Do NOT leave rechargeable batteries completely uncharged for months.",
      "Do NOT store prescription medicines in hot, unventilated attics.",
    ],
  },
];

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "into", "during", "after", "before", "over", "under", "about", "this", "that", "what", "how", "when", "where", "why", "who", "which"]);

/**
 * Fast, client-side token search for action cards.
 * Returns matching cards or an honest fallback notice.
 */
export function searchActionCards(query = "") {
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    return {
      query: "",
      totalMatches: ACTION_CARDS.length,
      cards: ACTION_CARDS,
      isFallback: false,
    };
  }

  const rawTokens = q.split(/[^a-z0-9]+/i).filter(Boolean);
  const tokens = rawTokens.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

  if (tokens.length === 0) {
    return {
      query: q,
      totalMatches: 0,
      cards: [],
      isFallback: true,
      fallbackNotice: `No verified official NDMA/IMD disaster protocol was found for '${query}'. To prevent dangerous hallucinations during emergencies, SKYRA only displays authenticated civil defense protocols. Please consult the National Emergency Helpline (112) or NDMA (1078) for specialized assistance.`,
      officialHelplines: VERIFIED_HELPLINES,
    };
  }

  const scoredCards = ACTION_CARDS.map((card) => {
    let score = 0;
    const titleLower = card.title.toLowerCase();
    const taglineLower = card.tagline.toLowerCase();
    const categoryLower = card.category.toLowerCase();

    tokens.forEach((t) => {
      if (titleLower.includes(t)) score += 10;
      if (taglineLower.includes(t)) score += 5;
      if (categoryLower === t || categoryLower.includes(t)) score += 8;
      if (card.keywords.some((k) => k === t || (t.length >= 4 && k.includes(t)))) score += 6;
      if (card.phases.before.some((p) => p.toLowerCase().includes(t))) score += 1;
      if (card.phases.during.some((p) => p.toLowerCase().includes(t))) score += 2;
      if (card.phases.after.some((p) => p.toLowerCase().includes(t))) score += 1;
    });

    return { card, score };
  });

  const matched = scoredCards
    .filter((sc) => sc.score >= 5) // Requires at least one significant token match
    .sort((a, b) => b.score - a.score)
    .map((sc) => sc.card);

  if (matched.length > 0) {
    return {
      query: q,
      totalMatches: matched.length,
      cards: matched,
      isFallback: false,
    };
  }

  // Safe fallback when requested topic is not covered in verified NDMA guidelines
  return {
    query: q,
    totalMatches: 0,
    cards: [],
    isFallback: true,
    fallbackNotice: `No verified official NDMA/IMD disaster protocol was found for '${query}'. To prevent dangerous hallucinations during emergencies, SKYRA only displays authenticated civil defense protocols. Please consult the National Emergency Helpline (112) or NDMA (1078) for specialized assistance.`,
    officialHelplines: VERIFIED_HELPLINES,
  };
}
