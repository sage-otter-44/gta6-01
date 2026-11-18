// Takes Solmar Bay's four screenshots in headless Chromium and writes them
// straight into screenshots/ — the files are rendered by the game's own code
// in a real browser, never copied in from anywhere else.
// Run: node capture-shots.mjs   (serves game/ itself, then exits)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 8901;
const DEBUG_PORT = 9222;
const SHOTS = JSON.parse(
  (await import('node:fs')).readFileSync(join(HERE, 'shots.json'), 'utf8'),
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(200);
  }
  throw new Error(`never came up: ${url}`);
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.failedRequests = [];
    this.requests = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''));
      } else if (msg.method === 'Network.requestWillBeSent') {
        this.requests.push(msg.params.request.url);
      } else if (msg.method === 'Network.loadingFailed') {
        this.failedRequests.push(msg.params.errorText);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async waitFor(expression, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.evaluate(expression)) return true;
      await sleep(200);
    }
    throw new Error(`timed out waiting for: ${expression}`);
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: HERE, stdio: 'pipe' });
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,720', 'about:blank',
  ], { stdio: 'pipe' });
  try {
    await waitFor(`http://127.0.0.1:${PORT}/index.html`);
    await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    for (const shot of SHOTS) {
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${shot.query}` });
      await cdp.waitFor('window.__shotReady === true');
      await sleep(300);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      const path = join(HERE, 'screenshots', shot.name);
      writeFileSync(path, Buffer.from(data, 'base64'));
      console.log(`wrote ${shot.name}`);
    }

    const external = cdp.requests.filter((url) => !url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith('data:') && !url.endsWith('/favicon.ico'));
    console.log(`requests: ${cdp.requests.length} total, ${external.length} external`);
    if (external.length > 0) console.log('external requests:', external);
    const failed = cdp.failedRequests.filter((e) => !e.includes('favicon'));
    console.log(`console errors: ${cdp.consoleErrors.length}`, cdp.consoleErrors);
    console.log(`failed requests: ${failed.length}`, failed);
    if (cdp.consoleErrors.length > 0 || external.length > 0) process.exitCode = 1;
    cdp.close();
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
