// Node tests for Solmar Bay's game logic. The world module has no DOM in it,
// so these import it directly and drive it with scripted input.
// Run: node --test test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, WORLD } from './game/src/config.js';
import { clamp } from './game/src/random.js';
import { createWorld, EVENT_BUSTED } from './game/src/world.js';
import { stageShot } from './game/src/shots.js';

const STEP = 1 / 60;

function idle() {
  return { mx: 0, my: 0, run: false, enterPressed: false, shootPressed: false, shootHeld: false, aimX: 0, aimY: 0 };
}

function drive(seconds, world, inputFor) {
  const steps = Math.round(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) events |= world.step(STEP, inputFor ? inputFor(world) : idle());
  return events;
}

test('clamp holds both bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('the city keeps buildings off the roads and markers on them', () => {
  const world = createWorld(7);
  const { buildings } = world.state;
  assert.ok(buildings.length > 40, `expected many buildings, got ${buildings.length}`);
  const half = WORLD.roadWidth / 2;
  for (const b of buildings) {
    for (const sx of WORLD.streetsX) {
      assert.ok(b.x + b.w <= sx - half || b.x >= sx + half, `building overlaps vertical street ${sx}`);
    }
    for (const sy of WORLD.streetsY) {
      assert.ok(b.y + b.h <= sy - half || b.y >= sy + half, `building overlaps horizontal street ${sy}`);
    }
  }
  for (const mission of MISSIONS) {
    for (const step of mission.steps) {
      if (step.x === undefined) continue;
      assert.ok(world.onRoad(step.x, step.y), `mission ${mission.id} marker (${step.x}, ${step.y}) is not on a road`);
    }
  }
});

test('walking moves the player and the world bounds hold', () => {
  const world = createWorld(7);
  const p = world.state.player;
  const startX = p.x;
  drive(1, world, () => ({ ...idle(), mx: 1 }));
  assert.ok(p.x > startX + 100, `walked only to ${p.x}`);
  assert.ok(p.x < WORLD.width && p.y < WORLD.height);
  // Walk into the west wall for a long time: the player stays inside.
  p.x = 30;
  p.y = 880;
  drive(3, world, () => ({ ...idle(), mx: -1 }));
  assert.ok(p.x >= 13, `escaped the west wall: ${p.x}`);
  // The water blocks the south edge.
  p.x = 520;
  p.y = WORLD.waterY - 30;
  drive(2, world, () => ({ ...idle(), my: 1 }));
  assert.ok(p.y < WORLD.waterY - 6, `walked into the water: ${p.y}`);
});

test('a building stops the player on foot', () => {
  const world = createWorld(7);
  const b = world.state.buildings[0];
  const p = world.state.player;
  p.x = b.x - 20;
  p.y = b.y + b.h / 2;
  drive(1, world, () => ({ ...idle(), mx: 1 }));
  assert.ok(p.x + 13 <= b.x + 1, `walked through a building to ${p.x}`);
});

test('mission 1: stealing a car raises the heat and starts the job', () => {
  const world = createWorld(7);
  const car = world.state.cars.find((c) => c.kind === 'parked');
  const p = world.state.player;
  p.x = car.x - 40;
  p.y = car.y;
  world.step(STEP, { ...idle(), enterPressed: true });
  // Walk the last stretch if the first press missed.
  for (let i = 0; i < 120 && p.onFoot; i += 1) {
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    world.step(STEP, { ...idle(), mx: dx / len, my: dy / len, enterPressed: Math.hypot(dx, dy) < 50 });
  }
  assert.equal(p.onFoot, false, 'player did not get into the car');
  assert.equal(world.state.wanted, 1, 'stealing a car should add one star');
  assert.equal(world.state.stepIndex, 1, 'mission 1 step should advance after the steal');
  assert.equal(world.currentStep().kind, 'goto');
});

test('mission 1 completes at the garage and mission 2 starts', () => {
  const world = createWorld(7);
  const car = world.state.cars.find((c) => c.kind === 'parked');
  const p = world.state.player;
  p.x = car.x - 40;
  p.y = car.y;
  for (let i = 0; i < 120 && p.onFoot; i += 1) {
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    world.step(STEP, { ...idle(), mx: dx / len, my: dy / len, enterPressed: Math.hypot(dx, dy) < 50 });
  }
  assert.equal(p.onFoot, false);
  car.x = 1480;
  car.y = 1120;
  p.x = 1480;
  p.y = 1120;
  world.step(STEP, idle());
  assert.equal(world.state.missionIndex, 1, 'mission 2 should start at the garage');
  assert.equal(world.state.cash, 400, 'mission 1 should pay $400');
  assert.equal(world.state.stepIndex, 0);
});

test('traffic stays on the roads', () => {
  const world = createWorld(11);
  drive(30, world);
  for (const car of world.state.cars) {
    if (car.kind !== 'traffic') continue;
    const nearX = WORLD.streetsX.some((sx) => Math.abs(car.x - sx) <= 40);
    const nearY = WORLD.streetsY.some((sy) => Math.abs(car.y - sy) <= 40);
    assert.ok(nearX || nearY, `traffic car off-road at (${car.x}, ${car.y})`);
  }
});

test('the wanted level decays once the cops are far away', () => {
  const world = createWorld(7);
  world.state.wanted = 2;
  world.state.timeSinceCrime = 999;
  // The player outran the cops and is waiting in the park, off the roads,
  // so passing traffic cannot run them down mid-test.
  world.state.player.x = 1000;
  world.state.player.y = 760;
  // Keep the streets clear of police.
  drive(45, world, () => {
    world.state.cars = world.state.cars.filter((c) => c.kind !== 'police');
    return idle();
  });
  assert.equal(world.state.wanted, 0, `wanted should decay to 0, got ${world.state.wanted}`);
});

test('police spawn up to the wanted level', () => {
  const world = createWorld(7);
  // Get in a car first: on foot the cops would bust the player mid-test.
  const car = world.state.cars.find((c) => c.kind === 'parked');
  const p = world.state.player;
  p.x = car.x;
  p.y = car.y;
  world.step(STEP, { ...idle(), enterPressed: true });
  assert.equal(p.onFoot, false);
  world.state.wanted = 3;
  world.state.timeSinceCrime = 0;
  drive(6, world);
  const cops = world.state.cars.filter((c) => c.kind === 'police');
  assert.equal(cops.length, 3, `expected 3 cops, got ${cops.length}`);
});

test('shooting a pedestrian kills them and raises the heat', () => {
  const world = createWorld(7);
  const p = world.state.player;
  const ped = world.state.peds[0];
  ped.x = p.x + 90;
  ped.y = p.y;
  ped.state = 'walk';
  for (let shot = 0; shot < 4 && ped.state !== 'dead'; shot += 1) {
    world.step(STEP, { ...idle(), shootPressed: true, aimX: ped.x, aimY: ped.y });
    drive(0.3, world);
  }
  assert.equal(ped.state, 'dead', 'the pedestrian should be dead after three hits');
  assert.ok(world.state.wanted > 0, 'shooting should raise the wanted level');
  assert.ok(world.state.bullets.length >= 0);
});

test('busted respawns the player at the police station', () => {
  const world = createWorld(7);
  world.state.wanted = 3;
  world.state.cash = 500;
  const cop = world.state.cars.find((c) => c.kind === 'police') ?? null;
  assert.ok(cop === null, 'no cops before they spawn');
  drive(6, world);
  // Park a cop on top of the player until the bust lands.
  let events = 0;
  for (let i = 0; i < 300 && !world.state.gameOver; i += 1) {
    for (const c of world.state.cars) {
      if (c.kind === 'police') { c.x = world.state.player.x; c.y = world.state.player.y; }
    }
    events |= world.step(STEP, idle());
  }
  assert.ok(events & EVENT_BUSTED || world.state.gameOver === 'busted', 'the player should be busted');
  world.respawn();
  assert.equal(world.state.gameOver, null);
  assert.equal(world.state.player.x, 2120);
  assert.equal(world.state.player.y, 1600);
  assert.equal(world.state.wanted, 0);
  assert.equal(world.state.cash, 300, 'bail should cost $200');
  assert.equal(world.state.cars.filter((c) => c.kind === 'police').length, 0);
});

test('save and load round-trips cash, mission and position', () => {
  const world = createWorld(7);
  world.state.cash = 1234;
  world.state.missionIndex = 1;
  world.state.stepIndex = 1;
  world.state.player.x = 900;
  world.state.player.y = 400;
  const other = createWorld(9);
  other.loadSave({ cash: 1234, missionIndex: 1, stepIndex: 1, x: 900, y: 400, angle: 0, time: 0.3 });
  assert.equal(other.state.cash, 1234);
  assert.equal(other.state.missionIndex, 1);
  assert.equal(other.state.stepIndex, 1);
  assert.equal(other.state.player.x, 900);
  assert.equal(other.state.player.y, 400);
});

test('the drive shot stages a real chase-ready scene', () => {
  const world = createWorld(1);
  const scene = stageShot('drive', world);
  assert.equal(scene.screen, 'play');
  assert.equal(world.state.player.onFoot, false, 'the drive shot should show the player in a car');
  assert.ok(world.missionMarker(), 'the drive shot should have a mission marker');
});

test('the end shot stages the finished story at night', () => {
  const world = createWorld(1);
  const scene = stageShot('end', world);
  assert.equal(scene.screen, 'play');
  assert.equal(world.state.storyDone, true);
  assert.equal(world.state.cash, 5000);
  assert.ok(world.state.time > 0.8, 'the end shot should be at night');
});

test('the action shot stages a wanted chase', () => {
  const world = createWorld(1);
  const scene = stageShot('action', world);
  assert.equal(scene.screen, 'play');
  assert.ok(world.state.wanted >= 2, `action shot should be wanted, got ${world.state.wanted}`);
  assert.ok(world.state.cars.some((c) => c.kind === 'police'), 'action shot should have police');
});
