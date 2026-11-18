// Cinder Bay — the entrypoint that hands the game in.
//
// It takes the finished game (game/, plain static files a desktop browser loads offline) and
// the four screenshots, copies both into the output directory, and writes dossier.json there
// with the vendored make.fun library — the summary the judge reads (cover image, screenshots,
// schema, text). No build step, no bundler, no network: just a copy and a summary.
//
// Run it from this directory with the output directory in MAKEFUN_OUTPUT_DIR
// (the grader sets /output itself):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally first with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in, and where the hand-in goes.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the game in, then the screenshots beside it.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own gates (see the kit's reference/gate.json): at most 4
// screenshots of at most 256 KiB each, at most 993 files and 48 MiB under game/, no path
// under game/ longer than 1000 bytes, and dossier text at most 163,840 bytes. A hand-in
// that breaks one is refused outright, so buildDossier checks them here, before the judge
// ever sees the entry.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
