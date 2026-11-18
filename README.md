[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sage-otter-44/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sage-otter-44/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay

An original top-down 2D open-world crime game, built for the make.fun
gta6-01 bounty ("Make GTA 6"). No Rockstar names, maps or assets: the city,
the characters, the story and the art are all original, and the game runs
offline in a desktop browser from static files, with no network request.

Mara Voss is back in Solmar Bay. Four jobs stand between her and $5,000:
pick up a package on the pier, lose a police tail, collect three debts on the
docks, and steal the vault car from the port. Walk the streets or steal a
car and drive; traffic and pedestrians fill the roads, the wanted level
climbs from 0 to 5 stars as the heat rises, and the Solmar PD chases you
down. Get caught on foot and you are BUSTED; run out of health and you are
WASTED.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **WASD / arrows** — walk, or drive when in a car (W accelerates, S brakes)
- **E** — enter a car, or interact with a mission objective
- **F** — shoot (on foot)
- **P** — pause · **M** — mute · **Enter** — start / continue

Progress (cash and the mission reached) is saved in the browser, so a run
can continue after a visit. A day/night cycle moves over the city, and all
sound is synthesized with WebAudio — there are no audio files.

## Layout

- `game/index.html` — the page; `game/src/` — the game, plain ES modules
  (`config.js`, `random.js`, `world.js`, `render.js`, `input.js`,
  `audio.js`, `shots.js`, `main.js`)
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored make.fun
  library (`vendor/makefun-game.ts`)
- `serve.ts` — a tiny static server for local play
- `shots.json` — the four screenshot scenes; `test.mjs` — the Node tests
- `capture-shots.mjs` — renders the four screenshots with headless Chromium

## Tests

```sh
node test.mjs
```

## Screenshots

```sh
node capture-shots.mjs
```
