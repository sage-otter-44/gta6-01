// Every tuning number and colour in one place. Cinder Bay is a fixed 2560x1920 city:
// 9 avenues and 7 streets on a 280 px grid, roads 108 px wide (ROAD_HALF 54). The renderer
// shows a 1280x720 window of it through a camera that follows the player.

export const CITY = { width: 2560, height: 1920 };
export const AVENUES = [160, 440, 720, 1000, 1280, 1560, 1840, 2120, 2400];
export const STREETS = [160, 440, 720, 1000, 1280, 1560, 1840];
export const ROAD_HALF = 54;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the save (cash, mission, story done) is kept between visits (this browser only). */
export const SAVE_KEY = 'cinder-bay.save.v1';

export const PLAYER = {
  radius: 12,
  walkSpeed: 235,
  hp: 100,
  /** Seconds a foot cop must stay touching the player to arrest them. */
  arrestSeconds: 1.0,
};

export const CAR = {
  length: 48,
  width: 26,
  accel: 430,
  brake: 720,
  maxSpeed: 540,
  maxReverse: 170,
  /** Radians per second of steering at full speed; scaled down when slow. */
  turn: 2.7,
  /** Damage taken on a hard crash, per 100 px/s of impact over the free speed. */
  crashFree: 260,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 24;

export const WANTED = {
  /** Lose one star this often while unseen and crime-free. */
  decaySeconds: 6,
  /** Seconds without a crime before decay may start. */
  unseenSeconds: 8,
  /** A cop within this range keeps the player "seen". */
  seeRange: 480,
  maxStars: 5,
};

export const BULLET = { speed: 920, range: 640, damage: 1, fireInterval: 0.22 };
export const MELEE = { range: 52, arc: 1.1, damage: 1, cooldown: 0.45 };

export const COP = { speed: 205, count: 2 };
export const POLICE_CAR = { maxSpeed: 560, accel: 470 };

/** Story missions, in order. Pay totals $5,000 — exactly Rook's debt to Eddie Voss. */
export const MISSIONS = [
  {
    name: 'First Fare',
    pay: 400,
    blurb: 'Marla needs a driver. Pick up the fare on Harbor St, then drop them at the east docks.',
    pickup: { x: 720, y: 720 },
    dropoff: { x: 1840, y: 1280 },
  },
  {
    name: 'Hot Wheels',
    pay: 800,
    blurb: 'A gold Vanta GT is sitting in the marina lot. Steal it and bring it to the warehouse garage.',
    pickup: { x: 1980, y: 1700 },
    dropoff: { x: 440, y: 460 },
  },
  {
    name: 'Street Heat',
    pay: 1200,
    blurb: 'Voss keeps a package in the north warehouse. The guards will not hand it over nicely.',
    pickup: { x: 300, y: 160 },
    dropoff: { x: 300, y: 160 },
  },
  {
    name: 'The Big Getaway',
    pay: 2600,
    blurb: 'Package in hand, every cop in Cinder Bay is coming. Get to Old Pier and do not stop.',
    pickup: { x: 300, y: 160 },
    dropoff: { x: 2470, y: 1560 },
  },
];

/** Cash pickups scattered on sidewalks. */
export const CASH_PICKUPS = [
  { x: 1000, y: 214, amount: 50 },
  { x: 1560, y: 1066, amount: 50 },
  { x: 440, y: 1334, amount: 50 },
  { x: 2120, y: 774, amount: 50 },
  { x: 1280, y: 1614, amount: 50 },
  { x: 720, y: 1894 - 120, amount: 50 },
];

export const DAY_LENGTH = 240;

export const PALETTE = {
  backdrop: '#0d1017',
  water: '#1e4a6e',
  waterDeep: '#153850',
  ground: '#46545f',
  block: '#3a4552',
  park: '#2e7a4a',
  parkDark: '#256b3e',
  sidewalk: '#6a7280',
  road: '#33383f',
  roadLine: '#b09a55',
  building: '#7d8ea6',
  buildingRoof: '#5f6d80',
  warehouse: '#9a865c',
  warehouseRoof: '#77683f',
  pier: '#a8824f',
  player: '#ffd166',
  playerCar: '#e8b93b',
  vanta: '#d4af37',
  police: '#e8e8e8',
  policeDark: '#1d2733',
  ped: '#9fb3c8',
  guard: '#c94f4f',
  bullet: '#ffe9a3',
  muzzle: '#ffdf6b',
  panel: '#1b212b',
  text: '#eef1f5',
  muted: '#93a0b4',
  cash: '#7ddc8a',
  danger: '#ff6b5e',
  star: '#ffd166',
  health: '#58d68d',
  minimapRoad: '#7d8590',
  minimapWater: '#1e4a6e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
