/**
 * SKYRA – Verified Disaster Safety Knowledge Base (Phase 5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative, NDMA & IMD aligned safety guidance for offline consultation
 * during extreme weather events, flash floods, landslides, and cyclones.
 */

export const SAFETY_CORPUS_VERSION = "2.1.0";

export const VERIFIED_HELPLINES = [
  { service: "National Emergency Helpline", number: "112", description: "Single unified emergency number for Police, Fire, and Ambulance across India." },
  { service: "NDMA Disaster Helpline", number: "1078", description: "National Disaster Management Authority round-the-clock emergency desk." },
  { service: "State Disaster Management (SDMA)", number: "1070", description: "State Emergency Operations Centre (SEOC) toll-free line." },
  { service: "District Emergency Operations (DEOC)", number: "1077", description: "District-level control room for local rescue and relief coordination." },
  { service: "Emergency Ambulance Service", number: "108", description: "Toll-free emergency medical transit and paramedical assistance." },
  { service: "Fire & Rescue Service", number: "101", description: "Firefighting, flood rescue, and structural extrication." },
];

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
