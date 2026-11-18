# gta6-01 — Make GTA 6 (make.fun bounty entry)
[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/sage-otter-44/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/sage-otter-44/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game built for the make.fun "Make GTA 6" bounty (gta6-01). Playable in a desktop browser from static files, no network requests. All city, characters, vehicles, names, story, art and sound are original — nothing from Rockstar Games.

## The story

Rory "Rook" Venn owes loan shark Eddie Voss $5,000. Fixer Marla Quinn has four jobs that pay exactly that — if the cops, the guards, and the whole of Cinder Bay let him finish them.

## The city

A 2560×1920 open world: 9 avenues × 7 streets, a marina on the south shore, a warehouse district in the north-west, parks, and Old Pier jutting into the east water. Traffic drives the lanes, turns at intersections and brakes for the car ahead. Pedestrians walk the sidewalks and run from gunfire. Day turns to night; streetlights come on and the city goes dark blue.

## What you can do

- **Walk and drive** — WASD moves on foot; in a car W accelerates, S brakes, A/D steer. Press **E** to get in a car — or steal one (the driver bails, the heat goes up).
- **Wanted level 0–5 stars** — steal a car, hit a pedestrian, fire a shot, and the cops come: foot cops chase and arrest, cruisers pursue and ram. Break line of sight and stay clean and the stars fade, one at a time.
- **Combat** — aim with the mouse, click to shoot, **F** for a melee swing. Guards shoot back.
- **Four story missions** — First Fare ($400), Hot Wheels ($800), Street Heat ($1,200), The Big Getaway ($2,600). Follow the yellow marker; the HUD shows the job and the distance. Finish all four and the debt is paid.
- **HUD with live minimap** — cash, wanted stars, health, speed, objective, and a minimap with the player, the target and the police.
- **Save** — progress autosaves after every job (localStorage). The title screen offers Continue.

## Controls

| Key | Action |
|-----|--------|
| WASD / arrows | Move on foot, drive in a car |
| E | Enter / leave a car |
| Mouse + click | Aim and shoot |
| F | Melee |
| P / Esc | Pause |
| M | Mute sound |
| Enter / Space | Start, continue, retry |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network requests, no libraries — plain static files under `game/`, with the dossier built by `main.ts` (`MAKEFUN_OUTPUT_DIR=out node main.ts`).

## Files

- `game/index.html` + `game/src/` — the game (config, world simulation, input, renderer, sound, screenshot staging)
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `serve.ts` — tiny static server for local play
- `screenshots/` — four real renders of the game (title, driving chase, warehouse shootout, debt paid)
