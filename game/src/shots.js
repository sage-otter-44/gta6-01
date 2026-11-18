// The screenshot scenes behind ?shot=start|drive|action|end. Each one stages
// a real moment of the game with the world's own machinery, then plays it
// forward with a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { MISSIONS, STEP } from './config.js';
import { angleDiff, angleTo, clamp, dist, planRoute } from './world.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const DRIVE_MAX_SECONDS = 12;
const ACTION_MAX_SECONDS = 12;
const CHUNK = 0.25;

/**
 * Drive (or walk) toward the current objective along the road grid. Returns
 * the input for one step: x steers, y -1 is the accelerator, +1 the brake.
 */
function autopilot(world) {
  const state = world.state;
  const player = state.player;
  const stage = state.mission >= 0 ? MISSIONS[state.mission].stages[state.stage] : null;
  let tx = 300;
  let ty = 1400;
  if (stage && stage.x !== undefined) { tx = stage.x; ty = stage.y; }
  const self = player.inCar ?? player;
  const route = planRoute(self.x, self.y, tx, ty);
  // Follow the first waypoint that is not already under the wheels.
  let wp = route[route.length - 1];
  for (const point of route) {
    if (dist(self.x, self.y, point.x, point.y) > 60) { wp = point; break; }
  }
  const desired = angleTo(self.x, self.y, wp.x, wp.y);
  if (player.inCar) {
    const car = player.inCar;
    const diff = angleDiff(car.angle, desired);
    const steer = clamp(diff * 2.5, -1, 1);
    const throttle = Math.abs(diff) > 1.1 ? 0.4 : -1;
    return { x: steer, y: throttle, shoot: false };
  }
  const dx = wp.x - self.x;
  const dy = wp.y - self.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { x: dx / mag, y: dy / mag, shoot: false };
}

function simulate(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.over) break;
    world.step(STEP, autopilot(world), 0);
  }
}

/** Where Mara (in her car, or on foot) is right now. */
function selfPos(world) {
  const self = world.state.player.inCar ?? world.state.player;
  return { x: self.x, y: self.y };
}

/**
 * Set `world` to the named scene (start, drive, action or end; any other
 * name is start) and return the screen to draw over it and the best haul.
 * The driving scenes play forward in short chunks and stop while Mara is
 * still on her way, so the frame catches her mid-drive, not after she has
 * already arrived.
 */
export function stageShot(name, world, best) {
  const scene = world.stageScene(name);
  if (scene === 'title') return { screen: SCREEN_TITLE, best };
  if (scene === 'drive') {
    for (let s = 0; s < DRIVE_MAX_SECONDS / CHUNK; s += 1) {
      simulate(world, CHUNK);
      if (world.state.mission !== 0) break;
      const pos = selfPos(world);
      if (dist(pos.x, pos.y, 400, 200) < 400) break;
    }
    return { screen: SCREEN_PLAY, best };
  }
  if (scene === 'action') {
    for (let s = 0; s < ACTION_MAX_SECONDS / CHUNK; s += 1) {
      simulate(world, CHUNK);
      if (world.state.over) break;
      const pos = selfPos(world);
      if (dist(pos.x, pos.y, 300, 1400) < 240) break;
    }
    return { screen: SCREEN_PLAY, best };
  }
  return { screen: SCREEN_COMPLETE, best };
}
