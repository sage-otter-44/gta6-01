// Drawing only: the world's state and the current screen in, pixels out. The camera shows a
// 1280x720 window of the 2560x1920 city and follows the player (snapped for screenshots).
// Canvas text for the HUD and the panels; nothing here allocates per frame except tiny strings.
import { AVENUES, CITY, FONT, MISSIONS, PALETTE, ROAD_HALF, STREETS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const VIEW_W = 1280;
const VIEW_H = 720;
const PANEL = { width: 660, line: 32 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, camX: CITY.width / 2, camY: CITY.height / 2 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }
  function nightFactor(dayTime) {
    if (dayTime < 0.2 || dayTime >= 0.8) return 1;
    if (dayTime < 0.3) return (0.3 - dayTime) / 0.1;
    if (dayTime > 0.7) return (dayTime - 0.7) / 0.1;
    return 0;
  }

  function drawCity(state) {
    // Water along the south and east edges, then the ground.
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(0, 0, CITY.width, CITY.height);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, state.waterSouth, CITY.width, CITY.height - state.waterSouth);
    context.fillRect(state.waterEast, 0, CITY.width - state.waterEast, CITY.height);
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, 0, state.waterEast, state.waterSouth);
    // Parks.
    for (const park of state.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        context.fillStyle = PALETTE.parkDark;
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Parking lots.
    for (const lot of state.lots) {
      context.fillStyle = PALETTE.road;
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
      context.strokeStyle = PALETTE.roadLine;
      context.lineWidth = 2;
      for (let x = lot.x + 20; x < lot.x + lot.w; x += 40) {
        context.beginPath();
        context.moveTo(x, lot.y + 8);
        context.lineTo(x, lot.y + lot.h - 8);
        context.stroke();
      }
    }
    // Sidewalks, then roads, then lane dashes.
    for (const av of AVENUES) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(av - ROAD_HALF - 16, 0, 16, state.waterSouth);
      context.fillRect(av + ROAD_HALF, 0, 16, state.waterSouth);
      context.fillStyle = PALETTE.road;
      context.fillRect(av - ROAD_HALF, 0, ROAD_HALF * 2, state.waterSouth);
    }
    for (const st of STREETS) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, st - ROAD_HALF - 16, state.waterEast, 16);
      context.fillRect(0, st + ROAD_HALF, state.waterEast, 16);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, st - ROAD_HALF, state.waterEast, ROAD_HALF * 2);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const av of AVENUES) {
      for (let y = 20; y < state.waterSouth; y += 56) context.fillRect(av - 2, y, 4, 28);
    }
    for (const st of STREETS) {
      for (let x = 20; x < state.waterEast; x += 56) context.fillRect(x, st - 2, 28, 4);
    }
    // Buildings: body, roof inset, a few lit windows.
    for (const b of state.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      context.fillStyle = 'rgba(255, 214, 130, 0.5)';
      const cols = Math.floor(b.w / 34);
      const rows = Math.floor(b.h / 34);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 13 + b.x) % 5 === 0) context.fillRect(b.x + 12 + i * 34, b.y + 12 + j * 34, 8, 8);
        }
      }
    }
    // Old Pier: wooden deck over the east water.
    const pier = state.pier;
    context.fillStyle = PALETTE.pier;
    context.fillRect(pier.x, pier.y, pier.w, pier.h);
    context.strokeStyle = 'rgba(0,0,0,0.35)';
    context.lineWidth = 2;
    for (let y = pier.y + 10; y < pier.y + pier.h; y += 16) {
      context.beginPath();
      context.moveTo(pier.x, y);
      context.lineTo(pier.x + pier.w, y);
      context.stroke();
    }
  }

  function drawCarShape(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfL = 24;
    const halfW = 13;
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-halfL, -halfW, halfL * 2, halfW * 2, 7);
    context.fill();
    context.fillStyle = 'rgba(20, 30, 44, 0.9)';
    context.fillRect(-6, -halfW + 4, 16, halfW * 2 - 8);
    context.fillStyle = '#fff8c9';
    context.fillRect(halfL - 4, -halfW + 3, 3, 5);
    context.fillRect(halfL - 4, halfW - 8, 3, 5);
    if (car.kind === 'police') {
      context.fillStyle = PALETTE.policeDark;
      context.fillRect(-10, -halfW, 20, halfW * 2);
      const flash = Math.floor(time * 3) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#0a84ff';
      context.fillRect(-4, -halfW - 2, 8, 5);
      context.fillStyle = flash ? '#0a84ff' : '#ff3b30';
      context.fillRect(-4, halfW - 3, 8, 5);
    }
    if (car.kind === 'vanta') {
      context.strokeStyle = '#fff2b0';
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(-halfL + 2, -halfW + 2, halfL * 2 - 4, halfW * 2 - 4, 6);
      context.stroke();
    }
    context.restore();
  }

  function drawEntities(state) {
    // Cash pickups.
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      context.fillStyle = PALETTE.cash;
      context.beginPath();
      context.arc(pickup.x, pickup.y, 11, 0, Math.PI * 2);
      context.fill();
      text('$', pickup.x, pickup.y + 5, 15, '#0d2b12', 'center');
    }
    // Mission marker: a pulsing diamond and a beam of light.
    const target = state.missionTarget;
    if (target && !state.storyDone) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.15;
      context.fillStyle = 'rgba(255, 209, 102, 0.25)';
      context.fillRect(target.x - 3, target.y - 90, 6, 90);
      context.fillStyle = PALETTE.star;
      context.save();
      context.translate(target.x, target.y);
      context.rotate(Math.PI / 4);
      context.scale(pulse, pulse);
      context.fillRect(-11, -11, 22, 22);
      context.restore();
    }
    for (const car of state.cars) drawCarShape(car, state.time);
    for (const ped of state.peds) {
      if (ped.down > 0) {
        context.fillStyle = '#6b7280';
        context.beginPath();
        context.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = PALETTE.ped;
      context.beginPath();
      context.arc(ped.x, ped.y, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8eef4';
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const guard of state.guards) {
      if (!guard.alive) continue;
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, 11, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#2b0d0d';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.angle) * 18, guard.y + Math.sin(guard.angle) * 18);
      context.stroke();
    }
    for (const cop of state.cops) {
      context.fillStyle = '#22344d';
      context.beginPath();
      context.arc(cop.x, cop.y, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd166';
      context.fillRect(cop.x - 8, cop.y - 14, 16, 4);
    }
    const p = state.player;
    if (p.carId < 0) {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(p.x, p.y, 12, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#7a5b00';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
      context.stroke();
    }
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x, b.y);
      context.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.stroke();
    }
    for (const part of state.particles) {
      if (!part.active) continue;
      context.globalAlpha = Math.max(0, part.life / part.maxLife);
      context.fillStyle = part.color;
      context.beginPath();
      context.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawNight(state) {
    const night = nightFactor(state.dayTime);
    if (night <= 0) return;
    context.fillStyle = `rgba(8, 12, 30, ${0.42 * night})`;
    context.fillRect(view.camX - VIEW_W / 2 - 40, view.camY - VIEW_H / 2 - 40, VIEW_W + 80, VIEW_H + 80);
    if (night > 0.3) {
      context.fillStyle = `rgba(255, 214, 130, ${0.5 * night})`;
      for (const av of AVENUES) {
        for (const st of STREETS) {
          context.beginPath();
          context.arc(av, st, 7, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }

  function drawHud(state, muted) {
    const p = state.player;
    const car = p.carId >= 0 ? state.cars.find((c) => c.id === p.carId) : null;
    // All HUD positions are relative to the camera's visible window.
    const left = view.camX - VIEW_W / 2;
    const top = view.camY - VIEW_H / 2;
    const right = view.camX + VIEW_W / 2;
    const bottom = view.camY + VIEW_H / 2;
    // Top-left: cash, wanted stars, health.
    text(`$${state.cash.toLocaleString('en-US')}`, left + 24, top + 40, 30, PALETTE.cash, 'left');
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted.stars ? '★' : '☆';
    text(stars, left + 24, top + 76, 26, PALETTE.star, 'left');
    context.fillStyle = '#1b212b';
    context.fillRect(left + 24, top + 92, 180, 14);
    context.fillStyle = p.hp > 30 ? PALETTE.health : PALETTE.danger;
    context.fillRect(left + 24, top + 92, 180 * Math.max(0, p.hp / 100), 14);
    text(`HP ${Math.ceil(p.hp)}`, left + 212, top + 106, 16, PALETTE.text, 'left');
    if (car) text(`${Math.round(Math.abs(car.speed) * 0.36 * 10) / 10} km/h`, left + 24, top + 132, 18, PALETTE.muted, 'left');
    // Top-centre: current objective and distance.
    const def = MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
    const target = state.missionTarget;
    if (!state.storyDone && def && target) {
      const d = Math.round(Math.hypot(p.x - target.x, p.y - target.y));
      text(`${state.missionIndex + 1}. ${def.name} — ${def.blurb}`, view.camX, top + 34, 19, PALETTE.text, 'center');
      text(`${d}m`, view.camX, top + 58, 16, PALETTE.star, 'center');
    } else if (state.storyDone) {
      text('Debt paid. Cinder Bay is yours, Rook.', view.camX, top + 34, 19, PALETTE.cash, 'center');
    }
    // Edge arrow toward an off-screen target.
    if (target && !state.storyDone) {
      if (target.x < left + 40 || target.x > right - 40 || target.y < top + 40 || target.y > bottom - 40) {
        const ang = Math.atan2(target.y - view.camY, target.x - view.camX);
        const ax = view.camX + Math.cos(ang) * 300;
        const ay = view.camY + Math.sin(ang) * 220;
        context.fillStyle = PALETTE.star;
        context.save();
        context.translate(ax, ay);
        context.rotate(ang);
        context.beginPath();
        context.moveTo(16, 0);
        context.lineTo(-10, -11);
        context.lineTo(-10, 11);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
    // Bottom-left: controls, and mute state.
    text('WASD move / drive · E enter car · Click shoot · F melee · P pause · M sound ' + (muted ? '(muted)' : ''), left + 24, bottom - 24, 15, PALETTE.muted, 'left');
    drawMinimap(state);
  }

  function drawMinimap(state) {
    const w = 220;
    const h = 165;
    const x = view.camX + VIEW_W / 2 - w - 16;
    const y = view.camY + VIEW_H / 2 - h - 16;
    const s = w / CITY.width;
    context.fillStyle = 'rgba(13, 16, 23, 0.85)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = 'rgba(238, 241, 245, 0.35)';
    context.lineWidth = 1;
    context.strokeRect(x, y, w, h);
    context.fillStyle = PALETTE.minimapWater;
    context.fillRect(x, y + state.waterSouth * s, w, h - state.waterSouth * s);
    context.fillRect(x + state.waterEast * s, y, w - state.waterEast * s, h);
    context.strokeStyle = PALETTE.minimapRoad;
    context.lineWidth = 2;
    for (const av of AVENUES) {
      context.beginPath();
      context.moveTo(x + av * s, y);
      context.lineTo(x + av * s, y + state.waterSouth * s);
      context.stroke();
    }
    for (const st of STREETS) {
      context.beginPath();
      context.moveTo(x, y + st * s);
      context.lineTo(x + state.waterEast * s, y + st * s);
      context.stroke();
    }
    const target = state.missionTarget;
    if (target && !state.storyDone) {
      context.fillStyle = PALETTE.star;
      context.beginPath();
      context.arc(x + target.x * s, y + target.y * s, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      context.fillStyle = '#ff6b5e';
      context.fillRect(x + car.x * s - 2, y + car.y * s - 2, 4, 4);
    }
    const p = state.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x + p.x * s, y + p.y * s, 4, 0, Math.PI * 2);
    context.fill();
  }

  function drawPanel(title, lines, prompt) {
    const height = 120 + lines.length * PANEL.line + 70;
    const x = view.camX - PANEL.width / 2;
    const y = view.camY - height / 2;
    context.fillStyle = 'rgba(13, 16, 23, 0.72)';
    context.fillRect(view.camX - VIEW_W / 2 - 40, view.camY - VIEW_H / 2 - 40, VIEW_W + 80, VIEW_H + 80);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = 'rgba(238, 241, 245, 0.25)';
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, view.camX, y + 74, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], view.camX, y + 122 + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, view.camX, y + height - 36, 22, PALETTE.star, 'center');
  }

  function applyView() {
    const p = currentPlayer;
    if (p) {
      view.camX = clampCam(view.camX, p.x);
      view.camY = clampCam(view.camY, p.y);
    }
    // Keep the whole view inside the city: near an edge the camera stops at the border
    // instead of showing the dark void outside the map (the north-west corner used to be
    // half empty frame). The visible size depends on the window, so it is computed here.
    const visW = canvas.width / view.scale;
    const visH = canvas.height / view.scale;
    view.camX = visW >= CITY.width ? CITY.width / 2 : Math.min(Math.max(view.camX, visW / 2), CITY.width - visW / 2);
    view.camY = visH >= CITY.height ? CITY.height / 2 : Math.min(Math.max(view.camY, visH / 2), CITY.height - visH / 2);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - view.camX * view.scale + (VIEW_W * view.scale) / 2, view.y - view.camY * view.scale + (VIEW_H * view.scale) / 2);
  }
  function clampCam(current, target) {
    // Smooth follow; the caller snaps the camera for screenshots.
    return current + (target - current) * 0.12;
  }

  let currentPlayer = null;

  /** Paint one frame. `extras` carries title-screen facts (hasSave, muted). */
  function draw(state, screen, extras) {
    currentPlayer = state.player;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    applyView();
    drawCity(state);
    drawEntities(state);
    drawNight(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('CINDER BAY', [
        'Rook Venn owes Eddie Voss $5,000. Four jobs from Marla Quinn will clear it —',
        'if the cops, the guards and the whole city let him.',
        '',
        'WASD move / drive · E steal & enter cars · Click shoot · F melee · P pause',
        extras.hasSave ? 'Save found: press Enter to Continue, or Space for a new game.' : 'Press Enter or click to start.',
      ], extras.hasSave ? 'Enter: Continue · Space: New game' : 'Press Enter or click to start');
      return;
    }
    drawHud(state, extras.muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits. Your wanted level does not grow while paused.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [`The cops caught Rook with $${state.cash.toLocaleString('en-US')} in his pocket.`, 'Eddie Voss is not going to wait forever.'], 'Press Space to try again');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [`Rook went down with $${state.cash.toLocaleString('en-US')} in his pocket.`, 'Cinder Bay keeps the money.'], 'Press Space to try again');
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel('DEBT PAID', ['All four jobs done. $5,000 to Eddie Voss, and Rook walks free.', `Final cash: $${state.cash.toLocaleString('en-US')}. Cinder Bay is yours.`], 'Press Space to play again');
    }
  }

  /** Jump the camera to a world point at once (screenshots, respawns), staying inside the city. */
  function snapTo(x, y) {
    const visW = canvas.width / view.scale;
    const visH = canvas.height / view.scale;
    view.camX = visW >= CITY.width ? CITY.width / 2 : Math.min(Math.max(x, visW / 2), CITY.width - visW / 2);
    view.camY = visH >= CITY.height ? CITY.height / 2 : Math.min(Math.max(y, visH / 2), CITY.height - visH / 2);
  }
  /** Convert screen (client) pixels to world coordinates for aiming. */
  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const px = (sx - rect.left) * (canvas.width / rect.width);
    const py = (sy - rect.top) * (canvas.height / rect.height);
    const wx = (px - view.x) / view.scale + view.camX - VIEW_W / 2;
    const wy = (py - view.y) / view.scale + view.camY - VIEW_H / 2;
    return { x: wx, y: wy };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, snapTo, screenToWorld, view };
}
