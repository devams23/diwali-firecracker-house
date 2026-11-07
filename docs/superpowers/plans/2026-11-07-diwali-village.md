# Diwali Village Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-person three.js browser game set in a traditional Indian village aangan on Diwali night, where the player carries crackers on a thaali, lights an agarbatti at the diya, and bursts 10 kinds of Indian crackers.

**Architecture:** Vite + TypeScript app. `core/Engine` owns renderer/scene/camera/bloom and a list of `Updatable`s ticked each frame. Shared services (sparks, smoke, flash lights, camera shake, audio) are created once and passed to crackers via an `FxContext`. Pure logic (collision, thaali inventory, fuse timer, interaction picking, hints) lives in small dependency-free modules with Vitest tests; `Game.ts` wires everything.

**Tech Stack:** vite@latest (vanilla-ts template), three@latest + @types/three, vitest@latest, @playwright/test (already globally available as 1.65; add as devDependency latest).

**Spec:** `docs/superpowers/specs/2026-11-07-diwali-village-design.md` — read it before every task; the "Anti-goals" and "Emotional UX" sections are binding.

## Global Constraints

- Every source file starts with a header comment (2–5 lines) explaining its role in the game; every exported class/function has a one-line `/** doc */` comment. Comments explain *why/what*, not line-by-line noise.
- No external image/model/audio assets. Textures via canvas, sound via Web Audio, geometry in code.
- Fonts via Google Fonts `<link>` in `index.html`: Tiro Devanagari Hindi, Cormorant Garamond (500,600), Inter (400,500).
- Palette (use these constants from `src/core/palette.ts`): night `#0b1020`, moon fill `#6f80a8`, plaster `#e8dcc4`, geru `#9c3b22`, earth `#7a5a3c`, wood `#5a3b22`, brass `#c9a24a`, flame `#ffb347`, marigold `#f2a01f`, ui-bg `rgba(28,18,10,0.72)`, ui-gold `#d9b46a`, ui-text `#f3e7cf`.
- No neon, no glassmorphism/backdrop blur, no emoji, no gradients in UI except subtle vignette.
- `dt` is clamped to max 0.05 s in the engine loop.
- Commits: one per task, conventional message (`feat: …`, `chore: …`, `test: …`), **no Co-Authored-By or any AI attribution lines.**
- Run `npx tsc --noEmit` and `npx vitest run` before every commit; both must pass.
- Units: metres. Y up. Aangan spans x ∈ [-9, 9], z ∈ [-7, 7]; house along north (z = -7 … -11); gate at south wall centre (z = 7). Player starts at (0, 1.6, 6) looking north (−z).

## Review Focus

1. Clicking before audio/pointer-lock is ready (first click is the browser gesture) → no exception; audio initialises on that click (Task 6 test: `AudioEngine.play` before `init` is a silent no-op).
2. Thaali full (10 items) → `add` returns false and the prompt says "The thaali is full" (Task 7 test).
3. Clicking a fuse with an unlit or absent agarbatti → nothing ignites; hint says "Light the agarbatti at the diya first" (Task 7 `nextHint` test).
4. Placing a cracker facing a wall or outside the aangan → placement point is clamped inside [-8.6, 8.6] × [-6.6, 6.6] (Task 8 `clampPlacement` test).
5. Many crackers at once (e.g. 10 anars) → spark pool never exceeds capacity; oldest particles are recycled, no crash (Task 5 `SparkPool` test).

---

### Task 1: Project scaffold & engine

**Files:**
- Create via `npm create vite@latest . -- --template vanilla-ts` (run in repo root; keep existing `.claude/`, `docs/`, `.gitignore`), then delete template demo files (`src/counter.ts`, `src/typescript.svg`, `public/vite.svg`, template CSS content).
- Create: `src/core/palette.ts`, `src/core/Engine.ts`, `src/core/events.ts`, `src/main.ts`, `src/style.css`, `index.html`, `vitest.config.ts`
- Test: `tests/events.test.ts`

**Interfaces:**
- Produces:
  - `palette.ts`: `export const PALETTE = { night, moon, plaster, geru, earth, wood, brass, flame, marigold } as const` (hex numbers) and `export const UI = { bg, gold, text }` (CSS strings).
  - `Engine.ts`: `export interface Updatable { update(dt: number, t: number): void }`; `export class Engine { readonly renderer: THREE.WebGLRenderer; readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly composer: EffectComposer; readonly bloom: UnrealBloomPass; constructor(container: HTMLElement); add(u: Updatable): void; remove(u: Updatable): void; start(): void }`. Camera fov 70, near 0.05, far 400. ACESFilmic, exposure 1.0, shadows off (performance; diyas fake light). Scene fog `FogExp2(PALETTE.night, 0.018)`, background `PALETTE.night`. Bloom strength 0.9, radius 0.6, threshold 0.82. Composer: RenderPass → UnrealBloomPass → OutputPass. Handles resize. Pixel ratio capped at 2.
  - `events.ts`: `export class Emitter<T extends Record<string, unknown>> { on<K extends keyof T>(k: K, fn: (p: T[K]) => void): () => void; emit<K extends keyof T>(k: K, p: T[K]): void }`; `export type GameEvents = { burst: { x: number; y: number; z: number; power: number }; lit: { kind: string }; finale: {} }`; `export const events = new Emitter<GameEvents>()`.
  - `main.ts`: creates `Engine` on `#app`, adds a placeholder ground plane + one test cube, starts. (Later tasks replace with `Game`.)

- [ ] **Step 1:** Scaffold with vite latest; `npm i three@latest`; `npm i -D @types/three@latest vitest@latest`. Add scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- [ ] **Step 2: Write failing test** `tests/events.test.ts`: `on` handler receives emitted payload; unsubscribe function stops further calls; emitting with no listeners does not throw.
- [ ] **Step 3:** Run `npx vitest run` → FAIL (module missing).
- [ ] **Step 4:** Implement `events.ts`, `palette.ts`, `Engine.ts`, `main.ts`, minimal `style.css` (body margin 0, black bg, canvas fills viewport), `index.html` (title "Deepavali — Gaon ka Aangan", fonts links, `<div id="app">`, `<div id="ui">`).
- [ ] **Step 5:** `npx vitest run` PASS, `npx tsc --noEmit` clean, `npx vite build` succeeds.
- [ ] **Step 6:** Commit `chore: scaffold vite three.js project with render engine`.

### Task 2: Input, collision, first-person controller

**Files:**
- Create: `src/core/Input.ts`, `src/core/Collision.ts`, `src/player/FirstPersonController.ts`
- Test: `tests/collision.test.ts`

**Interfaces:**
- Produces:
  - `Collision.ts`: `export interface Box { minX: number; minZ: number; maxX: number; maxZ: number }`; `export class CollisionWorld { boxes: Box[]; addBox(b: Box): void; addCircle(x: number, z: number, r: number): void /* stored as square box */; resolve(x: number, z: number, radius: number): { x: number; z: number } }` — pushes a circle out of every overlapping box along the shortest axis (two iterations).
  - `Input.ts`: `export class Input { constructor(dom: HTMLElement); isDown(code: string): boolean; pressed(code: string): boolean /* true once per press, cleared by endFrame */; clicked(): boolean; wheel(): number /* -1,0,1 this frame */; mouseDelta(): { x: number; y: number }; get locked(): boolean; requestLock(): void; endFrame(): void }`. Uses `KeyboardEvent.code` ("KeyE", "KeyF", "KeyQ", "KeyG", "KeyM", "ShiftLeft", "Escape").
  - `FirstPersonController.ts`: `export class FirstPersonController implements Updatable { yaw: number; pitch: number; readonly position: THREE.Vector3; enabled: boolean; constructor(camera: THREE.PerspectiveCamera, input: Input, world: CollisionWorld); update(dt: number): void; forward(out: THREE.Vector3): THREE.Vector3 }`. Speed 3.2 m/s, Shift 1.4 m/s, radius 0.3, eye height 1.6, pitch clamp ±1.35 rad, mouse sensitivity 0.0022, subtle head-bob (amplitude 0.025 m at 1.9 Hz while moving). Movement only when `input.locked`.

- [ ] **Step 1: Failing tests** `tests/collision.test.ts`: (a) circle at (0,0) r 0.3 with box {-1,-1,1,1}… place circle at (1.1, 0) overlapping box {minX:-1,maxX:1,minZ:-1,maxZ:1} → resolved x ≈ 1.3, z = 0; (b) circle far from any box is unchanged; (c) circle overlapping two adjacent boxes ends outside both.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Tests PASS; wire controller into `main.ts` (click canvas → `requestLock`) and walk around placeholder scene via `npm run dev` sanity check (typecheck clean).
- [ ] **Step 5:** Commit `feat: add input, collision and first-person controller`.

### Task 3: Procedural textures, aangan and village house

**Files:**
- Create: `src/world/textures.ts`, `src/world/Aangan.ts`, `src/world/House.ts`
- Modify: `src/main.ts` (use real world instead of placeholder)

**Interfaces:**
- Consumes: `PALETTE`, `CollisionWorld`.
- Produces:
  - `textures.ts`: `export function makeTextures(): { plaster: THREE.CanvasTexture; earth: THREE.CanvasTexture; tiles: THREE.CanvasTexture; wood: THREE.CanvasTexture; rangoli: THREE.CanvasTexture }`. Each canvas 512² (rangoli 1024², transparent background), `colorSpace = SRGBColorSpace`, `wrapS/T = RepeatWrapping` (except rangoli). Plaster: lime-white top 60%, geru band bottom 40% with an irregular hand-painted edge, low-frequency blotches, hairline cracks. Earth: beaten-earth mottling, faint broom streaks. Tiles: overlapping curved khaprail rows in terracotta. Wood: grain lines. Rangoli: concentric radially-symmetric petals/dots in marigold, red, white, green, turmeric yellow (8-fold symmetry).
  - `Aangan.ts`: `export function buildAangan(scene: THREE.Scene, world: CollisionWorld, tex): { diyaSpots: THREE.Vector3[] }` — ground plane 60×60 (earth texture, repeat 12) with the courtyard; east/west/south walls 2.0 m high, 0.35 m thick, vertices slightly jittered (±3 cm) so walls aren't perfect; a 1.6 m gate opening centred on the south wall with two wooden gate leaves standing open; 6 wall niches (aale) per side wall. Returns positions for diyas: every 1.2 m along wall tops + each niche. Registers wall boxes in `world` (gate opening walkable but player is stopped at z 6.8 by a box across the opening outside so they stay in the aangan).
  - `House.ts`: `export function buildHouse(scene, world, tex): { doorPosition: THREE.Vector3; verandahLanternAnchor: THREE.Vector3; takhtPosition: THREE.Vector3; diyaSpots: THREE.Vector3[] }` — house body x ∈ [-9,9], z ∈ [-11,-8.6], walls 3.2 m; verandah slab 0.3 m high x ∈ [-6,6], z ∈ [-8.6,-7]; 6 wooden posts; sloped tile roof (front eave 2.6 m over verandah rising to 4.2 m) using `tiles` texture; double wooden door with brass ring handles, two small windows with wooden shutters (half-open, warm interior glow plane emissive `#ffb347` @0.6); marigold toran (string of small orange/yellow spheres, InstancedMesh, ~40) sagging across the door; shubh-labh lettering as a small canvas-text decal either side of door in geru red; rangoli decal (1.6 m) on the ground at the threshold. `takhtPosition` = (-3.5, 0.3, -7.8).
- [ ] **Step 1:** Implement textures, aangan, house. All materials `MeshStandardMaterial` with roughness 0.85–0.95, metalness 0 (brass 0.8/0.35).
- [ ] **Step 2:** Replace placeholder in `main.ts`; add temporary `HemisphereLight(PALETTE.moon, 0x2a1c10, 0.35)` so it's visible.
- [ ] **Step 3:** `npx tsc --noEmit`, `npx vitest run`, `npx vite build` all pass.
- [ ] **Step 4:** Commit `feat: build village aangan and house with procedural textures`.

### Task 4: Props, lighting and sky

**Files:**
- Create: `src/world/props.ts`, `src/world/Lighting.ts`, `src/world/Sky.ts`, `src/items/Diya.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
  - `Diya.ts`: `export class Diya implements Updatable { readonly object: THREE.Group; readonly flameWorldPos: THREE.Vector3; constructor(position: THREE.Vector3, opts?: { light?: boolean; scale?: number }); update(dt, t): void }` — clay bowl (lathe geometry, terracotta), wick, flame = two stacked emissive cone/teardrop sprites (additive, colour flame) that flicker in scale/intensity with layered sine + noise; when `light: true`, owns a `PointLight(PALETTE.flame, 1.6, 6, 2)` that flickers. Also `export class DiyaField implements Updatable` that renders many small decorative diyas as one `InstancedMesh` bowl + one `Points` flame set (flicker per-instance in shader or via attribute updates) — used for the ~100 wall diyas without 100 lights.
  - `props.ts`: `export function buildProps(scene, world, tex): { tulsiDiyaPos: THREE.Vector3; agarbattiStandPos: THREE.Vector3; charpaiThaaliPos: THREE.Vector3; takhtBoxes: { kind: CrackerKind; position: THREE.Vector3 }[] }`. Props: tulsi chaura at (0,0,0): 1.0 m square, 0.9 m high, plastered with geru panels and a painted motif, tulsi plant (cluster of small green leaf planes on thin stems) on top; main diya at its front ledge (0, 0.95, 0.55); agarbatti stand (small brass holder) beside it at (0.3, 0.95, 0.55). Charpai at (4.5, 0, 3.5) (wood frame + woven rope pattern texture drawn on canvas) — thaali rests on it (`charpaiThaaliPos` = (4.5, 0.48, 3.5)). Second charpai at (-6, 0, 2) for the elder. Takht (wooden low platform 2.0×0.9×0.45) at house `takhtPosition` with 10 open cardboard boxes in a row, each with a canvas label (cracker name in English + Devanagari, bold printed-box style like Sivakasi packaging but muted). Matkas (3, stacked by the house corner), brass lota, hand pump (nalka) at (7.5, 0, -5.5), neem tree at (-7.5, 0, 5.5) (trunk + clustered leaf billboard planes, dark green), akash kandil (star-shaped paper lantern, warm emissive) at verandah lantern anchor with its own PointLight(0xffa040, 1.2, 8). All props register colliders.
  - `Lighting.ts`: `export function buildLighting(scene): void` — `HemisphereLight(PALETTE.moon, 0x20140a, 0.28)`, `DirectionalLight(0x8fa3d0, 0.35)` from moon direction (no shadows).
  - `Sky.ts`: `export class Sky implements Updatable { constructor(scene: THREE.Scene, fx?: FxContext); update(dt, t) }` — big inverted sphere with gradient shader (horizon `#2a2440` warm-purple haze from distant fires → zenith `#05070f`), ~1500 stars (Points, tiny, twinkle), moon disc (low, partly hazy), horizon silhouettes: 12–16 neighbouring houses as dark boxes/roof prisms at 25–60 m with small warm diya dots (Points), a temple shikhara silhouette with a single lamp at 80 m north-east, flat dark fields. Distant fireworks: every 4–9 s a small burst (Points-based, own tiny pool, 60–120 particles, far away 60–120 m, 15–35 m high, palette gold/red/green/white) — independent of the main spark system. If `fx.audio` provided, schedule faint `farBoom` sound delayed by distance/343 s.
  - `CrackerKind` type is defined in Task 8's `src/crackers/catalog.ts`; in this task create that file with only the type and `CRACKER_ORDER: CrackerKind[] = ['phuljhadi','pencil','anar','chakri','rocket','laxmi','sutli','ladi','saanp','skyshot']` plus `CRACKERS` metadata: `Record<CrackerKind, { label: string; hindi: string; handheld: boolean; fuse: number; tint: number }>` with labels/fuse from the spec table (phuljhadi 0, pencil 0, anar 2.5, chakri 2, rocket 2, laxmi 2.5, sutli 4, ladi 2, saanp 1.5, skyshot 3); hindi: फुलझड़ी, पेंसिल, अनार, चकरी, रॉकेट, लक्ष्मी बम, सुतली बम, लड़ी, साँप गोली, स्काई शॉट.
- [ ] **Step 1:** Implement; place ~100 decorative diyas via `DiyaField` on returned `diyaSpots`; 6 real lit `Diya`s (tulsi + 2 at door + 3 spread on wall niches) — max 8 real point lights total including lantern.
- [ ] **Step 2:** typecheck + tests + build pass; visually confirm with `npm run dev` that the scene reads as warm night, not flat or neon.
- [ ] **Step 3:** Commit `feat: add village props, diyas, lighting and night sky`.

### Task 5: FX systems

**Files:**
- Create: `src/fx/SparkSystem.ts`, `src/fx/SparkPool.ts`, `src/fx/SmokeSystem.ts`, `src/fx/FlashLights.ts`, `src/fx/CameraShake.ts`, `src/fx/FxContext.ts`
- Test: `tests/sparkpool.test.ts`

**Interfaces:**
- Produces:
  - `SparkPool.ts` (pure, no three): `export class SparkPool { readonly capacity: number; constructor(capacity: number); alloc(): number /* index; when full returns the oldest index (ring) */; release(i: number): void; get alive(): number }`.
  - `SparkSystem.ts`: `export interface EmitOptions { position: THREE.Vector3; direction?: THREE.Vector3 /* default up */; speed: number | [number, number]; spread: number /* cone half-angle rad, Math.PI = sphere */; count: number; colors: number[]; life: [number, number]; size: number | [number, number]; gravity?: number /* default 9.8 */; drag?: number /* default 0.6 */; crackle?: boolean /* random brightness flicker */ }`; `export class SparkSystem implements Updatable { constructor(scene: THREE.Scene, capacity = 24000); emit(o: EmitOptions): void; update(dt, t): void }`. Single `THREE.Points` with custom `ShaderMaterial` (additive, depthWrite false, size attenuation, colour fading from white-hot to colour to dark over life, soft round sprite computed in fragment shader). Particles collide with ground (y=0): bounce 0.25 and lose speed.
  - `SmokeSystem.ts`: `export class SmokeSystem implements Updatable { constructor(scene, capacity = 1500); puff(position: THREE.Vector3, o?: { count?: number; size?: number; life?: number; rise?: number; color?: number }): void; update(dt, t) }` — normal blending, soft noisy canvas sprite, grows and fades, drifts with a slight wind (+x 0.25 m/s).
  - `FlashLights.ts`: `export class FlashLights implements Updatable { constructor(scene, count = 4); flash(position: THREE.Vector3, color: number, intensity: number, distance: number, duration: number): void; update(dt) }` — pooled PointLights, intensity decays quadratically; least-recently-used reused.
  - `CameraShake.ts`: `export class CameraShake { add(trauma: number): void /* 0..1, clamped */; apply(camera: THREE.Camera, dt: number, t: number): void }` — trauma² scaled rotational noise (max 0.06 rad), decays at 1.4/s. Must be applied after controller sets rotation.
  - `FxContext.ts`: `export interface FxContext { scene: THREE.Scene; camera: THREE.PerspectiveCamera; sparks: SparkSystem; smoke: SmokeSystem; flashes: FlashLights; shake: CameraShake; audio: AudioEngine }` (AudioEngine type from Task 6 — create the import after Task 6, use `import type`; in this task define it with `audio: import('../audio/AudioEngine').AudioEngine` once Task 6 lands. To keep this task compilable, create `src/audio/AudioEngine.ts` stub exporting `class AudioEngine { init(): void {} play(): void {} }` which Task 6 replaces.)
- [ ] **Step 1: Failing tests** `tests/sparkpool.test.ts`: alloc returns distinct indices until capacity; `alive` equals allocations minus releases; when full, alloc still returns a valid index (< capacity) and `alive` stays == capacity; released index is reused.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement all files. **Step 4:** PASS + typecheck + build. Add a debug key `KeyB` in `main.ts` that emits a test fountain at the tulsi (remove in Task 10).
- [ ] **Step 5:** Commit `feat: add pooled spark, smoke, flash and camera shake systems`.

### Task 6: Procedural audio

**Files:**
- Replace: `src/audio/AudioEngine.ts`; Create: `src/audio/recipes.ts`, `src/audio/Ambience.ts`
- Test: `tests/audio.test.ts`

**Interfaces:**
- Produces:
  - `export type SoundName = 'fuse' | 'fizz' | 'hiss' | 'roar' | 'whistle' | 'whoosh' | 'boomBig' | 'crack' | 'pop' | 'popSmall' | 'sizzle' | 'thump' | 'farBoom' | 'ignite' | 'pickup' | 'place' | 'earRing'`
  - `export interface SoundHandle { stop(fadeSec?: number): void; setPosition(p: THREE.Vector3): void; setParam?(v: number): void }`
  - `export class AudioEngine { get ready(): boolean; init(): void /* creates AudioContext on user gesture, master gain 0.8 → DynamicsCompressor → destination; idempotent */; play(name: SoundName, position?: THREE.Vector3, opts?: { volume?: number; duration?: number; pitch?: number }): SoundHandle /* returns a no-op handle when not ready */; updateListener(camera: THREE.Camera): void; setMuted(m: boolean): void; get muted(): boolean; startAmbience(): void }`
  - Recipes (in `recipes.ts`, each `(ctx: AudioContext, out: AudioNode, o) => SoundHandle`), built from a shared 2 s white-noise buffer + oscillators: `boomBig` = low sine thump 55→30 Hz + lowpassed noise burst 0.9 s + delayed (0.35 s) quieter lowpassed copy as echo; `crack` = 40 ms bandpassed (2.5 kHz) noise, sharp attack; `pop`/`popSmall` = shorter, higher; `fizz`/`hiss` = looping bandpassed noise with random gain flutter (crackle) until stopped or `duration`; `roar` = noise through lowpass whose frequency ramps 400→2200 Hz over duration; `whistle` = sine 1800→900 Hz glide with vibrato; `whoosh` = noise through bandpass sweeping 300→3000 Hz, 1.2 s; `thump` = 80 ms low sine; `fuse` = sizzling highpassed noise with fast random gain; `ignite` = short soft fsss; `pickup`/`place` = soft wooden/paper tick (filtered noise 30 ms); `earRing` = 4 kHz sine fading over 2.5 s at low volume; `farBoom` = heavily lowpassed (300 Hz) quiet boom.
  - Positional sounds go through a `PannerNode` (HRTF, refDistance 2, rolloff 1.2).
  - `Ambience.ts`: `export function startAmbience(ctx, out): void` — crickets (several high sine chirp pulses with random timing, very quiet), distant crackle bed (lowpassed popSmall bursts at random 0.1–1.5 s gaps, gain 0.05), far booms every 6–15 s, temple bell (inharmonic partials 520/1340/2210 Hz decaying 4 s) every 40–70 s, a dog bark-like filtered noise rarely (every 60–120 s).
- [ ] **Step 1: Failing test** `tests/audio.test.ts` (jsdom not needed; AudioContext absent in node): `new AudioEngine().play('boomBig')` before `init` returns a handle whose `stop()` does not throw; `ready` is false; `setMuted(true)` then `muted` is true.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + typecheck + build; in `main.ts`, `init()` + `startAmbience()` on first canvas click; `updateListener` each frame; debug key `KeyB` also plays `roar` at the tulsi.
- [ ] **Step 5:** Commit `feat: add procedural Web Audio engine and village ambience`.

### Task 7: Thaali, agarbatti, hands, interaction & hints

**Files:**
- Create: `src/items/ThaaliInventory.ts`, `src/items/Thaali.ts`, `src/items/Agarbatti.ts`, `src/player/Hands.ts`, `src/player/Interaction.ts`, `src/player/PlayerState.ts`, `src/items/crackerModels.ts`
- Test: `tests/thaali.test.ts`, `tests/interaction.test.ts`, `tests/hints.test.ts`

**Interfaces:**
- Consumes: `CrackerKind`, `CRACKERS`, `CRACKER_ORDER` (catalog), `FxContext`.
- Produces:
  - `ThaaliInventory`: `export class ThaaliInventory { static readonly CAPACITY = 10; readonly items: CrackerKind[]; selected: number; add(kind: CrackerKind): boolean; get full(): boolean; get selectedKind(): CrackerKind | null; cycle(dir: 1 | -1): void /* wraps */; takeSelected(): CrackerKind | null /* removes, keeps selected index in range */ }`.
  - `crackerModels.ts`: `export function makeCrackerModel(kind: CrackerKind): THREE.Group` — small, recognisable models with canvas labels: phuljhadi (thin grey-coated wire 30 cm, bare handle end), pencil (thick coloured paper stick 18 cm), anar (cone 10 cm on a clay base, label wrap), chakri (flat coiled ring 7 cm, paper wound), rocket (tube + long thin bamboo stick; ground version sits in a green glass bottle), laxmi (fat red paper cylinder with picture-style label), sutli (ball wrapped in visible twine — torus-knot-ish wrapping lines texture), ladi (line of ~20 tiny red tubes on a braided fuse, laid as a gentle curve 1.2 m), saanp (black tablet disc 2 cm on a tiny paper), skyshot (cube box 15 cm with tube holes on top). Each model has a child `Object3D` named `"fuse"` at its fuse tip.
  - `Thaali.ts`: `export class Thaali { readonly inventory: ThaaliInventory; readonly object: THREE.Group; /* brass plate: lathe, brass material, a red cloth circle, a small diya decal */ location: 'charpai' | 'hand' | 'ground'; refresh(): void /* lays out up to 10 small cracker models on the plate in a ring, selected one raised slightly */; placeAt(position: THREE.Vector3): void }`.
  - `Agarbatti.ts`: `export class Agarbatti implements Updatable { readonly object: THREE.Group /* thin dark brown stick 25 cm with lighter bamboo end */; lit: boolean; readonly tipWorld: THREE.Vector3; constructor(fx: FxContext); light(): void; update(dt, t) /* when lit: tip ember emissive orange pulsing, tiny ember sparks occasionally, thin rising smoke wisp via fx.smoke every 0.25 s (small, light grey) */ }`.
  - `Hands.ts`: `export class Hands implements Updatable { readonly right: THREE.Group; readonly left: THREE.Group; constructor(camera: THREE.PerspectiveCamera); holdRight(obj: THREE.Object3D | null): void; holdLeft(obj: THREE.Object3D | null): void; poke(): void /* right-hand forward jab animation 0.25 s for lighting */; sway(mouseDx: number, mouseDy: number): void; update(dt, t) }` — stylised hands: low-poly forearm sleeve (kurta cloth colour `#d8c7a3`), palm and fingers as rounded boxes, skin `#a9714b`; right at camera-local (0.28, -0.3, -0.5), left at (-0.3, -0.34, -0.48) holding the thaali flat. Hands are children of the camera; camera must be added to the scene. Idle breathing bob, walk bob follows controller, sway lags mouse.
  - `PlayerState.ts`: `export interface PlayerState { thaali: 'charpai' | 'hand' | 'ground'; hasAgarbatti: boolean; agarbattiLit: boolean; leftHand: 'thaali' | 'cracker' | 'empty'; thaaliCount: number; placedUnlit: number; burstCount: number }`; `export function nextHint(s: PlayerState): string` — onboarding hint shown when nothing is focused, in this priority: thaali on charpai → "Your thaali is on the charpai — go pick it up"; thaaliCount 0 and thaali in hand → "Fill your thaali at the takht by the verandah"; !hasAgarbatti → "Take the agarbatti from the tulsi chaura"; !agarbattiLit → "Light the agarbatti at the diya first"; placedUnlit > 0 → "Touch the agarbatti to the fuse — click"; thaaliCount > 0 → "Q / scroll to choose · F to place it on the ground"; else → "Shubh Deepavali — the takht has more".
  - `Interaction.ts`: `export interface Interactable { id: string; position: THREE.Vector3; radius: number; label(s: PlayerState): string | null /* null = not available now */; act(): void }`; `export function pickInteractable(eye: THREE.Vector3, dir: THREE.Vector3, list: Interactable[], maxDist = 2.4, maxAngleDeg = 28): Interactable | null` — among items within `maxDist + radius`, choose the smallest angle under `maxAngleDeg`; ties → nearest.
- [ ] **Step 1: Failing tests**
  - `tests/thaali.test.ts`: adding 10 succeeds, 11th returns false and `full` is true; `cycle(1)` from last wraps to 0; `cycle(-1)` from 0 wraps to last; `takeSelected` on ['anar','rocket'] with selected 1 returns 'rocket' and selected becomes 0; `takeSelected` on empty returns null.
  - `tests/interaction.test.ts`: eye (0,1.6,0) dir (0,0,-1): target A at (0,1.6,-1.5) picked over B at (1.5,1.6,-1.5); target at (0,1.6,-5) (beyond range) → null; target behind (0,1.6,2) → null; two targets on the same ray → nearer wins.
  - `tests/hints.test.ts`: one assertion per hint branch above, including `agarbattiLit=false, hasAgarbatti=true, thaali='hand', thaaliCount=2` → "Light the agarbatti at the diya first".
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + typecheck + build.
- [ ] **Step 5:** Commit `feat: add thaali, agarbatti, visible hands and interaction picking`.

### Task 8: Cracker core and ground crackers (anar, chakri, laxmi, sutli, saanp)

**Files:**
- Create: `src/crackers/FuseTimer.ts`, `src/crackers/Cracker.ts`, `src/crackers/placement.ts`, `src/crackers/Anar.ts`, `src/crackers/Chakri.ts`, `src/crackers/Bomb.ts` (laxmi + sutli, parameterised), `src/crackers/SaanpGoli.ts`, `src/crackers/CrackerManager.ts`, `src/crackers/factory.ts`
- Test: `tests/fuse.test.ts`, `tests/placement.test.ts`

**Interfaces:**
- Produces:
  - `FuseTimer` (pure): `export type CrackerPhase = 'idle' | 'fusing' | 'active' | 'done'`; `export class FuseTimer { phase: CrackerPhase; constructor(fuseSeconds: number); light(): boolean /* only from idle; fuse 0 → straight to active */; tick(dt: number): CrackerPhase /* fusing → active when elapsed ≥ fuse */; finish(): void /* active → done */; get fuseProgress(): number /* 0..1 */ }`.
  - `placement.ts`: `export function clampPlacement(x: number, z: number): { x: number; z: number }` — clamp to [-8.6, 8.6] × [-6.6, 6.6]; `export function placementPoint(eye: THREE.Vector3, forward: THREE.Vector3): THREE.Vector3` — 1.2 m ahead on the ground (y 0), clamped.
  - `Cracker.ts`: `export abstract class Cracker implements Updatable { readonly kind: CrackerKind; readonly object: THREE.Group; readonly timer: FuseTimer; age: number /* seconds since done, for cleanup */; constructor(kind: CrackerKind, fx: FxContext, model: THREE.Group); fuseWorld(out: THREE.Vector3): THREE.Vector3; light(): boolean /* plays 'fuse' sound looping during fusing + small fuse sparks every frame */; update(dt, t): void /* drives timer; on enter active calls onIgnite(); while active calls onActive(dt,t) and when it returns true → finish(), emits events.burst once via protected burst(power) where appropriate */; protected abstract onIgnite(): void; protected abstract onActive(dt: number, t: number): boolean; protected burst(power: number): void; dispose(): void }`.
  - Ground crackers behaviour (use spec table values):
    - `Anar`: 9 s; spark fountain from nozzle, emit rate ramps 0→900/s over 2 s, speed 6–9 m/s, spread 0.22 rad, colours gold `0xffc860`/silver `0xfff4e0`, crackle; flash light continuous (re-trigger 0.15 s) intensity 4 distance 10; sound 'roar' with duration 9; light smoke; burst(0.4) at start.
    - `Chakri`: 6 s; spins (angular speed ramps to 40 rad/s) and wanders (random walk 0.4 m/s, clamped by `clampPlacement`), emits tangential sparks from rim (colour green `0x8cff8c` + gold), 'whistle' + 'fizz'.
    - `Bomb` (`variant: 'laxmi' | 'sutli'`): instant; laxmi: flash (0xfff0d0, 12, 12, 0.18), 'crack', 200 sparks sphere short life, paper bits (dark red, 60 sparks, gravity 3, drag 2), smoke puff, shake 0.35, burst(0.5); sutli: flash (16, 18, 0.3), 'boomBig', dust ring (smoke radial), 400 sparks, shake 0.8, burst(1.0); if player within 2.5 m → extra shake 0.4 + 'earRing'. Model hidden after explosion.
    - `SaanpGoli`: 7 s; a black snake grows as a `TubeGeometry` along a curling 3D curve (grow by rebuilding tube every 0.1 s, max 0.8 m length, wiggle), dark grey smoke heavy, 'sizzle'.
  - `CrackerManager`: `export class CrackerManager implements Updatable { readonly list: Cracker[]; constructor(scene: THREE.Scene); add(c: Cracker): void; nearestUnlit(point: THREE.Vector3, maxDist = 0.6): Cracker | null /* by fuse tip distance */; get unlitCount(): number; update(dt, t) /* removes done crackers after 12 s */ }`.
  - `factory.ts`: `export function createCracker(kind: CrackerKind, fx: FxContext, position: THREE.Vector3, yaw: number): Cracker` — throws for kinds not yet implemented until Task 9 adds them.
- [ ] **Step 1: Failing tests** `tests/fuse.test.ts`: fuse 2.5 → light() true; tick(1) → 'fusing'; tick(1.6) → 'active'; second light() returns false; fuse 0 → light() → phase 'active' immediately; `fuseProgress` 0.4 after 1 s of 2.5. `tests/placement.test.ts`: clampPlacement(20, -20) → {x: 8.6, z: -6.6}; inside point unchanged; placementPoint from (0,1.6,6) facing (0,0,1) → z clamped to 6.6, y 0.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + typecheck + build.
- [ ] **Step 5:** Commit `feat: add cracker core with anar, chakri, bombs and saanp goli`.

### Task 9: Rocket, sky shot, ladi and hand-held crackers

**Files:**
- Create: `src/crackers/Rocket.ts`, `src/crackers/SkyShot.ts`, `src/crackers/Ladi.ts`, `src/crackers/HandHeld.ts` (phuljhadi + pencil, parameterised), `src/fx/aerialBurst.ts`
- Modify: `src/crackers/factory.ts`

**Interfaces:**
- Produces:
  - `aerialBurst.ts`: `export function aerialBurst(fx: FxContext, position: THREE.Vector3, style: 'peony' | 'willow' | 'crackle' | 'ring', palette: number[]): void` — peony: 350 sparks sphere speed 14–18, life 1.4–2.0, gravity 4, drag 1.2; willow: gold, long life 2.8–3.6, high drag 2.2, gravity 2.5; crackle: 250 sparks + delayed (0.6 s, via setTimeout-free internal timer queue in the module ticked by `aerialBurstTick(dt)`) popSmall + white glitter; ring: 160 sparks in a flat ring oriented randomly. Plays 'pop' at position (heard after distance/343 s delay) and flashes light (distance 40). `export function aerialBurstTick(dt: number): void`.
  - `Rocket`: on ignite, detaches from bottle and flies up along slightly random tilted path, accelerating to 35 m/s, smoke + spark trail, 'whoosh'; at 1.6 s or 40 m → `aerialBurst` with random style/palette, `burst(0.7)`.
  - `SkyShot`: 12 shots at 0.55 s intervals: each emits a launch thump with short upward trail, bursting at 25–32 m, alternating palettes red/green/gold/blue-violet (muted, not neon: `0xff5a3c`, `0x7bdc6e`, `0xffc24a`, `0x9a8cff`).
  - `Ladi`: 60 pops along the laid curve from the lit end at 18 pops/s; each pop: 'popSmall' (every 2nd plays to save voices), 25 sparks, tiny flash every 6th, red paper bits; mesh segments hidden as they pop; shake 0.05 per pop near player; burst(0.6) at start.
  - `HandHeld` (`variant: 'phuljhadi' | 'pencil'`): `attach(hand: THREE.Object3D)`; burns 20 s / 12 s; phuljhadi emits from a burn point that moves down the wire (100% → 15% length) — 500/s small gold crackly sparks speed 2–4 sphere, life 0.25–0.6, gravity 6, brightness flicker; pencil emits a 600/s green/red (alternating every 3 s) jet forward from tip speed 3–5 spread 0.35; 'fizz'/'hiss' looping, `setPosition` each frame; flash light low intensity follows tip. Emits `events.burst({ power: 0.2 })` on start. On done: fires `onBurnOut` callback.
  - `factory.ts` handles all 10 kinds.
- [ ] **Step 1:** Implement. **Step 2:** typecheck + vitest + build pass. **Step 3:** Commit `feat: add rockets, sky shots, ladi and hand-held sparklers`.

### Task 10: Game wiring, UI and Diwali experience

**Files:**
- Create: `src/Game.ts`, `src/ui/ui.css`, `src/ui/Intro.ts`, `src/ui/Prompt.ts`, `src/ui/ThaaliStrip.ts`, `src/ui/Pause.ts`, `src/ui/Finale.ts`, `src/ui/Toast.ts`
- Modify: `src/main.ts` (just `new Game(document.getElementById('app')!, document.getElementById('ui')!).start()`), remove debug keys.

**Interfaces:**
- Consumes: everything above.
- Produces: `export class Game { constructor(appEl: HTMLElement, uiEl: HTMLElement); start(): void }`.
- Behaviour (spec "Core loop" + "Emotional UX"):
  - Interactables: charpai thaali ("E — Pick up the thaali (plate)"), thaali on ground ("E — Pick up your thaali"), 10 takht boxes ("E — Put a {label} on the thaali" / "The thaali is full" / null if thaali not in hand → label "Pick up your thaali first"), agarbatti stand ("E — Take the agarbatti"), tulsi diya ("E — Light the agarbatti at the diya" when held & unlit).
  - Keys: E act on focused; F place selected (handheld → into left hand, thaali placed at feet, `Toast`: "Thaali set down beside you"); Q / wheel cycle; G toggle thaali hand/ground; click: if handheld unlit in left hand and agarbatti lit → light it; else if agarbatti lit and `crackerManager.nearestUnlit(agarbatti.tipWorld, 0.6)` (also accept: nearest unlit within 1.6 m of player in look direction — so the player needn't crouch) → `hands.poke()` then light it and show "Step back!" prompt for 2 s; M mute; Esc handled by pointer-lock loss → Pause.
  - Prompt priority: focused interactable label → nextHint(state).
  - `Intro`: full-screen dark layer; after 0.8 s fades in Hindi line (Tiro Devanagari, 40px) "दीपावली की रात। घर आ गए हो।" then English subtitle "Diwali night. You're home." (Cormorant italic, 22px), then a quiet small line "click to step inside" (Inter 13px, letter-spaced). On click: `audio.init()`, ambience, request pointer lock, fade out over 2.5 s while camera eases 1 m forward through the gate.
  - `Prompt`: bottom-centre chip; keycap rendering for leading "E —", "F", "Q", "Click" tokens; crossfade on change.
  - `ThaaliStrip`: bottom-right, up to 10 small labelled slots (Devanagari name above English, 11px), selected slot gold outline; hidden when thaali not in hand.
  - `Toast`: small text top-centre, 2.2 s.
  - `Pause`: on pointer-lock loss after intro: dim overlay, small panel bottom-left: "Resume", "Sound: On/Off", controls list. Click Resume → lock.
  - `Finale`: when `burstCount` reaches 10 (counted via `events.burst` with power ≥ 0.4 or any handheld finish), triggers a 20 s neighbour sky-show (aerial bursts every 0.35–0.8 s at 50–90 m away, 30–45 m high) and shows "शुभ दीपावली" (Tiro, 64px, ui-gold) + "Shubh Deepavali" (Cormorant 26px) fading in at centre-top, out after 7 s. Fires once per session.
  - Villagers cheer hook: `events.burst` (used by Task 11).
- [ ] **Step 1:** Implement. **Step 2:** typecheck + vitest + build pass. **Step 3:** Manually play the full loop in `npm run dev`. **Step 4:** Commit `feat: wire gameplay loop with Diwali intro, prompts, thaali strip and finale`.

### Task 11: Villagers

**Files:**
- Create: `src/people/Villager.ts`, `src/people/villagers.ts`
- Modify: `src/Game.ts`

**Interfaces:**
- Produces: `export class Villager implements Updatable { readonly object: THREE.Group; constructor(o: { height: number; clothes: number; dupatta?: number; pose: 'stand' | 'sit' | 'walkLoop'; loopCenter?: THREE.Vector3; loopRadius?: number; sparkler?: boolean }, fx: FxContext); cheer(): void; update(dt, t) }`; `export function spawnVillagers(scene, fx, game: Game | { add(u: Updatable): void }): Villager[]`.
- Stylised figures: capsule torso, sphere head (no face), simple cylinder limbs, clothes as flat muted colours (kurta off-white, saree deep maroon with gold border band, kids in mustard/teal-dark). Six people: two kids (1.1–1.2 m) walking small loops (radius 1.5 m) around (−3, 0, 2) and (3, 0, −2) holding lit sparklers (use `fx.sparks` small emission, no sound), an elder sitting on the second charpai, a woman standing in the doorway, a man near the gate, a girl near the rangoli. `cheer()`: arms up + 0.15 m hop over 0.6 s. Kids' loops avoid player (pause when player within 1 m). Colliders: circle 0.3 for static ones.
- [ ] **Step 1:** Implement; `Game` calls `cheer()` on all within 15 m on `events.burst` with power ≥ 0.5 (random 0–0.3 s delay each).
- [ ] **Step 2:** typecheck + vitest + build. **Step 3:** Commit `feat: add villagers who celebrate around the aangan`.

### Task 12: Browser QA, screenshots and polish

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `README.md`
- Add debug hook in `Game`: when URL has `?debug`, expose `window.__diwali = { place(kind), lightAll(), teleport(x,z,yaw), state() }` for automated tests only.

- [ ] **Step 1:** `npm i -D @playwright/test@latest`; `npx playwright install chromium`. Config: webServer `npm run dev -- --port 5199`, chromium, use `--use-gl=angle` / `--enable-unsafe-swiftshader` args for headless WebGL.
- [ ] **Step 2: Test** `smoke.spec.ts`: no console errors on load; click intro → intro hidden after 3 s; canvas pixel check: screenshot not mostly black (mean luminance > 0.06); with `?debug`, place anar + sutli + rocket, `lightAll()`, wait 4 s, screenshot `screenshots/burst.png`; another screenshot `screenshots/aangan.png` from start view; `state().burstCount ≥ 1`.
- [ ] **Step 3:** Run `npx playwright test` → PASS. Inspect screenshots against the anti-goals checklist; fix anything flat, over-saturated or neon.
- [ ] **Step 4:** README: what it is, controls table, crackers table, `npm i && npm run dev`, tech notes.
- [ ] **Step 5:** Commit `test: add playwright smoke test, screenshots and README`.
