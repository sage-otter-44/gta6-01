// Keyboard and pointer input. Held keys give movement and driving; one-shot presses (enter
// a car, shoot, melee, confirm, pause, mute) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse position
// is kept in screen pixels; the loop converts it to world coordinates with the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MELEE = 8;
export const ACTION_MUTE = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MELEE = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let lastConfirmKey = null;

  function press(event) {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) {
        actions |= ACTION_CONFIRM;
        lastConfirmKey = event.code;
      }
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (MELEE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MELEE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  }
  function release(event) {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  }
  window.addEventListener('keydown', press);
  window.addEventListener('keyup', release);
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    mouseDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (event.button === 0) mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    /** Movement vector, each component -1, 0 or 1. */
    move() {
      return { x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0) };
    },
    /** Steering while driving: -1 left, 1 right. */
    steer() {
      return (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    },
    accel() { return keys.up; },
    brake() { return keys.down; },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** 'Enter' or 'Space' for the most recent confirm press (title: Enter continues, Space restarts). */
    takeConfirmKey() {
      const key = lastConfirmKey;
      lastConfirmKey = null;
      return key;
    },
  };
}
