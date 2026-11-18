// The game's rules and state, with no drawing and no browser in it: the city, the player on
// foot and by car, traffic, pedestrians, police, wanted level, combat and the four story
// missions. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about screens.
// Nothing here allocates after createWorld returns, except the small pooled bullet/particle
// lists, which are allocated once at boot.
import {
  AVENUES, BULLET, CASH_PICKUPS, CAR, CITY, COP, DAY_LENGTH, MELEE, MISSIONS,
  PED_COUNT, PLAYER, POLICE_CAR, ROAD_HALF, STREETS, TRAFFIC_COUNT, WANTED,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_SHOT = 2;
export const EVENT_MISSION = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_COMPLETE = 32;
export const EVENT_CASH = 64;

const WATER_SOUTH = 1860;
const WATER_EAST = 2500;
const PIER = { x: 2440, y: 1520, w: 84, h: 80 };
const PARK_BLOCKS = [[3, 2], [5, 4]];
const MARINA_LOT = { x: 1906, y: 1622, w: 160, h: 160 };
const WAREHOUSE_LOT = { x: 222, y: 502, w: 160, h: 160 };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function overlapsCircleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function inWater(x, y) {
  if (y >= WATER_SOUTH) return true;
  if (x >= WATER_EAST) return true;
  return false;
}
function onPier(x, y) {
  return x >= PIER.x && x <= PIER.x + PIER.w && y >= PIER.y && y <= PIER.y + PIER.h;
}
function blockedPoint(x, y, buildings) {
  if (x < 8 || x > CITY.width - 8 || y < 8 || y > CITY.height - 8) return true;
  if (inWater(x, y) && !onPier(x, y)) return true;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}
/** The lane centre for a road: avenues run north-south, streets east-west, right-hand traffic. */
function laneFor(axis, line, dir) {
  if (axis === 'av') return { x: line + (dir < 0 ? 27 : -27), y: 0 };
  return { x: 0, y: line + (dir > 0 ? 27 : -27) };
}

export function createWorld(random) {
  // ---- city generation (deterministic from the seed) ----
  const buildings = [];
  const parks = [];
  for (let i = 0; i < AVENUES.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const bx = AVENUES[i] + ROAD_HALF + 8;
      const by = STREETS[j] + ROAD_HALF + 8;
      const bw = AVENUES[i + 1] - AVENUES[i] - 2 * (ROAD_HALF + 8);
      const bh = STREETS[j + 1] - STREETS[j] - 2 * (ROAD_HALF + 8);
      const isPark = PARK_BLOCKS.some(([pi, pj]) => pi === i && pj === j);
      const isMarinaLot = i === 6 && j === 5;
      const isWarehouseLot = i === 0 && j === 1;
      if (isPark) {
        const trees = [];
        const n = 5 + Math.floor(random() * 4);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: bx + 16 + random() * (bw - 32), y: by + 16 + random() * (bh - 32), r: 10 + random() * 10 });
        }
        parks.push({ x: bx, y: by, w: bw, h: bh, trees });
        continue;
      }
      if (isMarinaLot || isWarehouseLot) continue; // open parking lots, no buildings
      const warehouse = i <= 1 && j <= 1;
      if (warehouse) {
        buildings.push({
          x: bx + 6, y: by + 6, w: bw - 12, h: bh - 12,
          color: '#9a865c', roof: '#77683f', warehouse: true,
        });
      } else if (bw > 120) {
        // Two buildings side by side, sharing an edge: the old 10 px gap between them was
        // narrower than the player (24 px across), so walking into it wedged Rook in a
        // pocket he could not leave — north blocked by both buildings, west and east blocked
        // by their corners. Adjacent, they form one wall the player slides along instead.
        const split = bw * (0.42 + random() * 0.16);
        buildings.push({ x: bx, y: by, w: split, h: bh, color: '#7d8ea6', roof: '#5f6d80', warehouse: false });
        buildings.push({ x: bx + split, y: by, w: bw - split, h: bh, color: '#8a99ad', roof: '#6a7688', warehouse: false });
      } else {
        buildings.push({ x: bx, y: by, w: bw, h: bh, color: '#7d8ea6', roof: '#5f6d80', warehouse: false });
      }
    }
  }

  // ---- entities ----
  const player = {
    x: 1280, y: 1054, angle: -Math.PI / 2, hp: PLAYER.hp, carId: -1,
    fireTimer: 0, meleeTimer: 0, invulnerable: 0,
  };
  const cars = [];
  const CAR_COLORS = ['#c94f4f', '#4f7ec9', '#c9a44f', '#7a4fc9', '#4fc9a4', '#c9c9c9', '#8a6d3b'];
  let nextCarId = 0;
  function addCar(x, y, angle, kind, color, driver) {
    const car = {
      id: nextCarId, x, y, angle, speed: 0, kind, color, driver,
      road: null, targetSpeed: 0, blockedTimer: 0, despawn: 0,
    };
    nextCarId += 1;
    cars.push(car);
    return car;
  }
  function randomRoadPoint(nearX, nearY, maxDist) {
    for (let tries = 0; tries < 24; tries += 1) {
      const axis = random() < 0.5 ? 'av' : 'st';
      const line = axis === 'av'
        ? AVENUES[Math.floor(random() * AVENUES.length)]
        : STREETS[Math.floor(random() * STREETS.length)];
      const along = 60 + random() * (axis === 'av' ? CITY.height - 120 : CITY.width - 120);
      const dir = random() < 0.5 ? 1 : -1;
      const lane = laneFor(axis, line, dir);
      const x = axis === 'av' ? lane.x : along;
      const y = axis === 'av' ? along : lane.y;
      if (nearX !== undefined && dist(x, y, nearX, nearY) > maxDist) continue;
      if (blockedPoint(x, y, buildings)) continue;
      return { x, y, axis, line, dir };
    }
    return { x: 1280, y: 1000, axis: 'st', line: 1000, dir: 1 };
  }
  function spawnTrafficCar(nearX, nearY) {
    const p = randomRoadPoint(nearX, nearY, 900);
    const angle = p.axis === 'av' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
    const car = addCar(p.x, p.y, angle, 'sedan', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)], 'traffic');
    car.road = { axis: p.axis, line: p.line, dir: p.dir };
    car.targetSpeed = 150 + random() * 90;
    car.speed = car.targetSpeed;
    return car;
  }
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(1280, 1000);
  // Parked cars: marina lot (one is the gold Vanta GT) and the warehouse lot. Lots sit inside
  // blocks, off the roads, so parked cars can never scrape moving traffic. The Vanta GT takes
  // the middle marina spot — no second car may share it, or the nearer one would win every
  // "nearest car" check and the GT could never be entered.
  const parkedSpots = [
    { x: 1940, y: 1660 }, { x: 1940, y: 1720 }, { x: 2020, y: 1660 },
    { x: 2020, y: 1720 },
    { x: 260, y: 540 }, { x: 260, y: 600 }, { x: 340, y: 540 },
  ];
  for (const spot of parkedSpots) {
    addCar(spot.x, spot.y, Math.PI / 2, 'sedan', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)], 'none');
  }
  const vanta = addCar(1980, 1700, Math.PI / 2, 'vanta', '#d4af37', 'none');
  const peds = [];
  function spawnPed(nearX, nearY) {
    const p = randomRoadPoint(nearX, nearY, 800);
    const axis = p.axis;
    const off = (random() < 0.5 ? -1 : 1) * (ROAD_HALF + 14);
    const x = axis === 'av' ? p.line + off : p.x;
    const y = axis === 'av' ? p.y : p.line + off;
    const angle = axis === 'av' ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
    peds.push({ x, y, angle, speed: 55 + random() * 30, axis, line: p.line, off, flee: 0, fx: 0, fy: 0, down: 0 });
  }
  for (let i = 0; i < PED_COUNT; i += 1) spawnPed(1280, 1000);
  const cops = [];
  const guards = [];
  const bullets = [];
  for (let i = 0; i < 48; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, from: '', life: 0 });
  const particles = [];
  for (let i = 0; i < 96; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 3 });
  const pickups = CASH_PICKUPS.map((p) => ({ x: p.x, y: p.y, amount: p.amount, taken: false }));

  const state = {
    player, cars, peds, cops, guards, bullets, particles, pickups,
    buildings, parks, lots: [MARINA_LOT, WAREHOUSE_LOT], pier: PIER,
    waterSouth: WATER_SOUTH, waterEast: WATER_EAST,
    cash: 0, missionIndex: 0, missionStage: 0, missionTarget: null,
    passenger: false, packageHeld: false, storyDone: false,
    wanted: { stars: 0, lastCrime: -100, decayTimer: 0 },
    time: 0, dayTime: 0.3, busted: false, wasted: false,
    vantaId: vanta.id, elapsed: 0, shotsFired: 0,
  };

  function missionDef() {
    return MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
  }
  function setTarget(point) {
    state.missionTarget = { x: point.x, y: point.y };
  }
  function startMission(index) {
    state.missionIndex = index;
    state.missionStage = 0;
    state.passenger = false;
    state.packageHeld = false;
    if (index >= MISSIONS.length) {
      state.storyDone = true;
      state.missionTarget = null;
      return;
    }
    setTarget(missionDef().pickup);
  }
  function addWanted(n) {
    state.wanted.stars = Math.min(WANTED.maxStars, state.wanted.stars + n);
    state.wanted.lastCrime = state.time;
    state.wanted.decayTimer = 0;
  }
  function fireBullet(x, y, angle, from) {
    for (const b of bullets) {
      if (b.active) continue;
      b.active = true;
      b.x = x + Math.cos(angle) * 20;
      b.y = y + Math.sin(angle) * 20;
      b.vx = Math.cos(angle) * BULLET.speed;
      b.vy = Math.sin(angle) * BULLET.speed;
      b.from = from;
      b.life = BULLET.range / BULLET.speed;
      return;
    }
  }
  function spawnParticles(x, y, color, count, speed) {
    let made = 0;
    for (const p of particles) {
      if (made >= count) break;
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = 0.35 + random() * 0.3;
      p.life = p.maxLife;
      p.color = color;
      p.size = 2 + random() * 3;
      made += 1;
    }
  }
  function playerCar() {
    if (state.player.carId < 0) return null;
    for (const c of cars) if (c.id === state.player.carId) return c;
    return null;
  }
  function nearestCar(x, y, maxDist, excludeId) {
    let best = null;
    let bestD = maxDist;
    for (const c of cars) {
      if (c.id === excludeId) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function reset() {
    state.player.x = 1280;
    state.player.y = 1054;
    state.player.angle = -Math.PI / 2;
    state.player.hp = PLAYER.hp;
    state.player.carId = -1;
    state.player.fireTimer = 0;
    state.player.meleeTimer = 0;
    state.player.invulnerable = 0;
    state.cash = 0;
    state.wanted.stars = 0;
    state.wanted.lastCrime = -100;
    state.wanted.decayTimer = 0;
    // Start in daylight: dayTime is derived from time (time / DAY_LENGTH), and time 0 is
    // midnight — a fresh game used to open in the dark. 0.3 of a day is mid-morning.
    state.time = DAY_LENGTH * 0.3;
    state.dayTime = 0.3;
    state.elapsed = 0;
    state.busted = false;
    state.wasted = false;
    state.storyDone = false;
    state.shotsFired = 0;
    state.cops.length = 0;
    state.guards.length = 0;
    for (const b of bullets) b.active = false;
    for (const p of particles) p.active = false;
    for (const p of pickups) p.taken = false;
    startMission(0);
  }
  function loadSave(save) {
    reset();
    state.cash = save.cash || 0;
    const index = Math.min(save.missionIndex || 0, MISSIONS.length);
    if (save.storyDone || index >= MISSIONS.length) {
      state.storyDone = true;
      state.missionIndex = MISSIONS.length;
      state.missionTarget = null;
    } else {
      startMission(index);
    }
  }
  function saveData() {
    return { cash: state.cash, missionIndex: state.missionIndex, storyDone: state.storyDone };
  }

  // ---- movement and collision ----
  function moveCircle(entity, dx, dy, radius) {
    // Try x then y so a walker slides along walls instead of sticking to them.
    const nx = entity.x + dx;
    if (!blockedPoint(nx, entity.y, buildings) && !overlapsAnyBuilding(nx, entity.y, radius)) entity.x = nx;
    const ny = entity.y + dy;
    if (!blockedPoint(entity.x, ny, buildings) && !overlapsAnyBuilding(entity.x, ny, radius)) entity.y = ny;
    entity.x = clamp(entity.x, 12, CITY.width - 12);
    entity.y = clamp(entity.y, 12, CITY.height - 12);
  }
  function overlapsAnyBuilding(x, y, radius) {
    for (const b of buildings) {
      if (overlapsCircleRect(x, y, radius, b)) return true;
    }
    return false;
  }
  function moveCar(car, dt) {
    // A car is a circle of radius 22 for collision; it is drawn as an oriented rectangle.
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hitBuilding = overlapsAnyBuilding(nx, ny, 22) || (inWater(nx, ny) && !onPier(nx, ny));
    if (hitBuilding) {
      if (Math.abs(car.speed) > CAR.crashFree && car.driver === 'player') {
        damagePlayer((Math.abs(car.speed) - CAR.crashFree) / 40);
      }
      car.speed *= -0.25;
      spawnParticles(car.x, car.y, '#ffb347', 6, 120);
      return;
    }
    car.x = nx;
    car.y = ny;
    // Car-to-car: push apart, shed speed.
    for (const other of cars) {
      if (other === car) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const ux = (car.x - other.x) / d;
        const uy = (car.y - other.y) / d;
        car.x += ux * push;
        car.y += uy * push;
        other.x -= ux * push;
        other.y -= uy * push;
        const rel = Math.abs(car.speed - other.speed);
        if (rel > 200) {
          car.speed *= 0.6;
          other.speed *= 0.6;
          if (car.driver === 'player' || other.driver === 'player') {
            damagePlayer(rel / 60);
            spawnParticles(car.x, car.y, '#ffb347', 8, 160);
          }
        }
      }
    }
  }
  function damagePlayer(amount) {
    if (state.player.invulnerable > 0 || state.busted || state.wasted) return;
    state.player.hp -= amount;
    state.player.invulnerable = 0.4;
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.wasted = true;
    }
  }

  // ---- entering and leaving cars ----
  function tryEnterCar() {
    const p = state.player;
    if (p.carId >= 0) {
      // Get out, beside the car, if it is slow enough.
      const car = playerCar();
      if (!car || Math.abs(car.speed) > 60) return false;
      const side = car.angle + Math.PI / 2;
      const x = car.x + Math.cos(side) * 34;
      const y = car.y + Math.sin(side) * 34;
      if (blockedPoint(x, y, buildings) || overlapsAnyBuilding(x, y, PLAYER.radius)) return false;
      p.x = x;
      p.y = y;
      p.angle = car.angle;
      car.driver = 'none';
      car.speed = 0;
      p.carId = -1;
      return true;
    }
    const car = nearestCar(p.x, p.y, 62, -1);
    if (!car) return false;
    if (car.driver === 'traffic') {
      // Stealing a driven car: the driver bails out as a pedestrian and the heat goes up.
      addWanted(1);
      peds.push({
        x: car.x + 30, y: car.y + 30, angle: random() * Math.PI * 2,
        speed: 120, axis: 'av', line: 1280, off: 0, flee: 3, fx: car.x, fy: car.y, down: 0,
      });
    }
    if (car.kind === 'vanta' && state.missionIndex === 1 && state.missionStage === 0) {
      addWanted(1);
      state.missionStage = 1;
      setTarget(missionDef().dropoff);
    }
    car.driver = 'player';
    car.speed = 0;
    p.carId = car.id;
    p.angle = car.angle;
    return true;
  }

  // ---- traffic ----
  function carAhead(car, range) {
    let best = null;
    let bestD = range;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const forward = dx * fx + dy * fy;
      if (forward < 0 || forward > range) continue;
      const side = Math.abs(-dx * fy + dy * fx);
      if (side > 30) continue;
      if (forward < bestD) {
        bestD = forward;
        best = other;
      }
    }
    return best;
  }
  function stepTrafficCar(car, dt) {
    if (!car.road) return;
    // At an intersection, sometimes turn onto the crossing road.
    const crossing = car.road.axis === 'av'
      ? STREETS.find((s) => Math.abs(car.y - s) < 60)
      : AVENUES.find((a) => Math.abs(car.x - a) < 60);
    if (crossing !== undefined && random() < dt * 0.35) {
      const axis = car.road.axis === 'av' ? 'st' : 'av';
      const line = crossing;
      const dir = random() < 0.5 ? 1 : -1;
      car.road = { axis, line, dir };
    }
    const targetAngle = car.road.axis === 'av'
      ? (car.road.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.road.dir > 0 ? 0 : Math.PI);
    car.angle = angleLerp(car.angle, targetAngle, Math.min(1, dt * 4));
    // Steer back into the lane.
    const lane = laneFor(car.road.axis, car.road.line, car.road.dir);
    if (car.road.axis === 'av') {
      const wantX = lane.x;
      car.x += clamp(wantX - car.x, -1, 1) * 60 * dt;
    } else {
      const wantY = lane.y;
      car.y += clamp(wantY - car.y, -1, 1) * 60 * dt;
    }
    const ahead = carAhead(car, 90);
    const want = ahead ? 0 : car.targetSpeed;
    car.speed += clamp(want - car.speed, -CAR.brake * dt, CAR.accel * dt);
    if (ahead && car.speed < 5) {
      car.blockedTimer += dt;
      if (car.blockedTimer > 5) {
        // Give up waiting: respawn further along the road.
        const p = randomRoadPoint(car.x, car.y, 900);
        car.x = p.x;
        car.y = p.y;
        car.blockedTimer = 0;
      }
    } else {
      car.blockedTimer = 0;
    }
    moveCar(car, dt);
    if (dist(car.x, car.y, state.player.x, state.player.y) > 1500) {
      const p = randomRoadPoint(state.player.x, state.player.y, 900);
      car.x = p.x;
      car.y = p.y;
      car.angle = p.axis === 'av' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
      car.road = { axis: p.axis, line: p.line, dir: p.dir };
      car.speed = car.targetSpeed;
    }
  }
  function stepPoliceCar(car, dt) {
    const p = state.player;
    const target = playerCar() ? { x: p.x, y: p.y } : { x: p.x, y: p.y };
    const want = angleTo(car.x, car.y, target.x, target.y);
    car.angle = angleLerp(car.angle, want, Math.min(1, dt * 2.2));
    const d = dist(car.x, car.y, target.x, target.y);
    const wantSpeed = d > 120 ? POLICE_CAR.maxSpeed : 120;
    car.speed += clamp(wantSpeed - car.speed, -CAR.brake * dt, POLICE_CAR.accel * dt);
    moveCar(car, dt);
    // Ram the player's car.
    const pc = playerCar();
    if (pc && dist(car.x, car.y, pc.x, pc.y) < 46) {
      damagePlayer(6);
      pc.speed *= 0.7;
      car.speed *= 0.5;
      spawnParticles(pc.x, pc.y, '#ffb347', 8, 160);
    }
    // Player on foot and the cruiser is close: a cop gets out, the cruiser stays parked.
    if (!pc && d < 130 && state.cops.length < 6) {
      cops.push({ x: car.x + 30, y: car.y, angle: want, arrest: 0 });
      car.driver = 'none';
      car.speed = 0;
      car.road = null;
    }
  }

  // ---- pedestrians ----
  function stepPed(ped, dt) {
    if (ped.down > 0) {
      ped.down -= dt;
      return;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = angleTo(ped.fx, ped.fy, ped.x, ped.y);
      moveCircle(ped, Math.cos(a) * ped.speed * 1.7 * dt, Math.sin(a) * ped.speed * 1.7 * dt, 10);
      return;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    // Turn at intersections; turn around at the city edge or water.
    const onCross = ped.axis === 'av'
      ? STREETS.some((s) => Math.abs(ped.y - s) < 8)
      : AVENUES.some((a) => Math.abs(ped.x - a) < 8);
    if (onCross && random() < dt * 0.5) {
      ped.axis = ped.axis === 'av' ? 'st' : 'av';
      ped.angle = ped.axis === 'av'
        ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (random() < 0.5 ? 0 : Math.PI);
    }
    if (ped.x < 30 || ped.x > CITY.width - 30 || ped.y < 30 || ped.y > CITY.height - 30 || inWater(ped.x, ped.y)) {
      ped.angle += Math.PI;
      ped.x = clamp(ped.x, 40, CITY.width - 40);
      ped.y = clamp(ped.y, 40, CITY.height - 40);
    }
  }
  function scarePeds(x, y, radius) {
    for (const ped of peds) {
      if (ped.down > 0) continue;
      if (dist(ped.x, ped.y, x, y) < radius) {
        ped.flee = 3;
        ped.fx = x;
        ped.fy = y;
      }
    }
  }

  // ---- police and wanted ----
  function desiredCops() {
    return state.wanted.stars >= 1 ? Math.min(COP.count, state.wanted.stars) : 0;
  }
  function desiredPoliceCars() {
    return state.wanted.stars >= 2 ? Math.min(state.wanted.stars, 3) : 0;
  }
  function countPoliceCars() {
    let n = 0;
    for (const c of cars) if (c.driver === 'police') n += 1;
    return n;
  }
  function spawnCop() {
    const p = randomRoadPoint(state.player.x, state.player.y, 700);
    cops.push({ x: p.x, y: p.y, angle: 0, arrest: 0 });
  }
  function spawnPoliceCar() {
    const p = randomRoadPoint(state.player.x, state.player.y, 800);
    const angle = p.axis === 'av' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
    const car = addCar(p.x, p.y, angle, 'police', '#e8e8e8', 'police');
    car.speed = 200;
    return car;
  }
  function stepCop(cop, dt) {
    const p = state.player;
    const pc = playerCar();
    if (pc) {
      // The cruisers take over: this cop stands down and walks off.
      cop.arrest = 0;
      return;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    const want = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = want;
    if (d > 26) {
      cop.x += Math.cos(want) * COP.speed * dt;
      cop.y += Math.sin(want) * COP.speed * dt;
      cop.arrest = 0;
    } else {
      cop.arrest += dt;
      if (cop.arrest >= PLAYER.arrestSeconds && !state.busted) {
        state.busted = true;
      }
    }
  }

  // ---- combat ----
  /** Is the point (px,py) within r of the segment (x1,y1)-(x2,y2)? A bullet moves ~15 px a step, so a hit is tested against the whole path it travelled, not just where it stopped: a target closer than the 20 px muzzle offset is still hit instead of being stepped over. */
  function segHits(x1, y1, x2, y2, px, py, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    const ddx = px - cx;
    const ddy = py - cy;
    return ddx * ddx + ddy * ddy < r * r;
  }
  function stepBullets(dt) {
    for (const b of bullets) {
      if (!b.active) continue;
      const ox = b.x;
      const oy = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && (blockedPoint(b.x, b.y, buildings) || overlapsAnyBuilding(b.x, b.y, 2))) {
        spawnParticles(b.x, b.y, '#ffd166', 4, 90);
        dead = true;
      }
      if (!dead) {
        // Guards and cops can be shot; the player can be shot by guards.
        if (b.from === 'player') {
          for (const g of guards) {
            if (g.alive && segHits(ox, oy, b.x, b.y, g.x, g.y, 16)) {
              g.hp -= BULLET.damage;
              spawnParticles(g.x, g.y, '#ff6b5e', 6, 140);
              if (g.hp <= 0) g.alive = false;
              dead = true;
              break;
            }
          }
          if (!dead) {
            for (const cop of cops) {
              if (segHits(ox, oy, b.x, b.y, cop.x, cop.y, 16)) {
                addWanted(2);
                spawnParticles(cop.x, cop.y, '#ff6b5e', 6, 140);
                cops.splice(cops.indexOf(cop), 1);
                dead = true;
                break;
              }
            }
          }
          if (!dead) {
            for (const ped of peds) {
              if (ped.down <= 0 && segHits(ox, oy, b.x, b.y, ped.x, ped.y, 14)) {
                ped.down = 9999;
                addWanted(1);
                spawnParticles(ped.x, ped.y, '#ff6b5e', 6, 140);
                dead = true;
                break;
              }
            }
          }
        } else if (playerCar() === null && segHits(ox, oy, b.x, b.y, state.player.x, state.player.y, 16)) {
          damagePlayer(9);
          spawnParticles(state.player.x, state.player.y, '#ff6b5e', 5, 120);
          dead = true;
        }
      }
      if (dead) b.active = false;
    }
  }
  function stepGuards(dt) {
    for (const g of guards) {
      if (!g.alive) continue;
      const p = state.player;
      const d = dist(g.x, g.y, p.x, p.y);
      g.shootTimer -= dt;
      if (d < 420 && playerCar() === null) {
        g.angle = angleTo(g.x, g.y, p.x, p.y);
        if (g.shootTimer <= 0) {
          g.shootTimer = 0.9 + random() * 0.7;
          const spread = (random() - 0.5) * 0.25;
          fireBullet(g.x, g.y, g.angle + spread, 'guard');
        }
        if (d > 200) {
          // Slide along walls like the player does, instead of cutting through buildings.
          moveCircle(g, Math.cos(g.angle) * 60 * dt, Math.sin(g.angle) * 60 * dt, 10);
        }
      }
    }
  }
  function meleeAttack() {
    const p = state.player;
    const a = p.angle;
    for (const g of guards) {
      if (!g.alive) continue;
      const d = dist(p.x, p.y, g.x, g.y);
      if (d < MELEE.range) {
        const da = Math.abs(angleTo(p.x, p.y, g.x, g.y) - a);
        if (da < MELEE.arc || da > Math.PI * 2 - MELEE.arc) {
          g.hp -= MELEE.damage;
          if (g.hp <= 0) g.alive = false;
          spawnParticles(g.x, g.y, '#ff6b5e', 6, 140);
          return;
        }
      }
    }
    for (const cop of cops) {
      if (dist(p.x, p.y, cop.x, cop.y) < MELEE.range + 10) {
        cops.splice(cops.indexOf(cop), 1);
        addWanted(1);
        return;
      }
    }
  }

  // ---- missions ----
  function completeMission() {
    const def = missionDef();
    state.cash += def.pay;
    state.missionIndex += 1;
    state.missionStage = 0;
    state.passenger = false;
    state.packageHeld = false;
    if (state.missionIndex >= MISSIONS.length) {
      state.storyDone = true;
      state.missionTarget = null;
    } else {
      setTarget(missionDef().pickup);
    }
    return EVENT_MISSION;
  }
  function stepMissions(dt) {
    if (state.storyDone || state.busted || state.wasted) return 0;
    const def = missionDef();
    const p = state.player;
    const target = state.missionTarget;
    if (!target) return 0;
    const d = dist(p.x, p.y, target.x, target.y);
    let events = 0;
    if (state.missionIndex === 0) {
      if (state.missionStage === 0 && d < 48) {
        state.missionStage = 1;
        state.passenger = true;
        setTarget(def.dropoff);
      } else if (state.missionStage === 1 && d < 48 && playerCar() !== null) {
        events |= completeMission();
      }
    } else if (state.missionIndex === 1) {
      if (state.missionStage === 1 && d < 56) {
        const car = playerCar();
        if (car && car.kind === 'vanta') events |= completeMission();
      }
    } else if (state.missionIndex === 2) {
      if (state.missionStage === 0 && d < 48) {
        state.missionStage = 1;
        // Guards stand on the street in front of the warehouse (on the road, never inside it).
        guards.push(
          { x: 260, y: 200, angle: 0, hp: 3, shootTimer: 1, alive: true },
          { x: 340, y: 200, angle: 0, hp: 3, shootTimer: 1.4, alive: true },
          { x: 300, y: 210, angle: 0, hp: 3, shootTimer: 1.2, alive: true },
        );
        setTarget({ x: 300, y: 200 });
      } else if (state.missionStage === 1) {
        const alive = guards.some((g) => g.alive);
        if (!alive) {
          state.missionStage = 2;
          state.packageHeld = true;
          setTarget(def.dropoff);
          events |= completeMission();
        }
      }
    } else if (state.missionIndex === 3) {
      if (state.missionStage === 0) {
        state.missionStage = 1;
        if (state.wanted.stars < 3) addWanted(3 - state.wanted.stars);
        setTarget(def.dropoff);
      } else if (d < 56) {
        events |= completeMission();
        if (state.storyDone) events |= EVENT_COMPLETE;
      }
    }
    return events;
  }

  // ---- the step ----
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    state.elapsed += dt;
    state.dayTime = (state.time / DAY_LENGTH) % 1;
    const p = state.player;
    if (p.fireTimer > 0) p.fireTimer -= dt;
    if (p.meleeTimer > 0) p.meleeTimer -= dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    for (const part of particles) {
      if (!part.active) continue;
      part.life -= dt;
      if (part.life <= 0) {
        part.active = false;
        continue;
      }
      part.x += part.vx * dt;
      part.y += part.vy * dt;
    }

    if (!harmless && !state.busted && !state.wasted) {
      const car = playerCar();
      if (input.enter) tryEnterCar();
      if (car) {
        p.x = car.x;
        p.y = car.y;
        p.angle = car.angle;
        const steer = (input.steer || 0) * (car.speed >= 0 ? 1 : -1);
        const speedFactor = clamp(Math.abs(car.speed) / 200, 0.25, 1);
        car.angle += steer * CAR.turn * speedFactor * dt;
        if (input.accel) car.speed += CAR.accel * dt;
        else if (input.brake) car.speed -= CAR.brake * dt * (car.speed > 0 ? 1 : 0.4);
        else car.speed -= Math.sign(car.speed) * 120 * dt;
        if (Math.abs(car.speed) < 4 && !input.accel && !input.brake) car.speed = 0;
        car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
        moveCar(car, dt);
        // Hitting a pedestrian with the car.
        for (const ped of peds) {
          if (ped.down > 0) continue;
          if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 120) {
            ped.down = 9999;
            addWanted(1);
            events |= EVENT_HIT;
            spawnParticles(ped.x, ped.y, '#ff6b5e', 8, 160);
            scarePeds(ped.x, ped.y, 300);
          }
        }
      } else {
        const mx = input.mx || 0;
        const my = input.my || 0;
        const len = Math.hypot(mx, my);
        if (len > 0.01) {
          const nx = mx / Math.max(1, len);
          const ny = my / Math.max(1, len);
          p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
          moveCircle(p, nx * PLAYER.walkSpeed * dt, ny * PLAYER.walkSpeed * dt, PLAYER.radius);
        } else if (input.aimX !== undefined) {
          p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
        }
        if (input.shoot && p.fireTimer <= 0) {
          p.fireTimer = BULLET.fireInterval;
          fireBullet(p.x, p.y, p.angle, 'player');
          state.shotsFired += 1;
          if (state.shotsFired === 1 || state.time - state.wanted.lastCrime > 5) addWanted(1);
          scarePeds(p.x, p.y, 320);
          spawnParticles(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, '#ffdf6b', 3, 80);
          events |= EVENT_SHOT;
        }
        if (input.melee && p.meleeTimer <= 0) {
          p.meleeTimer = MELEE.cooldown;
          meleeAttack();
        }
      }
      // Cash pickups.
      for (const pickup of pickups) {
        if (!pickup.taken && dist(p.x, p.y, pickup.x, pickup.y) < 30) {
          pickup.taken = true;
          state.cash += pickup.amount;
          events |= EVENT_CASH;
        }
      }
      events |= stepMissions(dt);
      // Wanted decay: unseen and crime-free for a while, then one star at a time.
      const anyCopNear = state.cops.some((c) => dist(c.x, c.y, p.x, p.y) < WANTED.seeRange)
        || countPoliceCars() > 0 && cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < WANTED.seeRange);
      if (state.wanted.stars > 0 && !anyCopNear && state.time - state.wanted.lastCrime > WANTED.unseenSeconds) {
        state.wanted.decayTimer += dt;
        if (state.wanted.decayTimer >= WANTED.decaySeconds) {
          state.wanted.stars -= 1;
          state.wanted.decayTimer = 0;
        }
      } else {
        state.wanted.decayTimer = 0;
      }
      // Police presence follows the wanted level; when the heat is gone, they leave.
      while (state.cops.length < desiredCops()) spawnCop();
      while (countPoliceCars() < desiredPoliceCars()) spawnPoliceCar();
      if (state.wanted.stars === 0) {
        for (let i = state.cops.length - 1; i >= 0; i -= 1) {
          const cop = state.cops[i];
          if (dist(cop.x, cop.y, p.x, p.y) > 600) state.cops.splice(i, 1);
        }
      }
      for (const cop of state.cops) stepCop(cop, dt);
    }

    // Traffic, pedestrians and bullets always move (also behind the title screen).
    for (const car of cars) {
      if (car.driver === 'traffic') stepTrafficCar(car, dt);
      else if (car.driver === 'police') stepPoliceCar(car, dt);
    }
    for (const ped of peds) stepPed(ped, dt);
    stepGuards(dt);
    stepBullets(dt);
    // Busted/wasted are reported here, not inside the player block above: a guard's bullet
    // kills in stepBullets, after that block, and the event still has to reach the caller.
    if (state.busted) events |= EVENT_BUSTED;
    if (state.wasted) events |= EVENT_WASTED;
    return events;
  }

  reset();
  return { state, reset, step, loadSave, saveData, startMission };
}
