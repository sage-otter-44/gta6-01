// Solmar Bay: every tuning number, colour and map constant in one place.
// The city is a fixed 2560x1920 world; the renderer shows a 1280x720 window of it.

export const WORLD = { width: 2560, height: 1920 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

/** Street centrelines. Avenues run north-south, streets east-west, each 96 wide. */
export const AVENUES = [320, 800, 1280, 1760, 2240];
export const STREETS = [300, 700, 1100, 1500];
export const ROAD_W = 96;
/** The bay: water starts here and runs to the south edge; sand just above it. */
export const WATER_Y = 1760;
export const SAND_Y = 1680;
/** The port district (east edge, containers and docks). */
export const PORT = { x: 2240, y: 300, w: 320, h: 400 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 265,
  runSpeed: 330,
  health: 100,
  regenDelay: 5,
  regenRate: 4,
  shootRange: 330,
  shootDamage: 34,
  shootCooldown: 0.28,
  punchDamage: 20,
  punchRange: 46,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 160,
  steer: 2.6,
  grip: 6.5,
  health: 100,
  enterRange: 64,
};

export const TRAFFIC = {
  count: 14,
  cruise: 150,
  maxSpeed: 190,
  colors: ['#c0392b', '#2980b9', '#f39c12', '#7f8c8d', '#8e44ad', '#16a085', '#dfe6e9'],
};

export const PED = {
  count: 22,
  walkSpeed: 55,
  fleeSpeed: 150,
  radius: 9,
};

export const POLICE = {
  maxActive: 4,
  cruise: 300,
  chaseSpeed: 480,
  ramDamage: 14,
  bustRange: 42,
  bustTime: 1.2,
  spawnRange: 700,
  despawnRange: 1100,
};

export const GANG = {
  health: 100,
  shootRange: 300,
  shootDamage: 7,
  shootCooldown: 0.9,
  accuracy: 0.55,
};

export const WANTED = {
  max: 5,
  decaySeconds: 15,
  steal: 1,
  hitPed: 1,
  shoot: 1,
  kill: 1,
};

export const MISSIONS = [
  {
    name: 'The Drop',
    pay: 800,
    intro: 'Mara Voss is back in Solmar Bay. Pick up the package on the pier.',
    stages: [
      { type: 'goto', x: 1280, y: 1700, r: 60, label: 'Reach the pier' },
      { type: 'interact', x: 1280, y: 1700, r: 56, label: 'Grab the package (E)' },
      { type: 'goto', x: 400, y: 200, r: 70, label: 'Deliver to the safehouse' },
    ],
  },
  {
    name: 'Heat Run',
    pay: 1000,
    intro: 'The drop was a setup. Cops are on you — lose them, then reach the hideout.',
    stages: [
      { type: 'lose', label: 'Lose the cops (wanted 0)' },
      { type: 'goto', x: 300, y: 1400, r: 70, label: 'Reach the hideout' },
    ],
  },
  {
    name: 'Dockside Debt',
    pay: 1400,
    intro: 'Three debtors owe the crew. Collect from all three — the port guards will object.',
    stages: [
      { type: 'interact', x: 2340, y: 420, r: 56, label: 'Collect at the port (E)' },
      { type: 'interact', x: 800, y: 1100, r: 56, label: 'Collect at the market (E)' },
      { type: 'interact', x: 1760, y: 1620, r: 56, label: 'Collect at the beach (E)' },
    ],
  },
  {
    name: 'Solmar Heist',
    pay: 1800,
    intro: 'One last job: steal the vault car from the port and bring it to the garage.',
    stages: [
      { type: 'goto', x: 2380, y: 520, r: 60, label: 'Reach the vault car' },
      { type: 'steal', x: 2380, y: 520, r: 56, label: 'Steal the vault car (E)' },
      { type: 'deliver', x: 2100, y: 1600, r: 80, label: 'Deliver to the garage' },
    ],
  },
];

export const TOTAL_PAY = MISSIONS.reduce((sum, m) => sum + m.pay, 0);

/** Landmarks the renderer and the minimap both use. */
export const PLACES = {
  safehouse: { x: 400, y: 200, label: 'SAFEHOUSE' },
  hideout: { x: 300, y: 1400, label: 'HIDEOUT' },
  pier: { x: 1280, y: 1700, label: 'PIER' },
  garage: { x: 2100, y: 1600, label: 'GARAGE' },
  port: { x: 2380, y: 520, label: 'PORT' },
};

export const PALETTE = {
  water: '#16324a',
  waterDeep: '#0f2537',
  sand: '#c9a86a',
  grass: '#2e5d34',
  park: '#35703d',
  road: '#23272e',
  roadEdge: '#3a4048',
  lane: '#d8c25a',
  sidewalk: '#4a4f57',
  building: ['#5d4a6e', '#6e4a4a', '#4a5d6e', '#5d6e4a', '#715f43', '#4a4a5d'],
  roof: '#2f3540',
  windowLit: '#f2c94c',
  windowDark: '#1c2430',
  container: ['#b3402e', '#2e7fb3', '#c98a2e', '#3e8e5a'],
  player: '#f2c94c',
  playerJacket: '#e5534b',
  police: '#1c2733',
  policeLight: '#e5534b',
  policeLight2: '#4fc3f7',
  ped: ['#e8e8e8', '#9bb7d4', '#d4a09b', '#a9d49b'],
  gang: '#8e2f2f',
  car: '#c0392b',
  cash: '#7be07b',
  text: '#eef1f5',
  muted: '#9aa3b0',
  banner: '#14181f',
  star: '#f2c94c',
  health: '#e5534b',
  healthBg: '#2a2f38',
  minimapBg: 'rgba(12, 16, 22, 0.85)',
  night: 'rgba(8, 12, 32, 0.45)',
  dusk: 'rgba(64, 32, 8, 0.22)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';
