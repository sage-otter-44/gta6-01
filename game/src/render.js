// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across a 1280x800 logical view; the HUD, minimap
// and panels are drawn in screen space on top. Flat shapes and canvas text,
// no images and no network.
import { WORLD } from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const VIEW_W = 1280;
const VIEW_H = 800;
const MINIMAP = { w: 200, h: 150, margin: 12 };

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function darknessAt(time) {
  if (time < 0.55) return 0;
  if (time < 0.7) return ((time - 0.55) / 0.15) * 0.22;
  if (time < 0.95) return 0.34;
  return 0.34 - ((time - 0.95) / 0.05) * 0.34;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, dpr: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    view.scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    view.x = (canvas.width - VIEW_W * view.scale) / 2;
    view.y = (canvas.height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}|${weight ?? ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function cameraFor(state) {
    const p = state.player;
    return {
      x: clamp(p.x - VIEW_W / 2, 0, WORLD.width - VIEW_W),
      y: clamp(p.y - VIEW_H / 2, 0, WORLD.height - VIEW_H),
    };
  }

  /** Convert a point in canvas CSS pixels to world coordinates. */
  function worldPoint(state, cssX, cssY) {
    const cam = cameraFor(state);
    return {
      x: cam.x + (cssX * view.dpr - view.x) / view.scale,
      y: cam.y + (cssY * view.dpr - view.y) / view.scale,
    };
  }

  function drawGround(state) {
    // Grass base, then the beach and the water along the south edge.
    context.fillStyle = '#5d8a4a';
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.fillStyle = '#d9c184';
    context.fillRect(0, WORLD.beachY, WORLD.width, WORLD.height - WORLD.beachY);
    const wave = Math.sin(state.elapsed * 1.4) * 4;
    context.fillStyle = '#2f6fb2';
    context.fillRect(0, WORLD.waterY + wave, WORLD.width, WORLD.height - WORLD.waterY - wave);
    context.fillStyle = '#7fb6e0';
    for (let x = 40; x < WORLD.width; x += 160) {
      context.fillRect(x + wave, WORLD.waterY + 8 + wave * 0.5, 70, 3);
    }
    // Central Plaza park.
    context.fillStyle = '#4a7a38';
    context.fillRect(876, 676, 248, 168);
    context.fillStyle = '#3f7ec2';
    context.beginPath();
    context.ellipse(1000, 760, 46, 26, 0, 0, Math.PI * 2);
    context.fill();
    // The port's concrete strip.
    context.fillStyle = '#8a8a86';
    context.fillRect(2476, 120, 84, 1700);
  }

  function drawRoads() {
    const half = WORLD.roadWidth / 2;
    context.fillStyle = '#3a3a3e';
    for (const sx of WORLD.streetsX) context.fillRect(sx - half, 0, WORLD.roadWidth, WORLD.beachY);
    for (const sy of WORLD.streetsY) context.fillRect(0, sy - half, WORLD.width, WORLD.roadWidth);
    // Sidewalk edges.
    context.fillStyle = '#9a9a92';
    for (const sx of WORLD.streetsX) {
      context.fillRect(sx - half - 6, 0, 6, WORLD.beachY);
      context.fillRect(sx + half, 0, 6, WORLD.beachY);
    }
    for (const sy of WORLD.streetsY) {
      context.fillRect(0, sy - half - 6, WORLD.width, 6);
      context.fillRect(0, sy + half, WORLD.width, 6);
    }
    // Centre dashes.
    context.fillStyle = '#d8c95a';
    for (const sx of WORLD.streetsX) {
      for (let y = 20; y < WORLD.beachY; y += 56) context.fillRect(sx - 2, y, 4, 28);
    }
    for (const sy of WORLD.streetsY) {
      for (let x = 20; x < WORLD.width; x += 56) context.fillRect(x, sy - 2, 28, 4);
    }
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      // Windows: a fixed pattern from the building's own position.
      context.fillStyle = 'rgba(255, 240, 180, 0.75)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx * 7 + cy * 3 + b.x) % 5 < 2) {
            context.fillRect(b.x + 12 + cx * 26, b.y + 12 + cy * 26, 10, 12);
          }
        }
      }
    }
    for (const c of state.containers) {
      context.fillStyle = c.color;
      context.fillRect(c.x, c.y, c.w, c.h);
      context.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = c.y + 12; y < c.y + c.h; y += 16) context.fillRect(c.x, y, c.w, 3);
    }
    for (const tree of state.trees) {
      context.fillStyle = '#2f5a26';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4a8a3a';
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const bob = Math.sin(pickup.bob) * 3;
      const y = pickup.y + bob;
      if (pickup.kind === 'cash') {
        context.fillStyle = '#2f7a3a';
        context.beginPath();
        context.arc(pickup.x, y, 13, 0, Math.PI * 2);
        context.fill();
        text('$', pickup.x, y + 6, 18, '#e8f5e0', 'center', 'bold');
      } else if (pickup.kind === 'health') {
        context.fillStyle = '#f0f0f0';
        context.beginPath();
        context.arc(pickup.x, y, 13, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#c94f42';
        context.fillRect(pickup.x - 8, y - 3, 16, 6);
        context.fillRect(pickup.x - 3, y - 8, 6, 16);
      } else {
        // Stash: a brown bag with a dollar band, pulsing.
        const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
        context.fillStyle = '#7a5a34';
        context.beginPath();
        context.arc(pickup.x, y, 15 * pulse, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#d8c95a';
        context.fillRect(pickup.x - 10, y - 3, 20, 6);
      }
    }
  }

  function drawMarker(state, marker) {
    if (!marker) return;
    const pulse = 1 + Math.sin(state.elapsed * 5) * 0.18;
    const { x, y } = marker;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = '#ffd23e';
    context.strokeStyle = '#7a5a00';
    context.lineWidth = 3;
    const s = 16 * pulse;
    context.fillRect(-s / 2, -s / 2, s, s);
    context.strokeRect(-s / 2, -s / 2, s, s);
    context.restore();
    // A beam so the marker reads from far away.
    context.fillStyle = 'rgba(255, 210, 62, 0.18)';
    context.fillRect(x - 4, y - 220, 8, 220);
    text(marker.label, x, y - 30, 17, '#ffd23e', 'center', 'bold');
  }

  function drawCar(car, state) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(-40 + 4, -22 + 5, 80, 44, 10);
    context.fill();
    context.fillStyle = car.kind === 'police' ? '#e8e8e8' : car.color;
    roundRect(-40, -22, 80, 44, 10);
    context.fill();
    if (car.kind === 'police') {
      context.fillStyle = '#20242a';
      context.fillRect(-8, -22, 16, 44);
      const flash = Math.floor(state.elapsed * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#2f7ec2';
      context.fillRect(-6, -24, 12, 8);
      context.fillStyle = flash ? '#2f7ec2' : '#ff3b30';
      context.fillRect(-6, 16, 12, 8);
    }
    // Windshield and roof.
    context.fillStyle = 'rgba(20, 30, 44, 0.85)';
    context.fillRect(14, -18, 12, 36);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(-12, -17, 18, 34);
    // Headlights at night.
    if (darknessAt(state.time) > 0.2) {
      context.fillStyle = '#ffe9a8';
      context.fillRect(38, -18, 4, 8);
      context.fillRect(38, 10, 4, 8);
    }
    if (car.disabled > 0) {
      context.fillStyle = 'rgba(120,120,120,0.7)';
      context.beginPath();
      context.arc(0, -26, 8 + Math.sin(state.elapsed * 3) * 3, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPed(ped) {
    if (ped.state === 'dead') {
      context.fillStyle = '#5a3a3a';
      context.beginPath();
      context.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = ped.skin;
    context.beginPath();
    context.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(ped.x, ped.y, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.skin;
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 7, ped.y + Math.sin(ped.angle) * 7, 3, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer(state, aimAngle) {
    const p = state.player;
    if (p.onFoot) {
      if (p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0) return;
      context.fillStyle = '#20242a';
      context.beginPath();
      context.arc(p.x, p.y, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(p.x, p.y, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#20242a';
      context.beginPath();
      context.arc(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6, 4, 0, Math.PI * 2);
      context.fill();
      // The gun points where the mouse aims.
      context.strokeStyle = '#20242a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + Math.cos(aimAngle) * 22, p.y + Math.sin(aimAngle) * 22);
      context.stroke();
    }
  }

  function drawBullets(state) {
    for (const bullet of state.bullets) {
      context.fillStyle = '#ffd76a';
      context.beginPath();
      context.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255, 215, 106, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(bullet.x, bullet.y);
      context.lineTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawNight(state) {
    const dark = darknessAt(state.time);
    if (dark <= 0) return;
    context.fillStyle = `rgba(8, 12, 40, ${dark})`;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  function drawWorld(state, marker, aimAngle) {
    const cam = cameraFor(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - cam.x * view.scale, view.y - cam.y * view.scale);
    drawGround(state);
    drawRoads();
    drawBuildings(state);
    drawPickups(state);
    drawMarker(state, marker);
    const cars = [...state.cars].sort((a, b) => a.y - b.y);
    for (const car of cars) drawCar(car, state);
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state, aimAngle);
    drawBullets(state);
    drawParticles(state);
    drawNight(state);
    return cam;
  }

  function drawMinimap(state, marker) {
    const { w, h, margin } = MINIMAP;
    const x0 = canvas.width / view.dpr - w - margin;
    const y0 = margin;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.fillStyle = 'rgba(10, 14, 22, 0.85)';
    roundRect(x0 - 4, y0 - 4, w + 8, h + 8, 6);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(x0, y0, w, h);
    context.clip();
    context.fillStyle = '#5d8a4a';
    context.fillRect(x0, y0, w, h);
    context.fillStyle = '#2f6fb2';
    context.fillRect(x0, y0 + WORLD.waterY * sy, w, h - WORLD.waterY * sy);
    context.fillStyle = '#3a3a3e';
    for (const sxx of WORLD.streetsX) context.fillRect(x0 + sxx * sx - 2, y0, 4, h);
    for (const syy of WORLD.streetsY) context.fillRect(x0, y0 + syy * sy, w, 4);
    for (const car of state.cars) {
      if (car.kind === 'police') {
        context.fillStyle = Math.floor(state.elapsed * 6) % 2 === 0 ? '#ff3b30' : '#2f7ec2';
        context.beginPath();
        context.arc(x0 + car.x * sx, y0 + car.y * sy, 3.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (marker) {
      const pulse = 3 + Math.sin(state.elapsed * 5) * 1.2;
      context.fillStyle = '#ffd23e';
      context.beginPath();
      context.arc(x0 + marker.x * sx, y0 + marker.y * sy, pulse, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#20242a';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x0 + state.player.x * sx, y0 + state.player.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawHud(state, extras) {
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const cw = canvas.width / view.dpr;
    // Cash and health, top left.
    context.fillStyle = 'rgba(10, 14, 22, 0.75)';
    roundRect(12, 12, 210, 64, 8);
    context.fill();
    text(`$${state.cash.toLocaleString('en-US')}`, 26, 42, 26, '#7de08a', 'left', 'bold');
    context.fillStyle = '#3a3a3e';
    context.fillRect(26, 52, 150, 10);
    context.fillStyle = state.health > 30 ? '#58c96a' : '#c94f42';
    context.fillRect(26, 52, 150 * (state.health / 100), 10);
    text('HP', 182, 62, 13, '#eef1f5', 'left', 'bold');
    // Wanted stars, top centre.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, cw / 2, 40, 26, state.wanted > 0 ? '#ffd23e' : 'rgba(238,241,245,0.5)', 'center', 'bold');
    if (state.wanted > 0) text('WANTED', cw / 2, 62, 13, '#ffb3ab', 'center', 'bold');
    // Time of day, under the minimap.
    const hours = Math.floor(((state.time * 24 + 6) % 24));
    const minutes = Math.floor((((state.time * 24 + 6) % 1) * 60));
    text(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, cw - MINIMAP.margin - MINIMAP.w / 2, MINIMAP.margin + MINIMAP.h + 22, 15, '#eef1f5', 'center', 'bold');
    // Mission line, bottom centre.
    if (extras.missionText) {
      const mission = extras.missionName ? `${extras.missionName} — ` : '';
      const label = mission + extras.missionText;
      context.font = `bold 17px ${FONT}`;
      const width = context.measureText(label).width + 32;
      context.fillStyle = 'rgba(10, 14, 22, 0.75)';
      roundRect((cw - width) / 2, canvas.height / view.dpr - 56, width, 36, 8);
      context.fill();
      text(label, cw / 2, canvas.height / view.dpr - 31, 17, '#ffd23e', 'center', 'bold');
    }
    // Speed, bottom right, while driving.
    if (!state.player.onFoot && state.player.car) {
      const mph = Math.round(Math.abs(state.player.car.speed) * 0.18);
      text(`${mph} mph`, cw - 24, canvas.height / view.dpr - 24, 22, '#eef1f5', 'right', 'bold');
    }
    // Controls hint for the first seconds of play.
    if (extras.hintSeconds > 0) {
      context.globalAlpha = Math.min(1, extras.hintSeconds);
      text('WASD move · E steal / exit car · Click shoot · Shift run · P pause · M mute', 24, canvas.height / view.dpr - 24, 15, '#eef1f5', 'left');
      context.globalAlpha = 1;
    }
    // Centre message banner. Long mission intros shrink until they fit the
    // screen — and stop short of the minimap, which is drawn over the banner
    // and would otherwise hide the end of the message.
    if (state.message) {
      const maxWidth = 2 * (cw - MINIMAP.w - MINIMAP.margin - 8 - cw / 2);
      let size = 22;
      context.font = `bold ${size}px ${FONT}`;
      while (size > 15 && context.measureText(state.message).width + 36 > maxWidth) {
        size -= 1;
        context.font = `bold ${size}px ${FONT}`;
      }
      const width = Math.min(context.measureText(state.message).width + 36, maxWidth);
      context.fillStyle = 'rgba(10, 14, 22, 0.8)';
      roundRect((cw - width) / 2, 84, width, 40, 8);
      context.fill();
      text(state.message, cw / 2, 112, size, '#ffffff', 'center', 'bold');
    }
    drawMinimap(state, extras.marker);
    // Off-screen marker arrow.
    if (extras.marker) drawEdgeArrow(state, extras.marker);
  }

  function drawEdgeArrow(state, marker) {
    const cam = cameraFor(state);
    const mx = marker.x - cam.x;
    const my = marker.y - cam.y;
    if (mx > 40 && mx < VIEW_W - 40 && my > 40 && my < VIEW_H - 40) return;
    const cx = clamp(mx, 60, VIEW_W - 60);
    const cy = clamp(my, 90, VIEW_H - 60);
    const angle = Math.atan2(my - (VIEW_H / 2), mx - (VIEW_W / 2));
    // Convert view coordinates to CSS pixels through the current transform.
    context.save();
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const px = (view.x + cx * view.scale) / view.dpr;
    const py = (view.y + cy * view.scale) / view.dpr;
    context.translate(px, py);
    context.rotate(angle);
    context.fillStyle = '#ffd23e';
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-10, -11);
    context.lineTo(-10, 11);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawPanel(title, lines, prompt, accent) {
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const cw = canvas.width / view.dpr;
    const ch = canvas.height / view.dpr;
    context.fillStyle = 'rgba(8, 10, 18, 0.72)';
    context.fillRect(0, 0, cw, ch);
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (cw - width) / 2;
    const y = (ch - height) / 2;
    context.fillStyle = '#181d29';
    roundRect(x, y, width, height, 12);
    context.fill();
    context.strokeStyle = accent ?? '#f2c94c';
    context.lineWidth = 2;
    roundRect(x, y, width, height, 12);
    context.stroke();
    text(title, cw / 2, y + 72, 44, '#f2f5f8', 'center', 'bold');
    lines.forEach((line, i) => {
      text(line, cw / 2, y + 122 + i * 34, 19, '#b9c0cc', 'center');
    });
    text(prompt, cw / 2, y + height - 30, 20, '#f2c94c', 'center', 'bold');
  }

  /** Paint one frame. `extras` carries the HUD's mission text, marker and hints. */
  function draw(state, screen, extras, aimAngle) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_TITLE) {
      drawWorld(state, null, aimAngle ?? 0);
      drawPanel(
        'SOLMAR BAY',
        [
          'A sun-soaked open-world crime story.',
          'Steal cars, outrun the cops, run four jobs for Mara Voss.',
          'WASD move · E steal a car · Click to shoot · Shift to run',
          extras.saveExists ? 'A saved game is waiting — press C to continue it.' : 'Your progress saves itself as you play.',
        ],
        'Press ENTER to start',
      );
      return;
    }
    drawWorld(state, extras.marker, aimAngle ?? 0);
    drawHud(state, extras);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city will wait for you.', 'M mute · P resume'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar Bay police took you in.', 'Bail: $200. Mara still needs you.'], 'Press ENTER to get back out there', '#7fb6e0');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Solmar Bay General patched you up.', 'Hospital bill: $300.'], 'Press ENTER to get back out there', '#c94f42');
    } else if (state.storyDone) {
      context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      text('STORY COMPLETE — Solmar Bay is yours', canvas.width / view.dpr / 2, 150, 24, '#7de08a', 'center', 'bold');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, worldPoint };
}
