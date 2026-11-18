// Solmar Bay's rules and state, with no drawing and no browser in it: the
// player on foot and in cars, traffic and pedestrians, police chases, the
// wanted system, gang shootouts, the four-mission story and the city itself.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can play sounds and announce without the world knowing how.
// Nothing here allocates after createWorld returns, except particles.

import {
  AVENUES, CAR, GANG, MISSIONS, PALETTE, PED, PLACES, POLICE, PORT,
  PLAYER, ROAD_W, SAND_Y, STREETS, TOTAL_PAY, TRAFFIC, WANTED, WATER_Y, WORLD,
} from './config.js';
import { pick, randInt } from './random.js';

export const KIND_CAR = 0;
export const KIND_PED = 1;

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_MISSION = 16;
export const EVENT_CRIME = 32;
export const EVENT_OVER = 64;
export const EVENT_ENTER = 128;

export const ACTION_ENTER = 1;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when the point is on a road surface (avenue or street). */
export function onRoad(x, y) {
  const half = ROAD_W / 2;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= half) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= half) return true;
  return false;
}

/** The nearest point on any road centreline. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  }
  return best;
}

function nearestAvenue(x) {
  let best = AVENUES[0];
  for (const ax of AVENUES) if (Math.abs(ax - x) < Math.abs(best - x)) best = ax;
  return best;
}

function nearestStreet(y) {
  let best = STREETS[0];
  for (const sy of STREETS) if (Math.abs(sy - y) < Math.abs(best - y)) best = sy;
  return best;
}

/**
 * Waypoints along the road grid from (x, y) to (tx, ty): out to the nearest
 * avenue, along it to the street nearest the target, then along that street.
 */
export function planRoute(x, y, tx, ty) {
  const points = [];
  const start = nearestRoadPoint(x, y);
  points.push(start);
  const avenue = nearestAvenue(tx);
  if (Math.abs(start.x - avenue) > 4) points.push({ x: avenue, y: start.y });
  const street = nearestStreet(ty);
  if (Math.abs(start.y - street) > 4) points.push({ x: avenue, y: street });
  points.push({ x: tx, y: ty });
  return points;
}

/** Push a circle out of a rectangle; returns true when it overlapped. */
function pushCircleRect(c, r, rect) {
  const nx = clamp(c.x, rect.x, rect.x + rect.w);
  const ny = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * r;
    c.y = ny + (dy / d) * r;
  } else {
    // Centre inside the rectangle: push out along the smallest overlap.
    const left = c.x - rect.x;
    const right = rect.x + rect.w - c.x;
    const top = c.y - rect.y;
    const bottom = rect.y + rect.h - c.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) c.x = rect.x - r;
    else if (m === right) c.x = rect.x + rect.w + r;
    else if (m === top) c.y = rect.y - r;
    else c.y = rect.y + rect.h + r;
  }
  return true;
}

export function createWorld(random) {
  // ---- the city, built once from the seed ---------------------------------
  const buildings = [];
  const trees = [];
  const containers = [];
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const x0 = AVENUES[ai] + ROAD_W / 2 + 24;
      const x1 = AVENUES[ai + 1] - ROAD_W / 2 - 24;
      const y0 = STREETS[si] + ROAD_W / 2 + 24;
      const y1 = STREETS[si + 1] - ROAD_W / 2 - 24;
      if (ai === 4 || si === 3) continue; // port and beachfront stay open
      // One block is the park; the rest get one or two buildings.
      if (ai === 1 && si === 1) {
        for (let t = 0; t < 9; t += 1) {
          trees.push({ x: x0 + random() * (x1 - x0), y: y0 + random() * (y1 - y0), r: 14 + random() * 10 });
        }
        continue;
      }
      const n = 1 + Math.floor(random() * 2);
      for (let b = 0; b < n; b += 1) {
        const bw = 90 + random() * 130;
        const bh = 70 + random() * 110;
        const bx = x0 + random() * Math.max(1, x1 - x0 - bw);
        const by = y0 + random() * Math.max(1, y1 - y0 - bh);
        buildings.push({ x: bx, y: by, w: bw, h: bh, color: pick(random, PALETTE.building) });
      }
    }
  }
  for (let i = 0; i < 10; i += 1) {
    containers.push({
      x: PORT.x + 16 + random() * (PORT.w - 90),
      y: PORT.y + 16 + random() * (PORT.h - 60),
      w: 56 + random() * 20,
      h: 26,
      color: pick(random, PALETTE.container),
    });
  }

  const player = {
    x: PLACES.safehouse.x, y: PLACES.safehouse.y, angle: 0,
    health: PLAYER.health, inCar: null, shootCd: 0, hurtTimer: 0,
    bustTimer: 0, moveX: 0, moveY: 0, speed: 0,
  };
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnTrafficCar(true));
  const peds = [];
  for (let i = 0; i < PED.count; i += 1) peds.push(spawnPed(true));
  const gang = [];
  const pickups = [];
  for (let i = 0; i < 10; i += 1) {
    const p = nearestRoadPoint(200 + random() * 2160, 150 + random() * 1400);
    pickups.push({ x: p.x + (random() - 0.5) * 60, y: p.y + (random() - 0.5) * 60, amount: 50, active: true });
  }
  const particles = [];
  const police = [];

  const state = {
    time: 0, dayTime: 9, cash: 0, mission: 0, stage: 0, wanted: 0,
    wantedTimer: 0, crimeCooldown: 0, policeTimer: 0,
    player, cars, peds, gang, pickups, particles, police,
    buildings, trees, containers,
    banner: null, over: null, objective: MISSIONS[0].stages[0].label,
    stats: { shots: 0, hits: 0, carsStolen: 0, pedsHit: 0 },
    vaultCar: null,
  };

  function spawnTrafficCar(anywhere) {
    const avenue = pick(random, AVENUES);
    const street = pick(random, STREETS);
    const vertical = random() < 0.5;
    const car = {
      x: vertical ? avenue : 120 + random() * (WORLD.width - 240),
      y: vertical ? 120 + random() * (SAND_Y - 240) : street,
      angle: vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI),
      speed: TRAFFIC.cruise * (0.85 + random() * 0.3),
      health: CAR.health, color: pick(random, TRAFFIC.colors),
      police: false, vault: false, driver: 'traffic',
      route: null, routeIndex: 0, wait: 0,
    };
    if (!anywhere) { car.x = state.player.x + (random() < 0.5 ? -1 : 1) * (500 + random() * 300); car.y = state.player.y + (random() - 0.5) * 400; }
    car.route = planRoute(car.x, car.y, 120 + random() * (WORLD.width - 240), 120 + random() * (SAND_Y - 240));
    return car;
  }

  function spawnPed(anywhere) {
    const p = nearestRoadPoint(150 + random() * 2260, 120 + random() * 1500);
    return {
      x: p.x + (random() - 0.5) * 70, y: p.y + (random() - 0.5) * 70,
      angle: random() * Math.PI * 2, speed: PED.walkSpeed * (0.8 + random() * 0.4),
      tx: p.x, ty: p.y, flee: 0, fx: 0, fy: 0, color: pick(random, PALETTE.ped),
    };
  }

  function spawnPoliceCar() {
    const a = random() * Math.PI * 2;
    const car = {
      x: clamp(state.player.x + Math.cos(a) * POLICE.spawnRange, 80, WORLD.width - 80),
      y: clamp(state.player.y + Math.sin(a) * POLICE.spawnRange, 80, SAND_Y - 80),
      angle: 0, speed: 0, health: CAR.health, color: PALETTE.police,
      police: true, vault: false, driver: 'police', route: null, routeIndex: 0, wait: 0,
      leaveTimer: 8, rammed: false, routeTimer: 0, leaving: false,
    };
    car.angle = angleTo(car.x, car.y, state.player.x, state.player.y);
    return car;
  }

  function spawnGangMember(x, y) {
    gang.push({ x, y, angle: 0, health: GANG.health, shootCd: 0.5 + random(), alive: true });
  }

  function addParticles(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      if (particles.length > 220) return;
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + random() * 0.3, color, size: 2 + random() * 3 });
    }
  }

  function setBanner(text, sub, seconds) {
    state.banner = { text, sub: sub ?? '', t: seconds ?? 3 };
  }

  function raiseWanted(amount, eventOut) {
    if (state.crimeCooldown > 0) return eventOut;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.crimeCooldown = 2;
    state.wantedTimer = WANTED.decaySeconds;
    return eventOut | EVENT_CRIME;
  }

  function currentStage() {
    if (state.mission < 0 || state.mission >= MISSIONS.length) return null;
    return MISSIONS[state.mission].stages[state.stage];
  }

  function startMission(index) {
    const mission = MISSIONS[index];
    state.objective = mission.stages[0].label;
    setBanner(mission.name, mission.intro, 4);
    if (index === 1) {
      state.wanted = 2;
      state.wantedTimer = WANTED.decaySeconds;
    }
    if (index === 2) {
      spawnGangMember(2320, 400);
      spawnGangMember(2380, 470);
      spawnGangMember(790, 1080);
      spawnGangMember(1740, 1600);
    }
    if (index === 3) {
      const vault = {
        x: PLACES.port.x, y: PLACES.port.y, angle: Math.PI / 2, speed: 0,
        health: CAR.health, color: '#f2c94c', police: false, vault: true,
        driver: 'parked', route: null, routeIndex: 0, wait: 0,
      };
      cars.push(vault);
      state.vaultCar = vault;
    }
  }

  function completeStage() {
    const mission = MISSIONS[state.mission];
    state.stage += 1;
    if (state.stage >= mission.stages.length) {
      state.cash += mission.pay;
      setBanner('MISSION COMPLETE', `${mission.name}  +$${mission.pay}`, 3.5);
      state.mission += 1;
      state.stage = 0;
      if (state.mission >= MISSIONS.length) {
        state.mission = -1;
        state.objective = 'Solmar Bay is yours.';
        state.over = 'complete';
        return EVENT_MISSION | EVENT_OVER;
      }
      startMission(state.mission);
      return EVENT_MISSION;
    }
    state.objective = mission.stages[state.stage].label;
    return EVENT_MISSION;
  }

  function collideBuildings(c, r) {
    for (const b of buildings) pushCircleRect(c, r, b);
    for (const k of containers) pushCircleRect(c, r, k);
  }

  function damageCar(car, amount, events) {
    car.health -= amount;
    addParticles(car.x, car.y, '#e5534b', 6, 160);
    if (car.health <= 0 && car.driver === 'player') {
      player.inCar = null;
      player.x = car.x + 40;
      player.y = car.y;
      car.driver = 'wreck';
      return events | EVENT_CRASH;
    }
    return events;
  }

  // ---- the step ------------------------------------------------------------
  function stepPlayer(dt, input, actions) {
    const p = player;
    if (p.inCar) {
      // E while driving slowly steps back out onto the street.
      if (actions & ACTION_ENTER) {
        const car = p.inCar;
        if (Math.abs(car.speed) < 40) {
          p.inCar = null;
          car.driver = 'parked';
          p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
          p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
          p.x = clamp(p.x, 20, WORLD.width - 20);
          p.y = clamp(p.y, 20, WATER_Y - 14);
          collideBuildings(p, PLAYER.radius);
          return EVENT_ENTER;
        }
      }
      return 0;
    }
    const mx = input.x;
    const my = input.y;
    const mag = Math.hypot(mx, my);
    const speed = mag > 0.1 ? PLAYER.walkSpeed : 0;
    if (mag > 0.1) {
      p.angle = Math.atan2(my, mx);
      p.x += (mx / Math.max(1, mag)) * speed * dt;
      p.y += (my / Math.max(1, mag)) * speed * dt;
    }
    p.speed = speed;
    p.x = clamp(p.x, 20, WORLD.width - 20);
    p.y = clamp(p.y, 20, WATER_Y - 14);
    collideBuildings(p, PLAYER.radius);
    if (p.health < PLAYER.health && p.hurtTimer <= 0) {
      p.health = Math.min(PLAYER.health, p.health + PLAYER.regenRate * dt);
    }
    if (actions & ACTION_ENTER) {
      let best = null;
      let bestD = CAR.enterRange;
      for (const car of cars) {
        if (car.driver === 'player' || car.driver === 'police' || car.driver === 'wreck') continue;
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best) {
        const wasTraffic = best.driver === 'traffic' || best.driver === 'parked';
        p.inCar = best;
        best.driver = 'player';
        best.speed = 0;
        let ev = EVENT_ENTER;
        const stage = currentStage();
        if (stage && stage.type === 'steal' && best === state.vaultCar) ev |= completeStage();
        if (wasTraffic && !best.vault) {
          state.stats.carsStolen += 1;
          return ev | raiseWanted(WANTED.steal, 0);
        }
        return ev;
      }
      // Interact with the current mission stage when close enough.
      const stage = currentStage();
      if (stage && (stage.type === 'interact' || stage.type === 'steal') && dist(p.x, p.y, stage.x, stage.y) <= stage.r) {
        return EVENT_ENTER | completeStage();
      }
    }
    return 0;
  }

  function stepPlayerCar(dt, input) {
    const car = player.inCar;
    if (!car) return 0;
    const steer = input.x;
    const throttle = -input.y; // pushing up (negative y) is the accelerator
    const forward = throttle > 0 ? throttle : 0;
    const braking = throttle < 0 ? -throttle : 0;
    const speedSign = car.speed >= 0 ? 1 : -1;
    car.speed += forward * CAR.accel * dt;
    car.speed -= braking * CAR.brake * dt;
    if (throttle === 0) car.speed -= car.speed * 0.9 * dt;
    if (car.speed > CAR.maxSpeed) car.speed = CAR.maxSpeed;
    if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
    if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
    const turn = steer * CAR.steer * clamp(Math.abs(car.speed) / 160, 0, 1) * speedSign;
    car.angle += turn * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 30, WORLD.width - 30);
    car.y = clamp(car.y, 30, WATER_Y - 16);
    const hit = collideBuildings(car, 20);
    if (hit && Math.abs(car.speed) > 120) {
      car.speed *= 0.4;
      return damageCar(car, 6, EVENT_CRASH);
    }
    return 0;
  }

  function driveToward(car, tx, ty, dt, cruise) {
    const desired = angleTo(car.x, car.y, tx, ty);
    const diff = angleDiff(car.angle, desired);
    const d = dist(car.x, car.y, tx, ty);
    if (d < 26) return true;
    car.angle += clamp(diff * 3, -2.2, 2.2) * dt;
    const target = Math.abs(diff) > 1.1 ? cruise * 0.35 : cruise;
    car.speed += (target - car.speed) * Math.min(1, 2.2 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 30, WORLD.width - 30);
    car.y = clamp(car.y, 30, WATER_Y - 16);
    collideBuildings(car, 20);
    return false;
  }

  function stepTraffic(dt) {
    for (const car of cars) {
      if (car.driver !== 'traffic') continue;
      if (car.wait > 0) { car.wait -= dt; continue; }
      // Slow down for a car right ahead.
      let blocked = false;
      for (const other of cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (ahead > 0 && ahead < 78 && side < 30) { blocked = true; break; }
      }
      if (blocked) { car.speed = Math.max(0, car.speed - 300 * dt); continue; }
      if (!car.route || car.routeIndex >= car.route.length) {
        car.route = planRoute(car.x, car.y, 120 + random() * (WORLD.width - 240), 120 + random() * (SAND_Y - 240));
        car.routeIndex = 0;
      }
      const wp = car.route[car.routeIndex];
      if (driveToward(car, wp.x, wp.y, dt, TRAFFIC.cruise)) car.routeIndex += 1;
    }
  }

  function stepPolice(dt) {
    let events = 0;
    // Keep the right number of units on the street.
    const wantedCount = Math.min(state.wanted, POLICE.maxActive);
    state.policeTimer -= dt;
    if (state.wanted > 0 && police.length < wantedCount && state.policeTimer <= 0) {
      police.push(spawnPoliceCar());
      state.policeTimer = 2.5;
    }
    for (let i = police.length - 1; i >= 0; i -= 1) {
      const unit = police[i];
      if (state.wanted === 0) {
        // Wanted cleared: the unit takes the roads out of town and leaves.
        // A timer backs it up, so a unit wedged on a building still goes.
        unit.leaveTimer -= dt;
        if (!unit.route || !unit.leaving) {
          unit.route = planRoute(unit.x, unit.y, WORLD.width - 120, clamp(unit.y, 120, SAND_Y - 120));
          unit.routeIndex = 0;
          unit.leaving = true;
        }
        if (unit.routeIndex < unit.route.length) {
          const wp = unit.route[unit.routeIndex];
          if (driveToward(unit, wp.x, wp.y, dt, POLICE.cruise)) unit.routeIndex += 1;
        }
        if (dist(unit.x, unit.y, player.x, player.y) > POLICE.despawnRange || unit.leaveTimer <= 0) police.splice(i, 1);
        continue;
      }
      const target = player.inCar ? player.inCar : player;
      const d = dist(unit.x, unit.y, target.x, target.y);
      // Chase along the road grid, re-planned once a second; only the last
      // stretch, close in, is a straight line at the player. Cutting across
      // blocks looks wrong and lets a unit through buildings.
      unit.leaving = false;
      if (d > 150) {
        unit.routeTimer -= dt;
        if (unit.routeTimer <= 0 || !unit.route || unit.routeIndex >= unit.route.length) {
          unit.route = planRoute(unit.x, unit.y, target.x, target.y);
          unit.routeIndex = 0;
          unit.routeTimer = 1;
        }
        const wp = unit.route[unit.routeIndex];
        if (driveToward(unit, wp.x, wp.y, dt, POLICE.chaseSpeed)) unit.routeIndex += 1;
      } else {
        driveToward(unit, target.x, target.y, dt, POLICE.chaseSpeed);
      }
      // A ram lands once per approach: the unit must pull away before it
      // can hit the car again, so a chase shreds paint, not the whole car.
      if (player.inCar && d < 62 && Math.abs(unit.speed) > 60) {
        if (!unit.rammed) {
          unit.rammed = true;
          events |= damageCar(player.inCar, POLICE.ramDamage, 0);
          addParticles(unit.x, unit.y, '#f2c94c', 3, 120);
          events |= EVENT_CRASH;
        }
      } else if (d > 100) {
        unit.rammed = false;
      }
      if (!player.inCar && d < POLICE.bustRange && player.speed < 80) {
        player.bustTimer += dt;
        if (player.bustTimer >= POLICE.bustTime) {
          state.over = 'busted';
          events |= EVENT_OVER;
        }
      } else {
        player.bustTimer = Math.max(0, player.bustTimer - dt * 2);
      }
    }
    return events;
  }

  function stepGang(dt) {
    let events = 0;
    const tx = player.inCar ? player.inCar.x : player.x;
    const ty = player.inCar ? player.inCar.y : player.y;
    for (const g of gang) {
      if (!g.alive) continue;
      const d = dist(g.x, g.y, tx, ty);
      if (d < GANG.shootRange) {
        g.angle = angleTo(g.x, g.y, tx, ty);
        g.shootCd -= dt;
        if (g.shootCd <= 0 && !player.inCar) {
          g.shootCd = GANG.shootCooldown;
          if (random() < GANG.accuracy) {
            player.health -= GANG.shootDamage;
            player.hurtTimer = PLAYER.regenDelay;
            addParticles(player.x, player.y, '#e5534b', 5, 140);
            events |= EVENT_HIT;
            if (player.health <= 0) {
              player.health = 0;
              state.over = 'wasted';
              events |= EVENT_OVER;
            }
          }
          addParticles(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18, '#f2c94c', 3, 120);
        }
      } else {
        g.shootCd = Math.max(0, g.shootCd - dt);
      }
    }
    return events;
  }

  function stepPeds(dt) {
    for (const ped of peds) {
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.x += Math.cos(ped.angle) * PED.fleeSpeed * dt;
        ped.y += Math.sin(ped.angle) * PED.fleeSpeed * dt;
      } else {
        const d = dist(ped.x, ped.y, ped.tx, ped.ty);
        if (d < 24) {
          const p = nearestRoadPoint(ped.x + (random() - 0.5) * 500, ped.y + (random() - 0.5) * 500);
          ped.tx = p.x + (random() - 0.5) * 60;
          ped.ty = p.y + (random() - 0.5) * 60;
        }
        ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.x = clamp(ped.x, 20, WORLD.width - 20);
      ped.y = clamp(ped.y, 20, WATER_Y - 14);
      collideBuildings(ped, PED.radius);
    }
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function shoot() {
    const p = player;
    if (p.inCar || p.shootCd > 0) return 0;
    p.shootCd = PLAYER.shootCooldown;
    state.stats.shots += 1;
    let events = EVENT_SHOT;
    events |= raiseWanted(WANTED.shoot, 0);
    // Fleeing pedestrians near the shot.
    for (const ped of peds) {
      if (dist(ped.x, ped.y, p.x, p.y) < 320) {
        ped.flee = 2.5;
        ped.angle = angleTo(p.x, p.y, ped.x, ped.y);
      }
    }
    const mx = p.x + Math.cos(p.angle) * 16;
    const my = p.y + Math.sin(p.angle) * 16;
    addParticles(mx, my, '#f2c94c', 4, 200);
    // Nearest gang member inside the firing cone takes the hit.
    let best = null;
    let bestD = PLAYER.shootRange;
    for (const g of gang) {
      if (!g.alive) continue;
      const d = dist(p.x, p.y, g.x, g.y);
      if (d >= bestD) continue;
      const diff = Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, g.x, g.y)));
      if (diff < 0.22) { bestD = d; best = g; }
    }
    if (best) {
      best.health -= PLAYER.shootDamage;
      state.stats.hits += 1;
      addParticles(best.x, best.y, '#e5534b', 8, 180);
      if (best.health <= 0) {
        best.alive = false;
        events |= raiseWanted(WANTED.kill, 0);
      }
    }
    return events;
  }

  function stepMissions(dt) {
    const stage = currentStage();
    if (!stage || state.over) return 0;
    if (stage.type === 'goto' || stage.type === 'deliver') {
      const inVault = stage.type === 'deliver' ? player.inCar === state.vaultCar : true;
      const px = player.inCar ? player.inCar.x : player.x;
      const py = player.inCar ? player.inCar.y : player.y;
      if (inVault && dist(px, py, stage.x, stage.y) <= stage.r) return completeStage();
    }
    if (stage.type === 'lose' && state.wanted === 0) return completeStage();
    return 0;
  }

  function step(dt, input, actions) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;
    state.dayTime = (state.dayTime + dt / 40) % 24;
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    if (player.shootCd > 0) player.shootCd -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
    // Wanted decays when the heat is off: no fresh crime and no unit close.
    if (state.wanted > 0) {
      state.wantedTimer -= dt;
      let near = false;
      for (const unit of police) {
        if (dist(unit.x, unit.y, player.x, player.y) < 500) { near = true; break; }
      }
      if (state.wantedTimer <= 0 && !near) {
        state.wanted -= 1;
        state.wantedTimer = WANTED.decaySeconds;
      }
    }
    events |= stepPlayer(dt, input, actions);
    if (input.shoot) events |= shoot();
    events |= stepPlayerCar(dt, input);
    events |= stepTraffic(dt);
    events |= stepPolice(dt);
    events |= stepGang(dt);
    stepPeds(dt);
    stepParticles(dt);
    // Car-on-car bumps and pedestrians hit by a moving car.
    for (const car of cars) {
      if (car.driver !== 'player' || Math.abs(car.speed) < 140) continue;
      for (const ped of peds) {
        if (dist(ped.x, ped.y, car.x, car.y) < 34) {
          ped.x = car.x + Math.cos(car.angle) * 90;
          ped.y = car.y + Math.sin(car.angle) * 90;
          ped.flee = 3;
          ped.angle = angleTo(car.x, car.y, ped.x, ped.y);
          state.stats.pedsHit += 1;
          addParticles(ped.x, ped.y, '#e5534b', 6, 160);
          events |= raiseWanted(WANTED.hitPed, 0);
        }
      }
    }
    // Cash pickups.
    for (const pk of pickups) {
      if (!pk.active) continue;
      const px = player.inCar ? player.inCar.x : player.x;
      const py = player.inCar ? player.inCar.y : player.y;
      if (dist(px, py, pk.x, pk.y) < 34) {
        pk.active = false;
        state.cash += pk.amount;
        addParticles(pk.x, pk.y, '#7be07b', 8, 140);
        events |= EVENT_PICKUP;
      }
    }
    events |= stepMissions(dt);
    return events;
  }

  function reset() {
    player.x = PLACES.safehouse.x;
    player.y = PLACES.safehouse.y;
    player.angle = 0;
    player.health = PLAYER.health;
    player.inCar = null;
    player.shootCd = 0;
    player.hurtTimer = 0;
    player.bustTimer = 0;
    player.speed = 0;
    state.time = 0;
    state.dayTime = 9;
    state.cash = 0;
    state.mission = 0;
    state.stage = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.crimeCooldown = 0;
    state.policeTimer = 0;
    state.banner = null;
    state.over = null;
    state.objective = MISSIONS[0].stages[0].label;
    state.stats = { shots: 0, hits: 0, carsStolen: 0, pedsHit: 0 };
    state.vaultCar = null;
    gang.length = 0;
    police.length = 0;
    particles.length = 0;
    cars.length = 0;
    for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnTrafficCar(true));
    peds.length = 0;
    for (let i = 0; i < PED.count; i += 1) peds.push(spawnPed(true));
    for (const pk of pickups) pk.active = true;
    startMission(0);
  }

  function loadProgress(missionIndex, cash) {
    reset();
    state.cash = cash;
    if (missionIndex > 0 && missionIndex < MISSIONS.length) {
      state.mission = missionIndex;
      state.stage = 0;
      startMission(missionIndex);
    }
  }

  /**
   * Put the world into a named scene for a screenshot, using the same spawn
   * and mission machinery as real play: the frame is a moment a short game
   * really reaches, staged at a chosen point in it.
   */
  function stageScene(name) {
    reset();
    if (name === 'start') {
      for (let i = 0; i < 5 / (1 / 60); i += 1) step(1 / 60, { x: 0, y: 0, shoot: false }, 0);
      return 'title';
    }
    if (name === 'drive') {
      // Mission 1: Mara has the package and is driving to the safehouse.
      completeStage();
      completeStage();
      const car = cars[0];
      car.x = 1280; car.y = 1100; car.angle = -Math.PI / 2; car.speed = 0;
      car.color = '#e67e22';
      player.inCar = car;
      car.driver = 'player';
      state.wanted = 1;
      state.wantedTimer = WANTED.decaySeconds;
      police.push(spawnPoliceCar());
      return 'drive';
    }
    if (name === 'action') {
      // Mission 2: three stars, two units closing in on a speeding Mara.
      state.mission = 1;
      state.stage = 0;
      startMission(1);
      const car = cars[1];
      car.x = 1760; car.y = 700; car.angle = 0; car.speed = 420;
      car.color = '#f2c94c';
      player.inCar = car;
      car.driver = 'player';
      state.wanted = 3;
      state.wantedTimer = WANTED.decaySeconds;
      for (let i = 0; i < 2; i += 1) police.push(spawnPoliceCar());
      return 'action';
    }
    // 'end': the vault car is home — the heist is done, $5,000 banked.
    state.mission = 3;
    state.stage = 2;
    startMission(3);
    state.cash = TOTAL_PAY - MISSIONS[3].pay;
    const vault = state.vaultCar;
    vault.x = PLACES.garage.x; vault.y = PLACES.garage.y; vault.angle = Math.PI;
    player.inCar = vault;
    vault.driver = 'player';
    state.wanted = 0;
    step(1 / 60, { x: 0, y: 0, shoot: false }, 0);
    return 'end';
  }

  startMission(0);
  return { state, step, reset, stageScene, loadProgress, planRoute, spawnPoliceCar, addParticles };
}
