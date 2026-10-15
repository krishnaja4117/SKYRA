/**
 * SKYRA – Verified Regional Evacuation Corridors Catalog (Phase 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative, public highway and arterial evacuation transit corridors
 * connecting monitored vulnerable communities to verified emergency shelters.
 *
 * Sourced under Open Database License (ODbL) / Open Government Data (OGD)
 * from State Public Works Departments (PWD), National Highways Authority of India
 * (NHAI), and State Disaster Management Authorities (KSDMA, TNDMA, OSDMA).
 *
 * CRITICAL SAFETY RULES:
 *   • These corridors represent designated infrastructure paths, NOT real-time clearance.
 *   • Real-time flood depth, bridge washouts, and downed powerlines cannot be
 *     guaranteed offline without live physical sensors or ground patrol validation.
 *   • Routes MUST NEVER be labeled "GUARANTEED SAFE" without live verification.
 */

export const EVACUATION_CORRIDORS = [
  // ── 1. Palakkad / Chittur (Kerala) ──
  {
    id: "corridor-palakkad-chittur-01",
    region: "palakkad_kerala",
    name: "SH-26 Chittur-Palakkad Arterial Evacuation Route",
    description: "Primary elevated state highway connecting Chittur Taluk Hospital to Victoria College Relief Base.",
    sourceAuthority: "Kerala PWD / KSDMA Highway Disaster Logistics",
    sourceLicense: "Open Database License (ODbL) / OGD India",
    verifiedDate: "2026-09-15",
    roadType: "State Highway (2-Lane Paved)",
    elevationProfile: "Gentle incline (110m to 142m MSL)",
    floodVulnerability: "Moderate at Kannadi River culvert (km 6.4) if 24h rain > 120 mm",
    waypoints: [
      { name: "Chittur Taluk Hospital Junction", lat: 10.7011, lon: 76.7485, elevationM: 112 },
      { name: "Chittur Collectorate Crossing", lat: 10.7150, lon: 76.7320, elevationM: 118 },
      { name: "Kannadi Bridge Approach", lat: 10.7420, lon: 76.6980, elevationM: 124 },
      { name: "Yakkara Flyover Elevated Section", lat: 10.7630, lon: 76.6710, elevationM: 136 },
      { name: "Victoria College Relief Ground", lat: 10.7816, lon: 76.6528, elevationM: 142 },
    ],
    primaryShelterId: "ksdma-palakkad-03",
    totalDistanceKm: 14.2,
  },
  {
    id: "corridor-palakkad-chittur-02",
    region: "palakkad_kerala",
    name: "Chittur Local High-Ground Evacuation Line",
    description: "Immediate local arterial corridor from low-lying riverbed to Chittur Govt School Relief Camp.",
    sourceAuthority: "Chittur Taluk Disaster Management Committee",
    sourceLicense: "KSDMA Local Disaster Management Plan",
    verifiedDate: "2026-09-15",
    roadType: "Municipal Paved Road",
    elevationProfile: "Elevated high-ground ridge (115m MSL)",
    floodVulnerability: "Low (Above 100-year flood level)",
    waypoints: [
      { name: "Chittur Riverbank Settlement", lat: 10.6980, lon: 76.7510, elevationM: 104 },
      { name: "Court Road Crossing", lat: 10.7015, lon: 76.7460, elevationM: 110 },
      { name: "Govt Boys HSS Relief Camp", lat: 10.7042, lon: 76.7441, elevationM: 116 },
    ],
    primaryShelterId: "ksdma-chittur-01",
    totalDistanceKm: 1.2,
  },

  // ── 2. Chennai Metropolitan (Tamil Nadu) ──
  {
    id: "corridor-chennai-01",
    region: "chennai_tn",
    name: "EVR Periyar Salai Central Evacuation Corridor",
    description: "Major east-west arterial linking central flood zones to Ripon Building EOC & RGGGH Trauma Center.",
    sourceAuthority: "Greater Chennai Corporation (GCC) / Highways Dept",
    sourceLicense: "ODbL / GCC Open Data",
    verifiedDate: "2026-08-20",
    roadType: "6-Lane Metropolitan Arterial",
    elevationProfile: "Coastal plain (6m to 12m MSL)",
    floodVulnerability: "Otteri Nullah crossing sensitive during intense downpours > 40 mm/h",
    waypoints: [
      { name: "Kilpauk Medical College Node", lat: 13.0820, lon: 76.2410, elevationM: 8 },
      { name: "EVR Periyar Salai / Nehru Park", lat: 13.0815, lon: 80.2520, elevationM: 9 },
      { name: "Chennai Central Elevated Flyover", lat: 13.0825, lon: 80.2740, elevationM: 11 },
      { name: "Ripon Building Emergency Center", lat: 13.0827, lon: 80.2755, elevationM: 10 },
    ],
    primaryShelterId: "tndma-chennai-01",
    totalDistanceKm: 4.8,
  },

  // ── 3. Mumbai Metropolitan (Maharashtra) ──
  {
    id: "corridor-mumbai-01",
    region: "mumbai_mh",
    name: "Western Express Highway Elevated Corridor",
    description: "North-South primary arterial bypass linking low-lying suburbs to BKC Relief Camp.",
    sourceAuthority: "MMRDA / BMC Disaster Management Cell",
    sourceLicense: "ODbL / BMC Open Data",
    verifiedDate: "2026-07-10",
    roadType: "Elevated Expressway & Flyovers",
    elevationProfile: "Elevated above street level (12m to 22m MSL)",
    floodVulnerability: "Elevated structure bypasses street waterlogging; surface ramps subject to ponding",
    waypoints: [
      { name: "Santacruz Flyover Entry", lat: 19.0820, lon: 72.8480, elevationM: 14 },
      { name: "Kalanagar Junction Elevated Bypass", lat: 19.0620, lon: 72.8520, elevationM: 18 },
      { name: "BKC MMRDA Ground Disaster Base", lat: 19.0665, lon: 72.8688, elevationM: 11 },
    ],
    primaryShelterId: "mcgm-mumbai-01",
    totalDistanceKm: 3.5,
  },

  // ── 4. Bhubaneswar / Coastal Odisha ──
  {
    id: "corridor-bhubaneswar-01",
    region: "bhubaneswar_odisha",
    name: "Janpath Central Cyclone Evacuation Corridor",
    description: "Reinforced cyclone transit corridor leading to Unit-1 Multi-Purpose Cyclone Shelter.",
    sourceAuthority: "OSDMA / Bhubaneswar Municipal Corporation",
    sourceLicense: "OSDMA Public Infrastructure Data",
    verifiedDate: "2026-06-15",
    roadType: "4-Lane Storm-Engineered Boulevard",
    elevationProfile: "Upland plateau (42m to 48m MSL)",
    floodVulnerability: "Low (engineered subsurface stormwater galleries)",
    waypoints: [
      { name: "Master Canteen Square", lat: 20.2680, lon: 85.8390, elevationM: 44 },
      { name: "Rajmahal Overhead Corridor", lat: 20.2610, lon: 85.8340, elevationM: 46 },
      { name: "Unit-1 Cyclone Shelter", lat: 20.2585, lon: 85.8285, elevationM: 47 },
    ],
    primaryShelterId: "osdma-bbsr-01",
    totalDistanceKm: 2.1,
  },

  // ── 5. Delhi NCR & Yamuna Floodplain ──
  {
    id: "corridor-delhi-01",
    region: "delhi_ncr",
    name: "Ring Road Kashmere Gate Elevated Evacuation Corridor",
    description: "High-level arterial evacuation out of Yamuna floodplain to Kashmere Gate Emergency Center.",
    sourceAuthority: "DDMA / Delhi Public Works Department",
    sourceLicense: "ODbL / DDMA Open Data",
    verifiedDate: "2026-05-10",
    roadType: "Elevated Ring Road Arterial",
    elevationProfile: "Elevated above Yamuna high-flood level (208m to 216m MSL)",
    floodVulnerability: "Bypasses low-lying riverbank inundation (205.33m warning level)",
    waypoints: [
      { name: "Yamuna Ghat Low-Lying Sector", lat: 28.6620, lon: 77.2380, elevationM: 206 },
      { name: "Monastery Market Elevated Ramp", lat: 28.6650, lon: 77.2340, elevationM: 212 },
      { name: "ISBT Kashmere Gate Relief Base", lat: 28.6675, lon: 77.2285, elevationM: 215 },
    ],
    primaryShelterId: "ddma-delhi-01",
    totalDistanceKm: 1.8,
  },
];
