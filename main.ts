// Solmar Bay, a gta6-01 entry (Node 22, standard library only). The game is
// this directory's game/ folder — plain static files a desktop browser loads
// offline (game/index.html and its ES modules, no library, no network
// request) — and this program hands it in: it copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// The program is deliberately strict about what it hands in, because the
// scorer refuses an entry that breaks its caps: it checks the screenshot
// count and sizes and the game folder's file count and bytes before it writes
// anything, and it writes the dossier twice, once to a scratch copy, to prove
// the two runs produce the same bytes.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// The scorer's own caps, from the kit's gate: the dossier text cap shapes the
// bytes; the rest refuse an entry the scorer would refuse.
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  throw new Error(`Solmar Bay: ${message}`);
}

function countGameFiles(dir, prefix) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    if (name.isDirectory()) {
      const sub = countGameFiles(path, rel);
      files += sub.files;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      if (Buffer.byteLength(rel, 'utf8') > LIMITS.game_path_max_bytes) fail(`game path over 1000 bytes: ${rel}`);
      files += 1;
      bytes += statSync(path).size;
    } else {
      fail(`game/ holds a non-file: ${rel}`);
    }
  }
  return { files, bytes };
}

function checkScreenshots(dir) {
  if (!existsSync(dir)) fail('screenshots/ is missing');
  const names = readdirSync(dir).filter((name) => !name.startsWith('.')).sort();
  if (names.length < 3 || names.length > LIMITS.screenshots.max) {
    fail(`screenshots/ holds ${names.length} images, need 3 or 4`);
  }
  for (const name of names) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('-')) fail(`bad screenshot name: ${name}`);
    const size = statSync(join(dir, name)).size;
    if (size > LIMITS.screenshots.max_bytes) fail(`screenshot over 256 KiB: ${name}`);
    const header = readFileSync(join(dir, name)).subarray(0, 3);
    const isJpeg = header[0] === 0xff && header[1] === 0xd8;
    const isPng = header[0] === 0x89 && header[1] === 0x50;
    if (!isJpeg && !isPng) fail(`screenshot is not a JPEG or PNG: ${name}`);
  }
  return names;
}

function buildInto(target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');
  const counted = countGameFiles(gameDir, '');
  if (counted.files > LIMITS.game_max_files) fail(`game/ holds ${counted.files} files, over 993`);
  if (counted.bytes > LIMITS.game_max_bytes) fail(`game/ is ${counted.bytes} bytes, over 48 MiB`);
  const shots = checkScreenshots(shotsDir);
  cpSync(gameDir, join(target, 'game'), { recursive: true });
  mkdirSync(join(target, 'screenshots'), { recursive: true });
  for (const name of shots) cpSync(join(shotsDir, name), join(target, 'screenshots', name));
  writeFileSync(join(target, 'dossier.json'), buildDossier(target, LIMITS));
  return { shots, counted };
}

function main() {
  const { shots, counted } = buildInto(out);
  // Prove the second run writes the same bytes: build again to a scratch
  // directory and compare the dossier byte for byte.
  const scratch = join(dirname(out), `.${basename(out)}-check`);
  buildInto(scratch);
  const first = readFileSync(join(out, 'dossier.json'));
  const second = readFileSync(join(scratch, 'dossier.json'));
  rmSync(scratch, { recursive: true, force: true });
  if (!first.equals(second)) fail('the two runs wrote different dossiers');
  const text = JSON.parse(first.toString('utf8')).text ?? '';
  console.log(
    `Solmar Bay handed in: ${counted.files} game files (${counted.bytes} bytes), ` +
    `${shots.length} screenshots (${shots.join(', ')}), dossier ${first.length} bytes, ` +
    `dossier text ${Buffer.byteLength(text, 'utf8')} bytes (cap ${LIMITS.text_max_bytes}).`,
  );
}

main();
