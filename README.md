# Diwali Village

A first-person browser game about a Diwali night in an Indian village courtyard. You step into the aangan with a
thaali of crackers, light diyas, set off fireworks, and the neighbours answer with a sky show. It runs in the
browser with no install beyond Node.

## Run it

```sh
npm i
npm run dev
```

Open the address Vite prints (http://localhost:5173 by default). Click the intro card to step inside and start
the sound. Clicking also captures the mouse, so the view turns with it. Press Esc to release it.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the production bundle into `dist/` |
| `npm test` | Runs the unit tests (Vitest, in `tests/`) |
| `npm run typecheck` | Type-checks without emitting files |
| `npx playwright test` | Runs the browser smoke test in headless Chromium and refreshes `screenshots/` |

The Playwright run starts its own dev server on port 5199. The first run needs
`npx playwright install chromium`.

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look around |
| W A S D | Walk |
| Shift | Tiptoe |
| E | Pick up the thaali, take the agarbatti, light the agarbatti at the diya, put a cracker on the thaali |
| G | Pick up or set down the thaali |
| F | Set the selected cracker down on the ground in front of you (hand-held sparklers go into your left hand) |
| Q or scroll | Choose a cracker from the thaali |
| Click | Touch the agarbatti tip to a ground fuse, or light a sparkler you are holding |
| M | Sound on or off |
| P | Photo mode on or off: hides the HUD and hands and adds a soft vignette and warm grade |
| K | Save the current frame as a PNG (in photo mode) |
| Esc | Pause and release the mouse |

Light the agarbatti at the tulsi diya first, then click near a fuse to light it. Stand back after you light a
cracker.

## Crackers

| Cracker | Hindi | Held or placed | What happens |
| --- | --- | --- | --- |
| Phuljhadi | फुलझड़ी | Held in the left hand | A sparkler: sparks and a flickering light for a fixed time |
| Pencil | पेंसिल | Held in the left hand | A sparkler that jets sparks from its tip and changes colour |
| Anar | अनार | Placed, 2.5 s fuse | A pot that throws a gold spark fountain for nine seconds |
| Chakri | चकरी | Placed, 2 s fuse | A spinning wheel that wanders across the floor and throws sparks |
| Rocket | रॉकेट | Placed, 2 s fuse | Flies up about 36 m and bursts in a random shape and colour |
| Laxmi Bomb | लक्ष्मी बम | Placed, 2.5 s fuse | A sharp crack with paper scraps and a puff of smoke |
| Sutli Bomb | सुतली बम | Placed, 4 s fuse | A heavy blast with a ring of dust and extra sparks |
| Ladi | लड़ी | Placed, 2 s fuse | A string of about 60 small pops along the fuse |
| Saanp Goli | साँप गोली | Placed, 1.5 s fuse | A pellet that grows into a curling ash snake with dark smoke |
| Sky Shot | स्काई शॉट | Placed, 3 s fuse | Twelve shells, one every 0.55 s, each bursting 25 to 32 m up |

Every counted burst feeds the finale. After ten bursts the neighbours' sky show starts and a greeting appears.

## Debug hook

Add `?debug` to the URL to expose `window.__diwali` for automated tests. It has `place(kind)` (puts a ground
cracker 3 m ahead), `lightAll()`, `teleport(x, z, yaw, pitch)` and `state()`. Normal visits never set the flag.

## Tech notes

- **Stack:** TypeScript, Vite and three.js. Unit tests use Vitest; the browser smoke test uses Playwright.
- **Layout:** `src/Game.ts` builds the village and runs the per-frame loop. `src/crackers/` holds the cracker
  classes, their catalogue and placement. `src/fx/` holds the shared sparks, smoke, light flashes, camera shake and
  aerial bursts. `src/world/` builds the aangan, the house and the props. `src/ui/` holds the DOM overlays.
- **Procedural assets:** all models, textures and sounds are generated in code. No image, model or audio files
  ship with the game.
- **Audio:** sounds are synthesised with the Web Audio API (oscillators and noise buffers).
- **Screenshots:** `screenshots/` holds the frames the Playwright run captures (`hands.png`, `aangan.png`,
  `burst.png`, `sky.png`). They are regenerated on each run.
