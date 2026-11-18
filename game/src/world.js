// Solmar Bay's rules and state, with no drawing and no browser in it: the city,
// the player on foot and in cars, traffic, pedestrians, the police, bullets,
// missions and the wanted level. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about
// screens or sound. The module only needs Math and the seed it was built with,
// so Node tests can import it directly.
import { BULLET, CAR, DAY_LENGTH, MISSIONS, PED, PLAYER, WANTED, WORLD } from './config.js';
import { angleDelta, clamp, makeRandom, pick, randomInt } from './random.js';

export const EVENT_SHOT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_MISSION = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_CRIME = 32;
export const EVENT_ENTER_CAR = 64;
export const EVENT_EXIT_CAR = 128;
export const EVENT_HIT = 256;
export const EVENT_STORY = 512;

const DIRS = [
  { dx: 1, dy: 0, angle: 0 },
  { dx: 0, dy: 1, angle: Math.PI / 2 },
  { dx: -1, dy: 0, angle: Math.PI },
  { dx: 0, dy: -1, angle: -Math.PI / 2 },
];

const CAR_COLORS = ['#c94f42', '#3f7ec2', '#e0a83c', '#58a05c', '#8a6fc0', '#d8d8d8', '#2f333a', '#c2703f'];
const BUILDING_COLORS = ['#b98a5e', '#a87a52', '#c2a878', '#8a9aa8', '#b0817a', '#7d8a6a', '#9a8a6a', '#6a7a8a'];
const PED_COLORS = ['#e8c39a', '#c98f5f', '#8a5a3a', '#f0d0b0', '#a06a45'];
const SHIRT_COLORS = ['#3f7ec2', '#c94f42', '#58a05c', '#e0a83c', '#8a6fc0', '#d8d8d8', '#2f333a'];

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function createWorld(seed) {
  const random = makeRandom(seed);
  const state = {
    seed,
    time: 0.12, // morning
    elapsed: 0,
    cash: 0,
    health: PLAYER.health,
    wanted: 0,
    timeSinceCrime: 999,
    missionIndex: 0,
    stepIndex: 0,
    storyDone: false,
    gameOver: null, // 'busted' | 'wasted'
    overTimer: 0,
    message: '',
    messageTimer: 0,
    hurtCooldown: 0,
    fireTimer: 0,
    copSpawnTimer: 0,
    bustTimer: 0,
    ramTimer: 0,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    particles: [],
    buildings: [],
    trees: [],
    containers: [],
  };

  const player = {
    x: 520, y: 880, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null, invulnerable: 0,
  };
  state.player = player;

  // ---- city layout -------------------------------------------------------
  function buildCity() {
    const half = WORLD.roadWidth / 2;
    const blocks = [];
    for (let col = 0; col < WORLD.streetsX.length - 1; col += 1) {
      for (let row = 0; row < WORLD.streetsY.length - 1; row += 1) {
        blocks.push({
          x0: WORLD.streetsX[col] + half + 10,
          x1: WORLD.streetsX[col + 1] - half - 10,
          y0: WORLD.streetsY[row] + half + 10,
          y1: WORLD.streetsY[row + 1] - half - 10,
          col, row,
        });
      }
    }
    for (const block of blocks) {
      // Central Plaza is a park, not buildings; the beach strip is sand, not city.
      if (block.col === 2 && block.row === 2) continue;
      if (block.y0 > WORLD.beachY) continue;
      const count = randomInt(random, 1, 3);
      const bw = (block.x1 - block.x0) / count;
      for (let i = 0; i < count; i += 1) {
        const w = bw - randomInt(random, 8, 26);
        const h = (block.y1 - block.y0) - randomInt(random, 8, 30);
        const x = block.x0 + i * bw + randomInt(random, 2, 12);
        const y = block.y0 + randomInt(random, 2, 10);
        state.buildings.push({
          x, y, w, h,
          color: pick(random, BUILDING_COLORS),
          roof: pick(random, ['#5a4a3a', '#3a4a5a', '#6a3a3a', '#4a5a3a']),
        });
      }
    }
    // Central Plaza trees and a pond.
    for (let i = 0; i < 16; i += 1) {
      state.trees.push({
        x: 880 + random() * 240, y: 680 + random() * 160,
        r: randomInt(random, 10, 16),
      });
    }
    // The port: container stacks on the strip east of the last street.
    for (let i = 0; i < 10; i += 1) {
      state.containers.push({
        x: 2480 + (i % 2) * 34, y: 200 + Math.floor(i / 2) * 260,
        w: 30, h: 120,
        color: pick(random, ['#c2703f', '#3f7ec2', '#58a05c', '#c94f42']),
      });
    }
    // A few sidewalk trees along the main streets.
    for (let i = 0; i < 24; i += 1) {
      const vertical = random() < 0.5;
      state.trees.push({
        x: vertical ? pick(random, WORLD.streetsX) + 52 : 120 + random() * 2300,
        y: vertical ? 120 + random() * 1640 : pick(random, WORLD.streetsY) + 52,
        r: randomInt(random, 8, 12),
      });
    }
  }

  function nearestStreetX(x) {
    let best = WORLD.streetsX[0];
    for (const sx of WORLD.streetsX) if (Math.abs(sx - x) < Math.abs(best - x)) best = sx;
    return best;
  }

  function nearestStreetY(y) {
    let best = WORLD.streetsY[0];
    for (const sy of WORLD.streetsY) if (Math.abs(sy - y) < Math.abs(best - y)) best = sy;
    return best;
  }

  function onRoad(x, y) {
    const half = WORLD.roadWidth / 2;
    for (const sx of WORLD.streetsX) if (Math.abs(x - sx) <= half) return true;
    for (const sy of WORLD.streetsY) if (Math.abs(y - sy) <= half) return true;
    return false;
  }

  function hitsBuilding(x, y, r) {
    for (const b of state.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    for (const c of state.containers) {
      if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return true;
    }
    return false;
  }

  // Move a circle by (dx, dy), sliding along walls: try x first, then y.
  function moveCircle(entity, dx, dy, r) {
    const nx = entity.x + dx;
    if (!hitsBuilding(nx, entity.y, r) && nx - r > 0 && nx + r < WORLD.width) entity.x = nx;
    const ny = entity.y + dy;
    if (!hitsBuilding(entity.x, ny, r) && ny - r > 0 && ny + r < WORLD.waterY - 6) entity.y = ny;
  }

  function spawnCar(kind, x, y, angle, color) {
    const car = {
      kind, x, y, angle, speed: 0, color: color ?? pick(random, CAR_COLORS),
      hp: 100, dir: 0, turnCooldown: 0, disabled: 0, stolen: false, id: state.cars.length + 1,
    };
    state.cars.push(car);
    return car;
  }

  function spawnTrafficCar() {
    // A new car never spawns on top of the player: retry a few spots until
    // it is at least 300 px away.
    let x; let y; let dir;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const vertical = random() < 0.5;
      if (vertical) {
        x = pick(random, WORLD.streetsX);
        y = 80 + random() * (WORLD.height - 200);
        dir = random() < 0.5 ? 1 : 3;
      } else {
        x = 80 + random() * (WORLD.width - 160);
        y = pick(random, WORLD.streetsY);
        dir = random() < 0.5 ? 0 : 2;
      }
      if (Math.hypot(x - state.player.x, y - state.player.y) >= 300) break;
    }
    const car = spawnCar('traffic', x, y, DIRS[dir].angle);
    car.dir = dir;
    car.speed = CAR.trafficSpeed * (0.8 + random() * 0.4);
    return car;
  }

  function spawnParkedCar(x, y, angle) {
    const car = spawnCar('parked', x, y, angle);
    car.dir = 0;
    return car;
  }

  function spawnPed(x, y) {
    const ped = {
      x, y, angle: random() * Math.PI * 2, speed: 0, hp: 100,
      state: 'walk', tx: x, ty: y, wait: 0, skin: pick(random, PED_COLORS),
      shirt: pick(random, SHIRT_COLORS), deadTimer: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnPedNear(x, y) {
    // On a sidewalk: offset from the nearest street centreline.
    const sx = nearestStreetX(x);
    const sy = nearestStreetY(y);
    const px = x + (random() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 2 + 14);
    const py = y + (random() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 2 + 14);
    const ped = spawnPed(clamp(px, 20, WORLD.width - 20), clamp(py, 20, WORLD.waterY - 20));
    ped.tx = sx;
    ped.ty = sy;
    return ped;
  }

  function spawnPickup(x, y, kind, amount) {
    state.pickups.push({ x, y, kind, amount, active: true, bob: random() * Math.PI * 2 });
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 220) return;
      const a = random() * Math.PI * 2;
      const s = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + random() * 0.5, maxLife: 0.9, color, size: 2 + random() * 3,
      });
    }
  }

  // ---- wanted level ------------------------------------------------------
  function addWanted(stars) {
    if (stars <= 0) return;
    state.wanted = Math.min(WANTED.maxStars, state.wanted + stars);
    state.timeSinceCrime = 0;
  }

  function commitCrime(stars) {
    addWanted(stars);
    return EVENT_CRIME;
  }

  // ---- missions ----------------------------------------------------------
  function currentMission() {
    return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  }

  function currentStep() {
    const mission = currentMission();
    if (!mission) return null;
    return state.stepIndex < mission.steps.length ? mission.steps[state.stepIndex] : null;
  }

  /** Where the HUD should point: the active step's marker, or the nearest car. */
  function missionMarker() {
    const step = currentStep();
    if (!step) return null;
    if (step.kind === 'steal') {
      let best = null;
      let bestD = Infinity;
      for (const car of state.cars) {
        if (car.kind !== 'parked' && car.kind !== 'traffic') continue;
        const d = distance(player.x, player.y, car.x, car.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best ? { x: best.x, y: best.y, label: 'Steal a car' } : null;
    }
    if (step.kind === 'loseheat') return null;
    return { x: step.x, y: step.y, label: step.label };
  }

  function startMission(index) {
    const mission = MISSIONS[index];
    state.stepIndex = 0;
    if (mission.startWanted) state.wanted = mission.startWanted;
    if (index === 3) {
      for (const step of mission.steps) {
        if (step.kind === 'collect') spawnPickup(step.x, step.y, 'stash', 0);
      }
    }
    setMessage(`${mission.name} — ${mission.briefing}`, 6);
  }

  function completeStep() {
    state.stepIndex += 1;
    const mission = currentMission();
    if (state.stepIndex < mission.steps.length) {
      setMessage(currentStep().text, 4);
      return EVENT_MISSION;
    }
    state.cash += mission.reward;
    if (state.missionIndex + 1 >= MISSIONS.length) {
      state.storyDone = true;
      state.missionIndex = MISSIONS.length;
      setMessage(`Story complete — $${STORY_TOTAL} earned. Solmar Bay is yours.`, 8);
      return EVENT_MISSION | EVENT_STORY;
    }
    state.missionIndex += 1;
    startMission(state.missionIndex);
    return EVENT_MISSION;
  }

  function setMessage(text, seconds) {
    state.message = text;
    state.messageTimer = seconds;
  }

  // ---- police ------------------------------------------------------------
  function wantedCops() {
    return Math.min(5, state.wanted * WANTED.copsPerStar);
  }

  function spawnCop() {
    // On a road, 550-800 px from the player.
    for (let tries = 0; tries < 12; tries += 1) {
      const angle = random() * Math.PI * 2;
      const dist = 550 + random() * 250;
      const x = player.x + Math.cos(angle) * dist;
      const y = player.y + Math.sin(angle) * dist;
      if (x < 60 || x > WORLD.width - 60 || y < 60 || y > WORLD.waterY - 60) continue;
      const rx = nearestStreetX(x);
      const ry = nearestStreetY(y);
      const onX = Math.abs(x - rx) < 20;
      const spotX = onX ? rx : clamp(x, 60, WORLD.width - 60);
      const spotY = onX ? clamp(y, 60, WORLD.waterY - 60) : ry;
      const cop = spawnCar('police', spotX, spotY, 0, '#e8e8e8');
      cop.speed = CAR.policeSpeed;
      return cop;
    }
    return null;
  }

  function nearestCopDistance() {
    let best = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      best = Math.min(best, distance(player.x, player.y, car.x, car.y));
    }
    return best;
  }

  // ---- entering / leaving cars -------------------------------------------
  function nearestEnterableCar() {
    let best = null;
    let bestD = 56;
    for (const car of state.cars) {
      if (car.kind !== 'parked' && car.kind !== 'traffic') continue;
      if (car.kind === 'traffic' && car.speed > 40) continue;
      const d = distance(player.x, player.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar() {
    const car = nearestEnterableCar();
    if (!car) return 0;
    player.onFoot = false;
    player.car = car;
    player.angle = car.angle;
    player.speed = 0;
    car.kind = 'player';
    let events = EVENT_ENTER_CAR;
    if (!car.stolen) {
      car.stolen = true;
      events |= commitCrime(WANTED.stealCarStars);
    }
    const step = currentStep();
    if (step && step.kind === 'steal') events |= completeStep();
    return events;
  }

  function exitCar() {
    const car = player.car;
    if (!car) return 0;
    car.kind = 'parked';
    car.speed = 0;
    // Step out to the side that is clear of buildings.
    const side = car.angle + Math.PI / 2;
    let px = car.x + Math.cos(side) * 34;
    let py = car.y + Math.sin(side) * 34;
    if (hitsBuilding(px, py, PLAYER.radius + 2)) {
      px = car.x - Math.cos(side) * 34;
      py = car.y - Math.sin(side) * 34;
    }
    player.x = clamp(px, 20, WORLD.width - 20);
    player.y = clamp(py, 20, WORLD.waterY - 20);
    player.angle = car.angle;
    player.onFoot = true;
    player.car = null;
    return EVENT_EXIT_CAR;
  }

  // ---- combat ------------------------------------------------------------
  function shoot(aimX, aimY) {
    if (state.fireTimer > 0) return 0;
    state.fireTimer = 0.22;
    const ox = player.onFoot ? player.x : player.car.x;
    const oy = player.onFoot ? player.y : player.car.y;
    const angle = Math.atan2(aimY - oy, aimX - ox);
    state.bullets.push({
      x: ox + Math.cos(angle) * 22, y: oy + Math.sin(angle) * 22,
      vx: Math.cos(angle) * BULLET.speed, vy: Math.sin(angle) * BULLET.speed,
      life: BULLET.life,
    });
    addParticles(ox + Math.cos(angle) * 24, oy + Math.sin(angle) * 24, '#ffd76a', 4, 120);
    return EVENT_SHOT | commitCrime(WANTED.shootStars);
  }

  function damagePlayer(amount, fromX, fromY) {
    if (player.invulnerable > 0) return 0;
    state.health -= amount;
    player.invulnerable = 0.6;
    const away = Math.atan2(player.y - fromY, player.x - fromX);
    if (player.onFoot) {
      moveCircle(player, Math.cos(away) * 26, Math.sin(away) * 26, PLAYER.radius);
    }
    addParticles(player.x, player.y, '#c94f42', 8, 160);
    if (state.health <= 0) {
      state.health = 0;
      state.gameOver = 'wasted';
      state.overTimer = 0;
      return EVENT_HIT | EVENT_WASTED;
    }
    return EVENT_HIT;
  }

  function respawn() {
    const busted = state.gameOver === 'busted';
    state.cash = Math.max(0, state.cash - (busted ? 200 : 300));
    player.x = busted ? 2120 : 1160;
    player.y = busted ? 1600 : 160;
    player.angle = -Math.PI / 2;
    player.onFoot = true;
    player.car = null;
    player.speed = 0;
    player.invulnerable = 2;
    state.health = PLAYER.health;
    state.wanted = 0;
    state.timeSinceCrime = 999;
    state.bustTimer = 0;
    state.gameOver = null;
    // Restart the current mission from its first step.
    const mission = currentMission();
    if (mission) {
      state.stepIndex = 0;
      if (mission.startWanted) state.wanted = mission.startWanted;
    }
    // Clear police and stray bullets; traffic keeps driving.
    state.cars = state.cars.filter((car) => car.kind !== 'police');
    for (const car of state.cars) {
      if (car.kind === 'player') car.kind = 'parked';
      car.speed = 0;
    }
    state.bullets = [];
    setMessage(busted ? 'Busted — $200 bail. Mara still needs you.' : 'Wasted — $300 hospital bill. Get back out there.', 5);
  }

  // ---- reset -------------------------------------------------------------
  function reset() {
    state.time = 0.12;
    state.elapsed = 0;
    state.cash = 0;
    state.health = PLAYER.health;
    state.wanted = 0;
    state.timeSinceCrime = 999;
    state.missionIndex = 0;
    state.stepIndex = 0;
    state.storyDone = false;
    state.gameOver = null;
    state.overTimer = 0;
    state.message = '';
    state.messageTimer = 0;
    state.fireTimer = 0;
    state.copSpawnTimer = 0;
    state.bustTimer = 0;
    state.ramTimer = 0;
    player.x = 520;
    player.y = 880;
    player.angle = -Math.PI / 2;
    player.speed = 0;
    player.onFoot = true;
    player.car = null;
    player.invulnerable = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.pickups = [];
    state.particles = [];
    state.buildings = [];
    state.trees = [];
    state.containers = [];
    buildCity();
    // Parked cars along the streets, ready to steal. Each sits in a lane,
    // 22 px off its street's centreline, so it can always drive straight out.
    const parked = [
      [560, 182, 0], [862, 420, Math.PI / 2], [1200, 662, 0], [1502, 900, Math.PI / 2],
      [1840, 1142, 0], [2142, 1380, Math.PI / 2], [2400, 1622, 0], [498, 1140, -Math.PI / 2],
      [800, 138, Math.PI], [1458, 400, -Math.PI / 2], [2120, 902, 0], [1138, 1400, Math.PI / 2],
    ];
    for (const [x, y, a] of parked) spawnParkedCar(x, y, a);
    for (let i = 0; i < 10; i += 1) spawnTrafficCar();
    for (let i = 0; i < 24; i += 1) {
      spawnPedNear(200 + random() * 2200, 160 + random() * 1500);
    }
    // Cash lying around the city, and first-aid kits near the hospital.
    for (let i = 0; i < 8; i += 1) {
      spawnPickup(200 + random() * 2200, 160 + random() * 1500, 'cash', randomInt(random, 25, 100));
    }
    spawnPickup(1120, 200, 'health', 30);
    spawnPickup(1200, 120, 'health', 30);
    spawnPickup(2120, 1560, 'health', 30);
    startMission(0);
  }

  // ---- per-frame updates -------------------------------------------------
  function stepPlayer(dt, input) {
    if (player.onFoot) {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const mx = input.mx ?? 0;
      const my = input.my ?? 0;
      const len = Math.hypot(mx, my);
      if (len > 0.01) {
        player.angle = Math.atan2(my, mx);
        moveCircle(player, (mx / len) * speed * dt, (my / len) * speed * dt, PLAYER.radius);
      }
      if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    } else {
      const car = player.car;
      if (!car) { player.onFoot = true; return; }
      const forward = (input.my ?? 0) < 0 ? 1 : (input.my ?? 0) > 0 ? -1 : 0;
      const steer = input.mx ?? 0;
      if (forward > 0) car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
      else if (forward < 0) {
        car.speed = car.speed > 0
          ? Math.max(0, car.speed - CAR.brake * dt)
          : Math.max(-CAR.reverseMax, car.speed - CAR.accel * 0.5 * dt);
      } else {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
      }
      const turn = CAR.turnRate * (0.4 + 0.6 * Math.min(1, Math.abs(car.speed) / 200));
      car.angle += steer * turn * Math.sign(car.speed) * dt;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!hitsBuilding(nx, ny, 26)) {
        car.x = clamp(nx, 30, WORLD.width - 30);
        car.y = clamp(ny, 30, WORLD.waterY - 14);
      } else {
        if (Math.abs(car.speed) > 150) {
          state.health = Math.max(0, state.health - 6);
          addParticles(car.x, car.y, '#ffd76a', 10, 200);
          if (state.health <= 0) {
            state.gameOver = 'wasted';
            state.overTimer = 0;
            return EVENT_WASTED;
          }
        }
        car.speed *= -0.25;
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.speed = car.speed;
    }
    return 0;
  }

  function stepTraffic(dt) {
    const stuck = [];
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      if (car.disabled > 0) {
        car.disabled -= dt;
        car.speed = Math.max(0, car.speed - 200 * dt);
        continue;
      }
      car.turnCooldown = Math.max(0, car.turnCooldown - dt);
      const dir = DIRS[car.dir];
      // Slow down for a car ahead on the same street.
      let targetSpeed = CAR.trafficSpeed;
      let blockedBy = null;
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const ahead = dx * dir.dx + dy * dir.dy;
        const side = Math.abs(dx * dir.dy - dy * dir.dx);
        if (ahead > 0 && ahead < 78 && side < 40) {
          targetSpeed = Math.min(targetSpeed, 30);
          blockedBy = other;
        }
      }
      // Stuck behind a parked car for a while: give up and drive off, so the
      // street never jams solid behind street parking.
      car.blocked = blockedBy && blockedBy.kind === 'parked' ? (car.blocked ?? 0) + dt : 0;
      if (car.blocked > 4) {
        stuck.push(car);
        continue;
      }
      car.speed += clamp(targetSpeed - car.speed, -260 * dt, 160 * dt);
      car.x += dir.dx * car.speed * dt;
      car.y += dir.dy * car.speed * dt;
      car.angle = dir.angle;
      // At an intersection, sometimes turn onto the crossing street.
      const horizontal = car.dir % 2 === 0;
      const perp = horizontal ? nearestStreetX(car.x) : nearestStreetY(car.y);
      const along = horizontal ? car.x : car.y;
      if (car.turnCooldown <= 0 && Math.abs(along - perp) < 9) {
        if (random() < 0.35) {
          const left = (car.dir + 3) % 4;
          const right = (car.dir + 1) % 4;
          car.dir = random() < 0.5 ? left : right;
          if (horizontal) car.x = perp;
          else car.y = perp;
          car.turnCooldown = 2;
        } else {
          car.turnCooldown = 1;
        }
      }
      // Reached the end of a street: turn around.
      if (car.x < 90 || car.x > WORLD.width - 90 || car.y < 90 || car.y > WORLD.waterY - 90) {
        car.dir = (car.dir + 2) % 4;
        car.x = clamp(car.x, 100, WORLD.width - 100);
        car.y = clamp(car.y, 100, WORLD.waterY - 100);
        car.turnCooldown = 2;
      }
    }
    for (const car of stuck) state.cars.splice(state.cars.indexOf(car), 1);
    let traffic = 0;
    for (const car of state.cars) if (car.kind === 'traffic') traffic += 1;
    while (traffic < 10) {
      spawnTrafficCar();
      traffic += 1;
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.state === 'dead') {
        ped.deadTimer += dt;
        continue;
      }
      const dPlayer = distance(ped.x, ped.y, player.x, player.y);
      const danger = state.wanted > 0 && dPlayer < 260;
      if (danger || ped.state === 'flee') {
        ped.state = 'flee';
        const away = Math.atan2(ped.y - player.y, ped.x - player.x);
        ped.angle = away;
        moveCircle(ped, Math.cos(away) * PED.fleeSpeed * dt, Math.sin(away) * PED.fleeSpeed * dt, PED.radius);
        if (dPlayer > 420) ped.state = 'walk';
        continue;
      }
      ped.wait -= dt;
      if (ped.wait > 0) continue;
      const dTarget = distance(ped.x, ped.y, ped.tx, ped.ty);
      if (dTarget < 12) {
        // Pick a new stroll target on a nearby sidewalk.
        const vertical = random() < 0.5;
        if (vertical) {
          ped.tx = nearestStreetX(ped.x) + (random() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 2 + 14);
          ped.ty = clamp(ped.y + (random() - 0.5) * 420, 80, WORLD.waterY - 80);
        } else {
          ped.tx = clamp(ped.x + (random() - 0.5) * 420, 80, WORLD.width - 80);
          ped.ty = nearestStreetY(ped.y) + (random() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 2 + 14);
        }
        ped.wait = random() * 1.5;
        continue;
      }
      ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      moveCircle(ped, Math.cos(ped.angle) * PED.walkSpeed * dt, Math.sin(ped.angle) * PED.walkSpeed * dt, PED.radius);
    }
    state.peds = state.peds.filter((ped) => ped.state !== 'dead' || ped.deadTimer < 20);
  }

  function stepPolice(dt) {
    const target = wantedCops();
    const cops = state.cars.filter((car) => car.kind === 'police');
    state.copSpawnTimer -= dt;
    if (cops.length < target && state.copSpawnTimer <= 0) {
      if (spawnCop()) state.copSpawnTimer = 1.5;
    }
    if (cops.length > target) {
      // The heat is off: the furthest cop gives up and drives away.
      let far = null;
      let farD = -1;
      for (const cop of cops) {
        const d = distance(player.x, player.y, cop.x, cop.y);
        if (d > farD) { farD = d; far = cop; }
      }
      if (far) state.cars.splice(state.cars.indexOf(far), 1);
    }
    let busted = false;
    let anyClose = false;
    for (const cop of state.cars) {
      if (cop.kind !== 'police') continue;
      if (cop.disabled > 0) {
        cop.disabled -= dt;
        cop.speed = Math.max(0, cop.speed - 240 * dt);
        continue;
      }
      const want = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle += clamp(angleDelta(cop.angle, want), -3.4 * dt, 3.4 * dt);
      cop.speed = Math.min(CAR.policeSpeed, cop.speed + 320 * dt);
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      if (!hitsBuilding(nx, ny, 26)) {
        cop.x = clamp(nx, 30, WORLD.width - 30);
        cop.y = clamp(ny, 30, WORLD.waterY - 14);
      } else {
        cop.angle += 0.6 * dt * (random() < 0.5 ? 1 : -1);
        cop.speed *= 0.7;
      }
      const d = distance(cop.x, cop.y, player.x, player.y);
      if (player.onFoot && d < 34) anyClose = true;
      if (!player.onFoot && d < 52 && state.ramTimer <= 0) {
        state.ramTimer = 0.6;
        player.car.speed *= 0.55;
        addParticles(cop.x, cop.y, '#ffd76a', 8, 180);
        damagePlayer(5, cop.x, cop.y);
      }
    }
    // One timer for the whole step: several cops must not cancel each other out.
    if (player.onFoot) {
      if (anyClose) {
        state.bustTimer += dt;
        if (state.bustTimer >= PLAYER.bustTime) {
          state.gameOver = 'busted';
          state.overTimer = 0;
          busted = true;
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt);
      }
    }
    state.ramTimer = Math.max(0, state.ramTimer - dt);
    return busted ? EVENT_BUSTED : 0;
  }

  function stepBullets(dt) {
    let events = 0;
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < 0 || bullet.x > WORLD.width || bullet.y < 0 || bullet.y > WORLD.height) {
        bullet.life = 0;
        continue;
      }
      if (hitsBuilding(bullet.x, bullet.y, 2)) {
        bullet.life = 0;
        addParticles(bullet.x, bullet.y, '#c8c8c8', 4, 120);
        continue;
      }
      for (const ped of state.peds) {
        if (ped.state === 'dead') continue;
        if (distance(bullet.x, bullet.y, ped.x, ped.y) < PED.radius + 5) {
          bullet.life = 0;
          ped.hp -= BULLET.damage;
          addParticles(ped.x, ped.y, '#c94f42', 8, 150);
          if (ped.hp <= 0) {
            ped.state = 'dead';
            ped.deadTimer = 0;
            events |= commitCrime(WANTED.killPedStars);
          }
          break;
        }
      }
      if (bullet.life <= 0) continue;
      for (const car of state.cars) {
        if (car.kind === 'player') continue;
        const fx = car.x + Math.cos(car.angle) * 22;
        const fy = car.y + Math.sin(car.angle) * 22;
        const rx = car.x - Math.cos(car.angle) * 22;
        const ry = car.y - Math.sin(car.angle) * 22;
        if (distance(bullet.x, bullet.y, fx, fy) < 26 || distance(bullet.x, bullet.y, rx, ry) < 26) {
          bullet.life = 0;
          car.hp -= BULLET.damage;
          addParticles(bullet.x, bullet.y, '#ffd76a', 6, 160);
          if (car.hp <= 0 && car.disabled <= 0) {
            car.disabled = 10;
            car.speed = 0;
            addParticles(car.x, car.y, '#666', 14, 120);
          }
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function stepCarHits(dt) {
    // The player's car against pedestrians and traffic.
    if (player.onFoot || !player.car) return 0;
    const car = player.car;
    let events = 0;
    if (Math.abs(car.speed) > 80) {
      for (const ped of state.peds) {
        if (ped.state === 'dead') continue;
        if (distance(car.x, car.y, ped.x, ped.y) < 34) {
          ped.state = 'dead';
          ped.deadTimer = 0;
          ped.hp = 0;
          addParticles(ped.x, ped.y, '#c94f42', 10, 170);
          events |= commitCrime(WANTED.hitPedStars);
        }
      }
    }
    // Bump into traffic: both slow down, no crime, no damage.
    for (const other of state.cars) {
      if (other === car || other.kind === 'player') continue;
      if (distance(car.x, car.y, other.x, other.y) < 56) {
        const push = Math.atan2(car.y - other.y, car.x - other.x);
        car.x += Math.cos(push) * 60 * dt;
        car.y += Math.sin(push) * 60 * dt;
        car.speed *= 0.92;
        if (other.kind === 'traffic') other.speed *= 0.85;
      }
    }
    // Traffic running the player down on foot.
    return events;
  }

  function stepFootHits() {
    if (!player.onFoot) return 0;
    let events = 0;
    for (const car of state.cars) {
      if (car.kind !== 'traffic' && car.kind !== 'police') continue;
      if (Math.abs(car.speed) > 40 && distance(car.x, car.y, player.x, player.y) < 30) {
        events |= damagePlayer(15, car.x, car.y);
        car.speed *= 0.4;
      }
    }
    return events;
  }

  function stepPickups(dt) {
    let events = 0;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      pickup.bob += dt * 3;
      if (distance(player.x, player.y, pickup.x, pickup.y) < 34) {
        pickup.active = false;
        if (pickup.kind === 'cash') {
          state.cash += pickup.amount;
          events |= EVENT_PICKUP;
          setMessage(`+$${pickup.amount}`, 2);
        } else if (pickup.kind === 'health') {
          state.health = Math.min(PLAYER.health, state.health + pickup.amount);
          events |= EVENT_PICKUP;
          setMessage(`+${pickup.amount} health`, 2);
        } else if (pickup.kind === 'stash') {
          events |= EVENT_PICKUP;
          const step = currentStep();
          if (step && step.kind === 'collect') events |= completeStep();
        }
      }
    }
    state.pickups = state.pickups.filter((p) => p.active || p.kind === 'stash');
    return events;
  }

  function stepMission() {
    const step = currentStep();
    if (!step) return 0;
    if (step.kind === 'goto' || step.kind === 'collect') {
      if (step.kind === 'goto' && distance(player.x, player.y, step.x, step.y) < 48) {
        return completeStep();
      }
      return 0;
    }
    if (step.kind === 'loseheat' && state.wanted === 0) {
      return completeStep();
    }
    return 0;
  }

  function stepWanted(dt) {
    state.timeSinceCrime += dt;
    if (state.wanted > 0 && state.timeSinceCrime > WANTED.decaySeconds && nearestCopDistance() > 420) {
      state.wanted -= 1;
      state.timeSinceCrime = 0;
      if (state.wanted === 0) setMessage('You lost the heat.', 3);
    }
  }

  function stepParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // ---- the frame ---------------------------------------------------------
  /**
   * One fixed step. `input` is { mx, my, run, enterPressed, shootPressed,
   * shootHeld, aimX, aimY }. Edge presses are consumed here. With `harmless`
   * set (the title screen's backdrop) the city moves but nothing can hurt the
   * player and no mission can advance.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.time = (state.time + dt / DAY_LENGTH) % 1;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    if (state.fireTimer > 0) state.fireTimer -= dt;
    if (harmless) {
      stepTraffic(dt);
      stepPeds(dt);
      stepParticles(dt);
      return 0;
    }
    if (state.gameOver) {
      state.overTimer += dt;
      stepParticles(dt);
      return 0;
    }
    if (input.enterPressed) {
      events |= player.onFoot ? enterCar() : exitCar();
    }
    if (input.shootPressed || input.shootHeld) {
      events |= shoot(input.aimX ?? player.x + Math.cos(player.angle) * 100, input.aimY ?? player.y + Math.sin(player.angle) * 100);
    }
    events |= stepPlayer(dt, input);
    if (state.gameOver) return events | EVENT_WASTED;
    stepTraffic(dt);
    stepPeds(dt);
    events |= stepPolice(dt);
    if (state.gameOver) return events;
    events |= stepBullets(dt);
    events |= stepCarHits(dt);
    events |= stepFootHits();
    if (state.gameOver) return events;
    events |= stepPickups(dt);
    events |= stepMission();
    stepWanted(dt);
    stepParticles(dt);
    // Slow health recovery when nobody is chasing.
    if (state.wanted === 0 && state.health > 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + 3 * dt);
    }
    return events;
  }

  function loadSave(save) {
    state.cash = save.cash ?? 0;
    state.missionIndex = save.missionIndex ?? 0;
    state.stepIndex = save.stepIndex ?? 0;
    state.storyDone = state.missionIndex >= MISSIONS.length;
    player.x = save.x ?? 520;
    player.y = save.y ?? 880;
    player.angle = save.angle ?? -Math.PI / 2;
    state.time = save.time ?? 0.12;
    state.wanted = 0;
    state.health = PLAYER.health;
    const mission = currentMission();
    if (mission) {
      if (mission.startWanted) state.wanted = mission.startWanted;
      if (state.missionIndex === 3) {
        for (let i = state.stepIndex; i < mission.steps.length; i += 1) {
          const missionStep = mission.steps[i];
          if (missionStep.kind === 'collect') spawnPickup(missionStep.x, missionStep.y, 'stash', 0);
        }
      }
      setMessage(`${mission.name} — ${mission.briefing}`, 6);
    }
  }

  reset();
  return {
    state, reset, step, respawn, loadSave,
    currentMission, currentStep, missionMarker, nearestEnterableCar,
    onRoad, nearestStreetX, nearestStreetY,
  };
}
