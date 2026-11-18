// Keyboard input: a movement vector each frame, a held shoot flag, and
// edge-triggered actions (E to enter a car or interact) taken once per frame.

export const ACTION_ENTER = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_MUTE = 8;

const KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyF: 'shoot',
  KeyE: 'enter',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
  Space: 'confirm',
  KeyM: 'mute',
};

export function createInput(target) {
  const held = new Set();
  let queued = 0;

  function onKeyDown(event) {
    const action = KEYS[event.code];
    if (!action) return;
    if (action === 'enter' && !event.repeat) queued |= ACTION_ENTER;
    if (action === 'pause' && !event.repeat) queued |= ACTION_PAUSE;
    if (action === 'confirm' && !event.repeat) queued |= ACTION_CONFIRM;
    if (action === 'mute' && !event.repeat) queued |= ACTION_MUTE;
    held.add(action);
    if (['up', 'down', 'left', 'right', 'shoot'].includes(action)) event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(KEYS[event.code]);
  }

  function onBlur() {
    held.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  /** Movement vector, x right, y down, each component -1, 0 or 1. */
  function move() {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    return { x, y, shoot: held.has('shoot') };
  }

  function takeActions() {
    const actions = queued;
    queued = 0;
    return actions;
  }

  return { move, takeActions };
}
