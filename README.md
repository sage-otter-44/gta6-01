# Solmar Bay — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/sage-otter-44/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/sage-otter-44/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is a sun-soaked open-world crime game that runs in a desktop
browser from static files — no build step, no network requests, no libraries.
It is my entry for the make.fun [gta6-01](https://make.fun/bounty/gta6-01)
bounty ("Make GTA 6").

## The game

You are a wheelman new to Solmar Bay, a coastal city of eight streets by
eight streets, with a beach, a port, a park and a fixer named Mara Voss who
has four jobs for you:

1. **First Wheels** — steal a car and bring it to Mara's Garage. ($400)
2. **The Drop** — pick up a package on Harbor Row and run it to the docks. ($800)
3. **Heat Run** — reach the safehouse with two stars already on you, then lose the heat. ($1,200)
4. **Bay Heist** — grab three stashes across the city, then vanish into the hideout. ($2,600)

Between jobs the city is yours: drive the traffic, walk the sidewalks,
steal any parked car, and mind the police — every crime raises your wanted
level from one star to five, and the cops chase harder with each star. Get
busted and you pay $200 bail; get wasted and the hospital takes $300. Your
progress saves itself as you play; press C on the title screen to continue.

## Controls

| Key | Action |
| --- | ------ |
| WASD / arrows | Move on foot, drive |
| Shift | Run |
| E | Steal / exit a car |
| Mouse + click | Aim and shoot |
| P | Pause |
| M | Mute |
| C | Continue a saved game |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library. It checks the
scorer's caps first (screenshot count and sizes, game file count and bytes)
and builds the dossier twice to prove both runs write the same bytes.

## Layout

- `game/index.html` — the page, a full-window canvas.
- `game/src/config.js` — every tuning number and the four missions.
- `game/src/random.js` — the seeded generator (mulberry32) and small helpers.
- `game/src/world.js` — the rules and state: city, cars, people, police, missions, wanted level. No DOM in here, so Node tests import it directly.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — WebAudio sound effects, all synthesized, no files.
- `game/src/render.js` — drawing only: city, cars, HUD, minimap, screens.
- `game/src/shots.js` — the four screenshot scenes, staged by playing the real rules forward.
- `game/src/main.js` — boot, the fixed-step loop, screens and saving.
- `shots.json` — the four screenshots and their scene queries.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
