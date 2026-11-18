// Drawing only: the world's state and the current screen in, pixels out. A
// camera follows Mara across the 2560x1920 city and paints a 1280x720 window
// of it, scaled to the browser window. Flat shapes and canvas text only.

import {
  AVENUES, FONT, MISSIONS, PALETTE, PLACES, PORT, ROAD_W, SAND_Y,
  STREETS, TOTAL_PAY, VIEW, WATER_Y, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const MINIMAP = { w: 220, h: 164, margin: 16 };

function skyTint(hour) {
  if (hour < 5 || hour >= 20) return PALETTE.night;
  if (hour < 7 || (hour >= 17 && hour < 20)) return PALETTE.dusk;
  return null;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    const key = `${size}`;
    if (!fonts.has(key)) fonts.set(key, `bold ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawCity(state, cam) {
    const x0 = cam.x;
    const y0 = cam.y;
    const x1 = cam.x + VIEW.width;
    const y1 = cam.y + VIEW.height;
    // Ground: grass everywhere, then districts on top.
    rect(x0, y0, VIEW.width, VIEW.height, PALETTE.grass);
    // Bay water and sand at the south edge.
    rect(x0, Math.max(y0, SAND_Y), VIEW.width, Math.max(0, y1 - Math.max(y0, SAND_Y)), PALETTE.sand);
    rect(x0, Math.max(y0, WATER_Y), VIEW.width, Math.max(0, y1 - Math.max(y0, WATER_Y)), PALETTE.water);
    // The park block.
    rect(AVENUES[1] + ROAD_W / 2, STREETS[1] + ROAD_W / 2,
      AVENUES[2] - AVENUES[1] - ROAD_W, STREETS[2] - STREETS[1] - ROAD_W, PALETTE.park);
    // Port apron.
    rect(PORT.x, PORT.y, PORT.w, PORT.h, '#3a3f47');
    // Sidewalks and asphalt.
    for (const ax of AVENUES) {
      rect(ax - ROAD_W / 2 - 10, y0, ROAD_W + 20, VIEW.height, PALETTE.sidewalk);
      rect(ax - ROAD_W / 2, y0, ROAD_W, VIEW.height, PALETTE.road);
    }
    for (const sy of STREETS) {
      rect(x0, sy - ROAD_W / 2 - 10, VIEW.width, ROAD_W + 20, PALETTE.sidewalk);
      rect(x0, sy - ROAD_W / 2, VIEW.width, ROAD_W, PALETTE.road);
    }
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const ax of AVENUES) {
      for (let y = Math.floor(y0 / 48) * 48; y < y1; y += 48) {
        if (y < SAND_Y) context.fillRect(ax - 2, y, 4, 24);
      }
    }
    for (const sy of STREETS) {
      for (let x = Math.floor(x0 / 48) * 48; x < x1; x += 48) {
        context.fillRect(x, sy - 2, 24, 4);
      }
    }
    // The pier reaching into the bay.
    rect(PLACES.pier.x - 36, 1680, 72, 200, '#6b4a2f');
    rect(PLACES.pier.x - 36, 1680, 72, 8, '#8a6a42');
    // Buildings: slab, roof edge, a few lit windows.
    for (const b of state.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      rect(b.x, b.y, b.w, b.h, b.color);
      rect(b.x, b.y, b.w, 8, PALETTE.roof);
      rect(b.x, b.y + b.h - 8, b.w, 8, PALETTE.roof);
      const lit = (b.x * 7 + b.y * 13) % 3 === 0;
      if (lit) {
        rect(b.x + 10, b.y + 18, 12, 10, PALETTE.windowLit);
        rect(b.x + b.w - 26, b.y + b.h - 32, 12, 10, PALETTE.windowLit);
      }
    }
    for (const t of state.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      circle(t.x, t.y, t.r, '#1e4d26');
      circle(t.x - 4, t.y - 4, t.r * 0.6, '#2c6b35');
    }
    for (const k of state.containers) {
      rect(k.x, k.y, k.w, k.h, k.color);
      rect(k.x, k.y, k.w, 4, 'rgba(0,0,0,0.3)');
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfL = 27;
    const halfW = 13;
    rect(-halfL, -halfW, halfL * 2, halfW * 2, car.color);
    rect(halfL - 16, -halfW + 3, 12, halfW * 2 - 6, '#1c2430');
    rect(-6, -halfW + 3, 14, halfW * 2 - 6, '#26303d');
    if (car.vault) {
      rect(-halfL, -halfW, halfL * 2, 4, '#fff3b0');
      rect(-halfL, halfW - 4, halfL * 2, 4, '#fff3b0');
    }
    if (car.police) {
      const blink = Math.floor(time * 4) % 2 === 0;
      rect(-4, -halfW - 3, 8, 4, blink ? PALETTE.policeLight : PALETTE.policeLight2);
    }
    if (car.health < 40) {
      context.fillStyle = 'rgba(20,20,20,0.5)';
      context.fillRect(-halfL + 4, -halfW + 4, 12, 8);
    }
    context.restore();
  }

  function drawObjective(state, time) {
    if (state.mission < 0) return;
    const stage = MISSIONS[state.mission].stages[state.stage];
    if (!stage || stage.x === undefined) return;
    const pulse = 1 + 0.18 * Math.sin(time * 5);
    const r = 26 * pulse;
    context.strokeStyle = '#f2c94c';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(stage.x, stage.y, r, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(stage.x, stage.y, 5, 0, Math.PI * 2);
    context.fillStyle = '#f2c94c';
    context.fill();
  }

  function drawMinimap(state) {
    const mx = VIEW.width - MINIMAP.w - MINIMAP.margin;
    const my = VIEW.height - MINIMAP.h - MINIMAP.margin;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    rect(mx - 4, my - 4, MINIMAP.w + 8, MINIMAP.h + 8, PALETTE.minimapBg);
    rect(mx, my + SAND_Y * sy, MINIMAP.w, MINIMAP.h - SAND_Y * sy, PALETTE.water);
    context.strokeStyle = '#5a6270';
    context.lineWidth = 2;
    for (const ax of AVENUES) {
      context.beginPath();
      context.moveTo(mx + ax * sx, my);
      context.lineTo(mx + ax * sx, my + SAND_Y * sy);
      context.stroke();
    }
    for (const s of STREETS) {
      context.beginPath();
      context.moveTo(mx, my + s * sy);
      context.lineTo(mx + MINIMAP.w, my + s * sy);
      context.stroke();
    }
    for (const b of state.buildings) {
      rect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy), '#7d8590');
    }
    const stage = state.mission >= 0 ? MISSIONS[state.mission].stages[state.stage] : null;
    if (stage && stage.x !== undefined) {
      circle(mx + stage.x * sx, my + stage.y * sy, 4, '#f2c94c');
    }
    if (state.vaultCar) circle(mx + state.vaultCar.x * sx, my + state.vaultCar.y * sy, 3, '#fff3b0');
    for (const unit of state.police) circle(mx + unit.x * sx, my + unit.y * sy, 3, '#4fc3f7');
    const p = state.player.inCar ?? state.player;
    circle(mx + p.x * sx, my + p.y * sy, 4, '#f2c94c');
    context.strokeStyle = '#eef1f5';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(mx + p.x * sx, my + p.y * sy, 6, 0, Math.PI * 2);
    context.stroke();
  }

  function drawHud(state, screen) {
    const p = state.player;
    // Cash and mission.
    text(`$${state.cash.toLocaleString('en-US')}`, 20, 34, 30, PALETTE.cash, 'left', 'top');
    const missionName = state.mission >= 0 ? MISSIONS[state.mission].name : 'Solmar Bay';
    text(missionName, 20, 64, 17, PALETTE.text, 'left', 'top');
    text(state.objective, 20, 88, 16, PALETTE.muted, 'left', 'top');
    // Wanted stars and health, top right.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, VIEW.width - 20, 34, 26, PALETTE.star, 'right', 'top');
    const barW = 150;
    const barX = VIEW.width - 20 - barW;
    rect(barX, 66, barW, 12, PALETTE.healthBg);
    rect(barX, 66, barW * Math.max(0, p.health) / 100, 12, PALETTE.health);
    text(`${Math.ceil(Math.max(0, p.health))}`, barX - 8, 78, 14, PALETTE.text, 'right', 'top');
    if (p.bustTimer > 0) {
      text('THEY ARE ON YOU — RUN!', VIEW.width / 2, 120, 22, '#ff6b5e', 'center', 'top');
    }
    // Banner: only while playing — on an end panel it would sit on top of it.
    if (state.banner && screen === SCREEN_PLAY) {
      const alpha = Math.min(1, state.banner.t);
      context.save();
      context.globalAlpha = alpha;
      rect(VIEW.width / 2 - 320, 150, 640, 76, PALETTE.banner);
      context.strokeStyle = '#f2c94c';
      context.lineWidth = 2;
      context.strokeRect(VIEW.width / 2 - 320, 150, 640, 76);
      text(state.banner.text, VIEW.width / 2, 178, 26, PALETTE.text, 'center', 'top');
      if (state.banner.sub) text(state.banner.sub, VIEW.width / 2, 208, 15, PALETTE.muted, 'center', 'top');
      context.restore();
    }
    // Controls hint, bottom left.
    text('WASD move / drive · E enter car · F shoot · P pause · M mute', 20, VIEW.height - 16, 14, PALETTE.muted, 'left', 'bottom');
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const h = 150 + lines.length * 34 + 60;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    rect(x, y, w, h, PALETTE.banner);
    context.strokeStyle = accent ?? '#f2c94c';
    context.lineWidth = 3;
    context.strokeRect(x, y, w, h);
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.text, 'center', 'top');
    lines.forEach((line, i) => text(line, VIEW.width / 2, y + 122 + i * 34, 20, PALETTE.muted, 'center', 'top'));
    text(prompt, VIEW.width / 2, y + h - 26, 20, PALETTE.cash, 'center', 'top');
  }

  function draw(state, screen, best, muted) {
    const focus = state.player.inCar ?? state.player;
    const cam = {
      x: Math.max(0, Math.min(WORLD.width - VIEW.width, focus.x - VIEW.width / 2)),
      y: Math.max(0, Math.min(WORLD.height - VIEW.height, focus.y - VIEW.height / 2)),
    };
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e13';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Clip to the logical window, then translate by the camera.
    context.save();
    context.beginPath();
    context.rect(0, 0, VIEW.width, VIEW.height);
    context.clip();
    context.translate(-cam.x, -cam.y);
    drawCity(state, cam);
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      circle(pk.x, pk.y, 10, PALETTE.cash);
      text('$', pk.x, pk.y + 5, 14, '#12340f', 'center', 'alphabetic');
    }
    for (const ped of state.peds) circle(ped.x, ped.y, 9, ped.color);
    for (const g of state.gang) {
      if (!g.alive) continue;
      circle(g.x, g.y, 12, PALETTE.gang);
      context.strokeStyle = '#1c1c1c';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(g.x, g.y);
      context.lineTo(g.x + Math.cos(g.angle) * 22, g.y + Math.sin(g.angle) * 22);
      context.stroke();
    }
    for (const car of state.cars) drawCar(car, state.time);
    for (const unit of state.police) drawCar(unit, state.time);
    drawObjective(state, state.time);
    const p = state.player;
    if (!p.inCar) {
      if (p.hurtTimer <= 0 || Math.floor(state.time * 10) % 2 === 0) {
        circle(p.x, p.y, 13, PALETTE.playerJacket);
        circle(p.x, p.y, 8, PALETTE.player);
        context.strokeStyle = '#1c1c1c';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
        context.stroke();
      }
    }
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life * 2);
      circle(pt.x, pt.y, pt.size, pt.color);
    }
    context.globalAlpha = 1;
    context.restore();
    // Day / night tint over the whole window.
    const tint = skyTint(state.dayTime);
    if (tint) rect(0, 0, VIEW.width, VIEW.height, tint);
    // Night: a small clock readout so the cycle is visible.
    const hour = Math.floor(state.dayTime);
    const minute = Math.floor((state.dayTime - hour) * 60);
    text(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, VIEW.width - 20, VIEW.height - 16, 14, PALETTE.muted, 'right', 'bottom');
    if (muted) text('MUTED', 20, VIEW.height - 44, 14, PALETTE.muted, 'left', 'bottom');

    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8, 10, 14, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('SOLMAR BAY', [
        'Mara Voss is back. Four jobs. $5,000 on the table.',
        'Steal cars, lose the cops, settle the debts, take the vault car.',
        `Best haul so far: $${best.toLocaleString('en-US')}`,
      ], 'Press Enter or click to start', '#f2c94c');
      return;
    }
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits.'], 'Press P to keep playing', '#4fc3f7');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar PD got you.', `Cash kept: $${state.cash.toLocaleString('en-US')}`], 'Press Enter to try again', '#e5534b');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Mara Voss did not make it out of Solmar Bay.', `Cash kept: $${state.cash.toLocaleString('en-US')}`], 'Press Enter to try again', '#e5534b');
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel('SOLMAR BAY IS YOURS', [
        `All four jobs done. $${TOTAL_PAY.toLocaleString('en-US')} banked.`,
        `Shots ${state.stats.shots} · Hits ${state.stats.hits} · Cars stolen ${state.stats.carsStolen}`,
      ], 'Press Enter to play again', '#7be07b');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
