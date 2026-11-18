// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, busted and wasted. Progress saves to localStorage as you play.
//
// ?seed=N fixes the city's random pattern. ?shot=start|drive|action|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { SAVE_KEY } from './config.js';
import { makeRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED,
  EVENT_ENTER_CAR,
  EVENT_HIT,
  EVENT_MISSION,
  EVENT_PICKUP,
  EVENT_SHOT,
  EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_BUSTED,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const STEP = 1 / 60;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const state = world.state;
    const p = state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      stepIndex: state.stepIndex,
      x: p.x, y: p.y, angle: p.angle,
      time: state.time,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene, world.state.player.angle);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let hintSeconds = 0;
  let saveTimer = 0;
  let accumulator = 0;
  let frameActions = 0;
  let saveExists = readSave() !== null;
  let last = performance.now();
  let aim = { x: world.state.player.x + 100, y: world.state.player.y };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function extras() {
    const mission = world.currentMission();
    const step = world.currentStep();
    return {
      marker: world.missionMarker(),
      missionName: mission ? mission.name : '',
      missionText: step ? step.text : '',
      hintSeconds,
      saveExists,
    };
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
      clearSave();
      saveExists = false;
    } else {
      const save = readSave();
      if (save) {
        world.reset();
        world.loadSave(save);
      } else {
        world.reset();
      }
    }
    hintSeconds = 12;
    saveTimer = 0;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce('Playing. Follow the yellow marker.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.missionDone();
      writeSave();
    }
    if (events & EVENT_HIT) audio.crash();
    if (events & EVENT_ENTER_CAR) audio.click();
    if (events & EVENT_BUSTED) {
      audio.busted();
      screen = SCREEN_BUSTED;
      announce('Busted. Press Enter to get back out there.');
    }
    if (events & EVENT_WASTED) {
      audio.busted();
      screen = SCREEN_WASTED;
      announce('Wasted. Press Enter to get back out there.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    frameActions = actions;
    audio.setMuted(input.isMuted());
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(true);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        audio.engine(0);
        audio.siren(false);
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        world.respawn();
        screen = SCREEN_PLAY;
        announce('Playing. Follow the yellow marker.');
      }
    }
  }

  // Continue a saved game with C, from the title screen only.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat && screen === SCREEN_TITLE && readSave()) {
      startGame(false);
    }
  });

  function stepWorld() {
    const move = input.move();
    const mouse = input.mouse();
    const point = renderer.worldPoint(world.state, mouse.x, mouse.y);
    aim = point;
    const state = world.state;
    const enterPressed = (frameActions & ACTION_ENTER_CAR) !== 0;
    frameActions &= ~ACTION_ENTER_CAR;
    const events = world.step(STEP, {
      mx: move.x,
      my: move.y,
      run: move.run,
      enterPressed,
      shootPressed: mouse.down && state.fireTimer <= 0,
      shootHeld: false,
      aimX: point.x,
      aimY: point.y,
    });
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dt;
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, { mx: 0, my: 0, run: false, enterPressed: false, shootPressed: false, shootHeld: false, aimX: 0, aimY: 0 }, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepWorld();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
      if (hintSeconds > 0) hintSeconds = Math.max(0, hintSeconds - dt);
      saveTimer += dt;
      if (saveTimer > 10) {
        saveTimer = 0;
        writeSave();
        saveExists = true;
      }
      const state = world.state;
      audio.engine(state.player.onFoot ? 0 : Math.abs(state.player.car.speed) / 430);
      audio.siren(state.wanted > 0);
    } else {
      accumulator = 0;
      audio.engine(0);
      audio.siren(false);
    }
    const aimAngle = Math.atan2(aim.y - world.state.player.y, aim.x - world.state.player.x);
    renderer.draw(world.state, screen, extras(), aimAngle);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.engine(0);
      audio.siren(false);
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter to start, or C to continue a saved game.');
  // A handle for automated play-testing (and nothing else): the world, the
  // screen and the save, so a headless browser can drive the real game.
  window.__solmar = { world, getScreen: () => screen, save: writeSave, load: readSave };
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
