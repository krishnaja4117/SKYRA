// Mock data for Page 1 (Dashboard).
// Risk inputs are shared with the backend risk calculation.

export const mockDashboard = {
  riskInputs: {
    rainfall: 2,
    forecastRainfall: 20,
    humidity: 68,
    windSpeed: 12,
    terrainSlope: 3,
    historicalRisk: 40,
  },

  currentLocation: {
    name: 'Bhubaneswar, Odisha',
    area: 'Ward 15 · Near Khandagiri',
    coordinates: '20.2961° N, 85.8245° E',
  },

  savedLocation: {
    name: 'Home',
    address: 'Patia, Bhubaneswar',
  },

  weather: {
    condition: 'Partly Cloudy',
    temperature: 31,
    feelsLike: 34,
    humidity: 68,
    wind: '12 km/h NE',
    rainfall: '2 mm (last 3 hrs)',
    updatedAt: '2 minutes ago',
  },

  risk: {
    level: 'Moderate',
    score: 46,
    summary: 'Localized waterlogging risk. No evacuation advisory.',
    factors: [
      'Recent rainfall',
      'Urban drainage load',
      'River level: stable',
    ],
  },

  map: {
    areaLabel: 'Khandagiri · Bhubaneswar',

    why: [
      {
        factor: 'Urban drainage load',
        impact: '+18',
        detail:
          'Nayapalli storm drains are near capacity after recent showers.',
      },
      {
        factor: 'Recent rainfall',
        impact: '+12',
        detail:
          '2 mm in the last 3 hours over Ward 15 and adjoining low ground.',
      },
      {
        factor: 'Flood-prone pocket',
        impact: '+10',
        detail:
          'Gangua nala overflow risk remains localized, not city-wide.',
      },
      {
        factor: 'River / nala level',
        impact: '+4',
        detail:
          'Main channel is stable. No flood warning from control room.',
      },
      {
        factor: 'Open road access',
        impact: '−8',
        detail:
          'NH-16 and CRP Square remain passable for emergency movement.',
      },
    ],

    zones: [
      {
        id: 'low',
        level: 'Low',
        label: 'Khandagiri foothills',
        cx: 150,
        cy: 170,
        rx: 130,
        ry: 110,
      },
      {
        id: 'moderate',
        level: 'Moderate',
        label: 'Ward 15 residential',
        cx: 430,
        cy: 280,
        rx: 170,
        ry: 125,
      },
      {
        id: 'high',
        level: 'High',
        label: 'Nayapalli waterlogging',
        cx: 690,
        cy: 360,
        rx: 120,
        ry: 90,
      },
      {
        id: 'severe',
        level: 'Severe',
        label: 'Gangua nala pocket',
        cx: 780,
        cy: 430,
        rx: 58,
        ry: 46,
      },
    ],

    places: [
      {
        id: 'user',
        kind: 'user',
        name: 'You are here',
        detail: 'Ward 15 · Near Khandagiri',
        x: 410,
        y: 270,
      },
      {
        id: 'home',
        kind: 'home',
        name: 'Home (saved)',
        detail: 'Patia, Bhubaneswar',
        x: 760,
        y: 95,
      },
      {
        id: 'shelter',
        kind: 'shelter',
        name: 'Kalinga Stadium Relief Point',
        detail: 'Nearest shelter · Open',
        x: 560,
        y: 150,
      },
      {
        id: 'hospital',
        kind: 'hospital',
        name: 'Capital Hospital',
        detail: 'Emergency care · 2.1 km',
        x: 240,
        y: 360,
      },
      {
        id: 'flood',
        kind: 'flood',
        name: 'Flood-prone drain',
        detail: 'High waterlogging risk',
        x: 690,
        y: 355,
      },
      {
        id: 'road',
        kind: 'road',
        name: 'NH-16 corridor',
        detail: 'Open · moderate traffic',
        x: 330,
        y: 430,
      },
      {
        id: 'school',
        kind: 'place',
        name: 'CRP Square',
        detail: 'Key junction · clear',
        x: 500,
        y: 400,
      },
    ],
  },

  locationMonitoring: {
    status: 'Active',
    gps: 'Locked',
    lastPing: '1 min ago',
    accuracy: '±12 m',
  },

  emergencyMonitoring: {
    safetyStatus: 'Safe',
    alertCount: 0,
    nearestShelter: 'Kalinga Stadium Relief Point',
    hotline: '112',
  },
};