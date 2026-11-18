// Renders the four screenshot scenes with headless Chromium, driven over the
// DevTools protocol with Node's built-in WebSocket — no npm packages needed.
// Usage: node capture-shots.mjs [--port 8091]
// Reads shots.json, serves game/ on localhost, waits for window.__shotReady
// on each scene, and writes a 1280x720 JPEG into screenshots/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

const CHROME = process.env.CHROME_BIN ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const WIDTH = 1280;
const HEIGHT = 720;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex === -1 ? 8091 : Number(args[portIndex + 1]);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(gameDir, path);
  try {
    const data = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': data.length });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const debugPort = port + 100;
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--no-sandbox',
    '--disable-gpu',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i += 1) {
      await sleep(200);
      try { targets = await getJson(`http://127.0.0.1:${debugPort}/json`); } catch { /* not up yet */ }
    }
    if (!targets) throw new Error('Chromium did not open its DevTools port');
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target from Chromium');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    function send(method, params) {
      return new Promise((resolve) => {
        const mid = (id += 1);
        pending.set(mid, resolve);
        ws.send(JSON.stringify({ id: mid, method, params: params ?? {} }));
      });
    }
    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
      return res.result?.result?.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

    for (const shot of shots) {
      const url = `http://127.0.0.1:${port}/index.html${shot.query}`;
      await send('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i += 1) {
        await sleep(100);
        ready = await evaluate('window.__shotReady === true');
      }
      if (!ready) throw new Error(`scene ${shot.name} never signalled ready`);
      await sleep(150);
      const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      const data = Buffer.from(shotRes.result.data, 'base64');
      writeFileSync(join(shotsDir, shot.name), data);
      const size = statSync(join(shotsDir, shot.name)).size;
      console.log(`${shot.name}: ${size} bytes${size > 262144 ? '  OVER 256 KiB!' : ''}`);
      if (size > 262144) throw new Error(`${shot.name} is over the 256 KiB cap`);
    }
    console.log('all screenshots rendered');
  } finally {
    chrome.kill('SIGTERM');
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
