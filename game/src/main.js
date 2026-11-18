// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between six screens: title, play, paused, busted, wasted and story complete.
//
// ?seed=N fixes the city's random pattern. ?shot=start|drive|action|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CASH, EVENT_COMPLETE, EVENT_HIT, EVENT_MISSION, EVENT_SHOT,
  EVENT_WASTED, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MELEE, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WASTED, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
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
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.snapTo(scene.snap.x, scene.snap.y);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { hasSave: false, muted: audio.isMuted() });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let hasSave = readSave() !== null;
  let accumulator = 0;
  let last = performance.now();
  // True from the moment a click starts or resumes the game until that mouse button is let
  // go: the starting click must not fire a shot (and raise the wanted level) on its own.
  let suppressShootUntilRelease = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
    } else {
      const save = readSave();
      if (save) world.loadSave(save);
      else world.reset();
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    suppressShootUntilRelease = true;
    announce('Playing. Rook owes Eddie Voss $5,000.');
  }

  function endGame(next) {
    screen = next;
    writeSave();
    if (next === SCREEN_BUSTED) {
      audio.busted();
      announce('Busted. The cops caught Rook.');
    } else if (next === SCREEN_WASTED) {
      announce('Wasted. Rook went down.');
    } else if (next === SCREEN_COMPLETE) {
      audio.jingle();
      announce('Debt paid. Cinder Bay is yours.');
    }
  }

  function buildWorldInput() {
    const move = input.move();
    const mouse = input.mouse();
    const aim = renderer.screenToWorld(mouse.x, mouse.y);
    const car = world.state.player.carId >= 0;
    return {
      mx: move.x,
      my: move.y,
      accel: input.accel(),
      brake: input.brake(),
      steer: input.steer(),
      aimX: aim.x,
      aimY: aim.y,
      // Shooting is decided in step(), after screen transitions: the click that starts the
      // game (or resumes it) must not also fire the weapon on the very same frame.
      shoot: false,
      enter: false,
      melee: false,
    };
  }

  function handleActions(worldInput) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_ENTER) worldInput.enter = true;
    if (actions & ACTION_MELEE) worldInput.melee = true;
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) {
        const key = input.takeConfirmKey();
        startGame(key === 'Space' || !hasSave);
      } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_COMPLETE) {
        startGame(true);
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        suppressShootUntilRelease = true;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    const worldInput = buildWorldInput();
    handleActions(worldInput);
    if (screen === SCREEN_TITLE) {
      // The title screen's world sims behind the panel; the confirm press above starts the game.
      world.step(STEP, {}, true);
      return;
    }
    const mouse = input.mouse();
    if (suppressShootUntilRelease && !mouse.down) suppressShootUntilRelease = false;
    worldInput.shoot = mouse.down && world.state.player.carId < 0 && !suppressShootUntilRelease;
    const events = world.step(STEP, worldInput, false);
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_HIT) audio.thud();
    if (events & EVENT_CASH) audio.coin();
    if (events & EVENT_MISSION) {
      audio.jingle();
      writeSave();
    }
    if (events & EVENT_BUSTED) endGame(SCREEN_BUSTED);
    else if (events & EVENT_WASTED) endGame(SCREEN_WASTED);
    else if (events & EVENT_COMPLETE) endGame(SCREEN_COMPLETE);
    const car = world.state.player.carId >= 0
      ? world.state.cars.find((c) => c.id === world.state.player.carId)
      : null;
    audio.update(STEP, car ? Math.abs(car.speed) / 540 : 0, world.state.wanted.stars);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      // Paused or over: keep the world still, but still paint it (and the panel).
      accumulator = 0;
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_COMPLETE) startGame(true);
        else if (screen === SCREEN_PAUSED) {
          screen = SCREEN_PLAY;
          suppressShootUntilRelease = true;
          announce('Playing.');
        }
      } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    renderer.draw(world.state, screen, { hasSave, muted: audio.isMuted() });
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Cinder Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
