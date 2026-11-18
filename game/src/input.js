// Keyboard and mouse input for Solmar Bay. Held keys steer and drive; one-shot
// presses (confirm, pause, enter/exit car) are queued as flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;

const MOVE = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  const mouse = { x: 0, y: 0, down: false };
  let actions = 0;
  let muted = false;

  function onKeyDown(event) {
    const move = MOVE[event.code];
    if (move) {
      held[move] = true;
      event.preventDefault();
      return;
    }
    if (RUN.has(event.code)) { held.run = true; return; }
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER_CAR.has(event.code)) actions |= ACTION_ENTER_CAR;
    else if (MUTE.has(event.code)) muted = !muted;
    else return;
    event.preventDefault();
  }

  function onKeyUp(event) {
    const move = MOVE[event.code];
    if (move) held[move] = false;
    if (RUN.has(event.code)) held.run = false;
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** Movement vector, each component in [-1, 1]. */
    move() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
        run: held.run,
      };
    },
    mouse() {
      return { x: mouse.x, y: mouse.y, down: mouse.down };
    },
    isMuted() {
      return muted;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
