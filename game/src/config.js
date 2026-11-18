// Solmar Bay: every tuning number for the city, the cars, the people, the police
// and the story lives here, so the rest of the game reads like a description.
export const WORLD = {
  width: 2560,
  height: 1920,
  roadWidth: 72,
  // Vertical streets (x) and horizontal streets (y): the grid the city is built on.
  streetsX: [200, 520, 840, 1160, 1480, 1800, 2120, 2440],
  streetsY: [160, 400, 640, 880, 1120, 1360, 1600, 1760],
  // South of this line the beach starts; the water begins a little further down.
  beachY: 1824,
  waterY: 1880,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  health: 100,
  // Seconds a police car must stay touching an on-foot player to bust them.
  bustTime: 1.2,
};

export const CAR = {
  width: 46,
  length: 78,
  accel: 300,
  brake: 520,
  maxSpeed: 430,
  reverseMax: 140,
  turnRate: 2.6,
  trafficSpeed: 120,
  policeSpeed: 235,
};

export const PED = {
  radius: 9,
  walkSpeed: 55,
  fleeSpeed: 130,
};

export const BULLET = {
  speed: 760,
  life: 0.9,
  damage: 34,
};

export const WANTED = {
  maxStars: 5,
  // Seconds of quiet (no crime, no cop nearby) before one star fades.
  decaySeconds: 20,
  // How many police cars are out for each star.
  copsPerStar: 1,
  stealCarStars: 1,
  hitPedStars: 1,
  shootStars: 1,
  killPedStars: 2,
};

export const DAY_LENGTH = 240; // seconds for one full day/night cycle

export const SAVE_KEY = 'solmar-bay-save-v1';

// The story: four jobs from Mara Voss, the fixer who runs the bay. Each job is a
// list of steps; a step is done when the player reaches its marker (or, for the
// steal step, gets into any car). Positions sit on street centrelines.
export const MISSIONS = [
  {
    id: 1,
    name: 'First Wheels',
    briefing: 'Mara needs wheels. Steal any car, then bring it to her garage.',
    reward: 400,
    steps: [
      { kind: 'steal', text: 'Steal a car  (walk up to one and press E)' },
      { kind: 'goto', x: 1480, y: 1120, label: "Mara's Garage", text: 'Drive to Mara\u2019s Garage' },
    ],
  },
  {
    id: 2,
    name: 'The Drop',
    briefing: 'A package is waiting on Harbor Row. Pick it up and run it to the docks.',
    reward: 800,
    steps: [
      { kind: 'goto', x: 520, y: 640, label: 'Package', text: 'Pick up the package on Harbor Row' },
      { kind: 'goto', x: 2120, y: 400, label: 'The Docks', text: 'Deliver the package to the docks' },
    ],
  },
  {
    id: 3,
    name: 'Heat Run',
    briefing: 'The cops are already on you. Reach the safehouse, then shake the heat.',
    reward: 1200,
    startWanted: 2,
    steps: [
      { kind: 'goto', x: 840, y: 1600, label: 'Safehouse', text: 'Reach the safehouse with the cops on you' },
      { kind: 'loseheat', text: 'Lose the heat  (stay out of sight until the stars fade)' },
    ],
  },
  {
    id: 4,
    name: 'Bay Heist',
    briefing: 'Three stashes, one night. Grab them all, then vanish into the hideout.',
    reward: 2600,
    steps: [
      { kind: 'collect', x: 200, y: 160, label: 'Stash 1 of 3', text: 'Grab the stash at North Gate' },
      { kind: 'collect', x: 2440, y: 1760, label: 'Stash 2 of 3', text: 'Grab the stash at the beachfront' },
      { kind: 'collect', x: 1160, y: 880, label: 'Stash 3 of 3', text: 'Grab the stash at Central Plaza' },
      { kind: 'goto', x: 1800, y: 1360, label: 'Hideout', text: 'Reach the hideout' },
    ],
  },
];

export const STORY_TOTAL = MISSIONS.reduce((sum, mission) => sum + mission.reward, 0);
