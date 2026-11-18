// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, busted, wasted and complete. Progress (cash and the mission
// reached) is saved to localStorage so a run can continue after a visit.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|action|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_CRIME, EVENT_ENTER, EVENT_HIT, EVENT_MISSION, EVENT_OVER, EVENT_PICKUP, EVENT_SHOT } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!Number.isInteger(save.mission) || typeof save.cash !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ mission: Math.max(0, world.state.mission), cash: world.state.cash }));
    const best = readBest();
    if (world.state.cash > best) window.localStorage.setItem(BEST_KEY, String(world.state.cash));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const best = readBest();
  const scene = stageShot(name, world, best);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(window);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    const save = readSave();
    if (save && save.mission > 0) world.loadProgress(save.mission, save.cash);
    else world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Mara Voss is on the streets of Solmar Bay.');
  }

  function endGame(kind) {
    saveGame();
    if (kind === 'complete') {
      // A finished story starts fresh next time; the best haul stays.
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage can be off */ }
    }
    best = readBest();
    screen = kind === 'busted' ? SCREEN_BUSTED : kind === 'wasted' ? SCREEN_WASTED : SCREEN_COMPLETE;
    audio.stopEngine();
    audio.siren(false);
    if (kind === 'complete') {
      audio.mission();
      announce(`All jobs done. $${world.state.cash} banked.`);
    } else {
      audio.busted();
      announce(kind === 'busted' ? 'Busted. The Solmar PD got you.' : 'Wasted. Mara did not make it out.');
    }
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_ENTER) audio.enter();
    if (events & EVENT_MISSION) { audio.mission(); saveGame(); }
    if (events & EVENT_CRIME) announce(`Wanted level ${world.state.wanted}.`);
    if (events & EVENT_OVER) endGame(world.state.over);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopEngine();
      audio.siren(false);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function step(actions) {
    const move = input.move();
    const events = world.step(STEP, move, actions & ACTION_ENTER ? 1 : 0);
    handleEvents(events);
    const car = world.state.player.inCar;
    if (screen === SCREEN_PLAY && car) audio.engine(car.speed, 520);
    else audio.stopEngine();
    audio.siren(screen === SCREEN_PLAY && world.state.wanted > 0 && world.state.police.length > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Actions are taken once per frame and handed to the first sub-step only,
    // so a press between frames is never lost and never counted twice.
    const actions = handleActions();
    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.muted);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopEngine();
      audio.siren(false);
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
