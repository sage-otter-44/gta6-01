// The screenshot scenes behind ?shot=start|drive|action|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// an autopilot that drives the street grid toward the mission marker, so every
// frame is what a short game really looks like and the same seed always gives
// the same frame.
import { MISSIONS } from './config.js';
import { clamp } from './random.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const STEP = 1 / 60;
const START_SECONDS = 6;
const ACTION_SECONDS = 12;

function idleInput() {
  return { mx: 0, my: 0, run: false, enterPressed: false, shootPressed: false, shootHeld: false, aimX: 0, aimY: 0 };
}

/** The nearest parked car, however far: the scenes start by stealing it. Parked
 * cars never move, so the player always reaches the one they walk up to. */
function nearestCar(world) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.state.cars) {
    if (car.kind !== 'parked') continue;
    const d = Math.hypot(car.x - world.state.player.x, car.y - world.state.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/**
 * Put the player in the parked car best placed for `target`: the one whose
 * facing points most nearly at the target, weighted against its distance, so
 * the autopilot starts driving forward instead of turning around.
 */
function getInCar(world, target) {
  let best = null;
  let bestScore = Infinity;
  for (const car of world.state.cars) {
    if (car.kind !== 'parked') continue;
    const dir = Math.atan2(target.y - car.y, target.x - car.x);
    let delta = dir - car.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const score = Math.abs(delta) * 300 + Math.hypot(target.x - car.x, target.y - car.y);
    if (score < bestScore) { bestScore = score; best = car; }
  }
  const car = best ?? nearestCar(world);
  world.state.player.x = car.x;
  world.state.player.y = car.y;
  world.step(STEP, { ...idleInput(), enterPressed: true });
  if (world.state.player.onFoot) {
    for (let i = 0; i < 120 && world.state.player.onFoot; i += 1) {
      const dx = car.x - world.state.player.x;
      const dy = car.y - world.state.player.y;
      const len = Math.hypot(dx, dy) || 1;
      world.step(STEP, { ...idleInput(), mx: dx / len, my: dy / len, enterPressed: Math.hypot(dx, dy) < 50 });
    }
  }
  return world.state.player.car;
}

/**
 * The next grid waypoint toward `target`: along the street the car is on,
 * toward the crossing street nearest the target, so the car turns at
 * intersections instead of cutting through buildings. A car off the grid (a
 * parking spot) first heads for the nearest street, ahead of where it faces,
 * so it never has to reverse out of its own parking spot.
 */
function nextWaypoint(world, target) {
  const car = world.state.player.car;
  const sy = world.nearestStreetY(car.y);
  const sx = world.nearestStreetX(car.x);
  const onH = Math.abs(car.y - sy) < 30;
  const onV = Math.abs(car.x - sx) < 30;
  if (onH && !onV) return { x: world.nearestStreetX(target.x), y: sy };
  if (onV && !onH) return { x: sx, y: world.nearestStreetY(target.y) };
  if (onH && onV) {
    if (Math.abs(target.x - car.x) > 80) return { x: target.x, y: sy };
    return { x: sx, y: target.y };
  }
  const facingX = Math.abs(Math.cos(car.angle)) > 0.7;
  if (facingX) return { x: car.x + 140 * Math.sign(Math.cos(car.angle)), y: sy };
  return { x: sx, y: car.y + 140 * Math.sign(Math.sin(car.angle)) };
}

function driveInput(world, target) {
  const car = world.state.player.car;
  const point = nextWaypoint(world, target);
  const want = Math.atan2(point.y - car.y, point.x - car.x);
  let delta = want - car.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const dist = Math.hypot(point.x - car.x, point.y - car.y);
  const input = idleInput();
  if (Math.abs(delta) > 2.4) {
    // The waypoint is behind: reverse out of it.
    input.my = 1;
    input.mx = clamp(-delta, -1, 1);
  } else {
    // Slow for the turn: brake hard while the turn is sharp and the car is
    // still fast (a 70 px/s turn fits inside an intersection), then drive
    // slowly through the turn — never coast at zero speed, or the car can
    // stop facing the wrong way and never move again.
    const sharp = Math.abs(delta) > 0.7;
    const near = dist < 140;
    const speed = Math.abs(car.speed);
    if (sharp) {
      if (speed > 70) input.my = 1;
      else input.my = -1;
    } else if (near && speed > 120) input.my = 1;
    else if (speed < 240) input.my = -1;
    else input.my = 0;
    input.mx = clamp(delta * 2, -1, 1);
  }
  input.aimX = car.x + Math.cos(car.angle) * 100;
  input.aimY = car.y + Math.sin(car.angle) * 100;
  return input;
}

function simulate(world, seconds, inputFor) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, inputFor ? inputFor(world) : idleInput());
    if (events & (EVENT_BUSTED | EVENT_WASTED)) break;
  }
}

function missionTextFor(world) {
  const mission = world.currentMission();
  const step = world.currentStep();
  if (!mission || !step) return { name: '', text: '' };
  return { name: mission.name, text: step.text };
}

/**
 * Set `world` to the named scene (start, drive, action or end; any other name
 * is start) and return what the renderer needs for it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'drive' && name !== 'action' && name !== 'end') {
    simulate(world, START_SECONDS, null);
    return { screen: SCREEN_TITLE, marker: null, missionName: '', missionText: '', hintSeconds: 0, saveExists: false };
  }
  if (name === 'drive') {
    // Mission 1: steal the nearest car and drive it to Mara's Garage. The
    // shot is taken just after the drop-off, while the car is still rolling
    // down the street past the garage and the next job ("The Drop") lands —
    // the car never has to make the sharp turn the next marker wants.
    const garage = { x: 1480, y: 1120 };
    getInCar(world, garage);
    simulate(world, 0.5, null);
    let t = 0;
    while (world.state.missionIndex === 0 && t < 12) {
      simulate(world, 0.25, () => driveInput(world, garage));
      t += 0.25;
    }
    simulate(world, 1.5, () => driveInput(world, world.missionMarker() ?? garage));
    const mission = missionTextFor(world);
    return {
      screen: SCREEN_PLAY,
      marker: world.missionMarker(),
      missionName: mission.name,
      missionText: mission.text,
      hintSeconds: 0,
      saveExists: false,
    };
  }
  if (name === 'action') {
    // Mission 3, mid-chase: wanted 2, cops closing in, racing for the safehouse.
    state.missionIndex = 2;
    state.stepIndex = 0;
    state.wanted = 2;
    state.timeSinceCrime = 0;
    const safehouse = { x: 840, y: 1600 };
    getInCar(world, safehouse);
    simulate(world, ACTION_SECONDS, () => driveInput(world, world.missionMarker() ?? safehouse));
    const mission = missionTextFor(world);
    return {
      screen: SCREEN_PLAY,
      marker: world.missionMarker(),
      missionName: mission.name,
      missionText: mission.text,
      hintSeconds: 0,
      saveExists: false,
    };
  }
  // 'end': the story is done, night has fallen, the hero sits on $5,000 at the hideout.
  state.cash = MISSIONS.reduce((sum, mission) => sum + mission.reward, 0);
  state.missionIndex = MISSIONS.length;
  state.storyDone = true;
  state.time = 0.85;
  state.message = '';
  state.messageTimer = 0;
  getInCar(world, { x: 1800, y: 1360 });
  // The hero stole the car to get here, but the night is quiet now.
  state.wanted = 0;
  state.timeSinceCrime = 999;
  state.cars = state.cars.filter((car) => car.kind !== 'police');
  state.player.car.x = 1800;
  state.player.car.y = 1360;
  state.player.car.angle = Math.PI / 2;
  state.player.x = 1800;
  state.player.y = 1360;
  simulate(world, 2, null);
  return {
    screen: SCREEN_PLAY,
    marker: null,
    missionName: '',
    missionText: 'Story complete — Solmar Bay is yours',
    hintSeconds: 0,
    saveExists: false,
  };
}
