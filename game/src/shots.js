// The screenshot scenes behind ?shot=start|drive|action|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The camera snaps to the
// player before the shot is painted (never a slow follow that lags behind the action).
import { STEP } from './config.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 2.5;
const ACTION_SECONDS = 6;

/** Drive the player's car south down 5th Avenue (x 1280), staying in its lane. */
function driveAutopilot(state) {
  const car = state.cars.find((c) => c.id === state.player.carId);
  if (!car) return { accel: false, brake: false, steer: 0 };
  const laneX = 1280 - 27; // southbound lane of the avenue
  const steer = Math.max(-1, Math.min(1, (laneX - car.x) / 40));
  let brake = false;
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    if (dy > 0 && dy < 110 && Math.abs(dx) < 40) brake = true;
  }
  return { accel: !brake, brake, steer };
}

function putPlayerInCar(state, x, y) {
  let best = null;
  let bestD = 1e9;
  for (const car of state.cars) {
    if (car.driver !== 'traffic') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return false;
  best.driver = 'player';
  best.speed = 0;
  state.player.carId = best.id;
  state.player.x = best.x;
  state.player.y = best.y;
  state.player.angle = best.angle;
  return true;
}

/**
 * Set `world` to the named scene and return the screen to draw over it. `snap` is the camera
 * target the caller should jump to before painting.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'drive') {
    putPlayerInCar(state, 1280, 1000);
    const car = state.cars.find((c) => c.id === state.player.carId);
    if (car) {
      // Start mid-avenue heading south; a short run keeps the car moving fast on the road
      // instead of piling into the marina water at the south edge (10 s of driving gets there).
      car.x = 1253;
      car.y = 400;
      car.angle = Math.PI / 2;
      car.speed = 200;
    }
    state.player.x = 1253;
    state.player.y = 400;
    state.wanted.stars = 2;
    state.wanted.lastCrime = 0;
    for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
      world.step(STEP, driveAutopilot(state), false);
    }
    return { screen: SCREEN_PLAY, snap: { x: state.player.x, y: state.player.y } };
  }
  if (name === 'action') {
    state.missionIndex = 2;
    state.missionStage = 0;
    state.missionTarget = { x: 300, y: 160 };
    state.player.x = 300;
    state.player.y = 110;
    state.wanted.stars = 3;
    state.wanted.lastCrime = 0;
    // Walk south to the warehouse door; the mission spawns its guards when we arrive.
    for (let i = 0; i < 3 / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 1, aimX: 300, aimY: 160 }, false);
      if (state.missionStage === 1) break;
    }
    // Trade shots with the guards for a few seconds.
    for (let i = 0; i < ACTION_SECONDS / STEP; i += 1) {
      const guard = state.guards.find((g) => g.alive);
      const aim = guard ? { x: guard.x, y: guard.y } : { x: 300, y: 200 };
      world.step(STEP, { mx: 0, my: 0, shoot: true, aimX: aim.x, aimY: aim.y }, false);
      if (state.wasted || state.busted) break;
    }
    return { screen: SCREEN_PLAY, snap: { x: state.player.x, y: state.player.y } };
  }
  if (name === 'end') {
    state.cash = 5000;
    state.missionIndex = 4;
    state.missionStage = 0;
    state.storyDone = true;
    state.missionTarget = null;
    state.player.x = 2470;
    state.player.y = 1560;
    state.player.angle = Math.PI / 2;
    for (let i = 0; i < 2 / STEP; i += 1) world.step(STEP, {}, true);
    return { screen: SCREEN_COMPLETE, snap: { x: 2470, y: 1560 } };
  }
  // start (and anything unknown): the title screen over a living city.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, {}, true);
  return { screen: SCREEN_TITLE, snap: { x: 1280, y: 960 } };
}
