// The game: builds the village, the player, the cracker systems and the Diwali UI, then runs one per-frame loop that
// reads keys and clicks, handles the cracker inventory and the sparklers, schedules far-off bangs and runs the finale.
// main.ts only constructs this class and calls start().
import './style.css';
import './ui/ui.css';
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { CollisionWorld } from './core/Collision';
import { events } from './core/events';
import { FirstPersonController } from './player/FirstPersonController';
import { Hands } from './player/Hands';
import { pickAimed, type AimHit, type Interactable } from './player/Interaction';
import { contextPrompt, type PlayerState } from './player/PlayerState';
import { makeTextures } from './world/textures';
import { buildAangan } from './world/Aangan';
import { buildHouse } from './world/House';
import { buildProps, extraDiyaSpots, type PropsResult } from './world/props';
import { buildLighting } from './world/Lighting';
import { Sky } from './world/Sky';
import { Festoons } from './world/Festoons';
import { Village, villageBounds } from './world/Village';
import { Hills } from './world/Hills';
import { Kandils, verandahKandilSpots, wallKandilSpots } from './world/Kandils';
import { POST_X } from './world/House';
import { Diya, DiyaField } from './items/Diya';
import { Inventory, slotIndexForKey } from './items/Inventory';
import { Agarbatti } from './items/Agarbatti';
import { SparkSystem } from './fx/SparkSystem';
import { SmokeSystem } from './fx/SmokeSystem';
import { FlashLights } from './fx/FlashLights';
import { CameraShake } from './fx/CameraShake';
import type { FxContext } from './fx/FxContext';
import { aerialBurstTick, drainQueue, type BurstStyle } from './fx/aerialBurst';
import { launchShell, neighbourShowTick, pickBurstStyle, pickLanePoint, pickNeighbourPalette, startFountain } from './fx/neighbourShow';
import { AudioEngine } from './audio/AudioEngine';
import { CrackerManager } from './crackers/CrackerManager';
import { addPickProxy } from './crackers/pickProxy';
import { createCracker } from './crackers/factory';
import { HandHeld } from './crackers/HandHeld';
import { CRACKERS, type CrackerKind } from './crackers/catalog';
import { AIM_MAX, placementFor, placementPoint, setPlacementArea } from './crackers/placement';
import { Intro } from './ui/Intro';
import { ControlsLegend } from './ui/Controls';
import { Prompt, parsePrompt } from './ui/Prompt';
import { Hotbar } from './ui/Hotbar';
import { Crosshair } from './ui/Crosshair';
import { Highlighter } from './ui/Highlight';
import { Pause } from './ui/Pause';
import { Finale, FinaleCounter, countsTowardFinale } from './ui/Finale';
import { Toast } from './ui/Toast';
import { DroneBanner } from './ui/DroneBanner';
import { DroneShow } from './features/DroneShow';
import { DiyaRow, DIYA_COUNT } from './features/DiyaRow';
import { SkyLanterns, heldLanternSpot } from './features/SkyLantern';
import { PhotoMode } from './ui/PhotoMode';
import { debugRequested, installDebugHook } from './debugHook';

/** Niche indices (into the aangan diya spots) that hold a real lit lamp instead of a decorative one. */
const LIT_NICHES = [2, 9];
/**
 * Game seconds the debug sky show is fast-forwarded: past the longest rocket climb (1.3 s) and into the first second of
 * the bursts, so the sparks have spread into rings and fans rather than a single flash.
 */
const DEBUG_SKY_LEAD_SECONDS = 2.1;
/** Seconds the intro card takes to fade out, during which the player walks through the gate. */
const INTRO_SECONDS = 2.5;
/** Metres the player walks forward through the gate after the intro is dismissed. */
const INTRO_WALK_METRES = 1;
/** Collision radius of the player; matches FirstPersonController so the gate walk stops at the same walls. */
const PLAYER_RADIUS = 0.3;
/** The keys that pick a hotbar slot directly, in slot order: Digit1 to Digit9, then Digit0. */
const HOTBAR_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
/** Crackers the player starts with, so play begins at once: a few of each common kind. */
const STARTER_PACK: [CrackerKind, number][] = [
  ['phuljhadi', 5],
  ['anar', 3],
  ['chakri', 2],
  ['rocket', 2],
];
/** Direction the night breeze carries sky lanterns, in radians on the ground plane (x toward z), and its random spread. */
const LANTERN_BREEZE_HEADING = -1.0;
const LANTERN_BREEZE_SPREAD = 0.6;
/** Seconds the "Step back!" prompt stays after a cracker is lit on the ground. */
const STEP_BACK_SECONDS = 2;
/** Radius, in metres, around the agarbatti tip within which a ground fuse can be lit. */
const TIP_REACH = 0.6;
/** Metres ahead of the player at which the debug hook places a cracker, so it is in view from a tilted camera. */
const DEBUG_PLACE_REACH = 3;
/** Seconds the neighbours' sky-show lasts after the finale starts. */
const FINALE_SECONDS = 20;
/** Shortest gap between neighbour bursts during the finale, in seconds. */
const FINALE_GAP_MIN = 0.35;
/** Extra random gap added to FINALE_GAP_MIN, in seconds. */
const FINALE_GAP_RANGE = 0.45;
/** Nearest distance from the village at which a neighbour's burst appears, in metres. */
const FINALE_NEAR = 50;
/** Extra random distance added to FINALE_NEAR, in metres. */
const FINALE_SPREAD = 40;
/** Lowest height of a neighbour's burst, in metres. */
const FINALE_HEIGHT_MIN = 45;
/** Extra random height added to FINALE_HEIGHT_MIN, in metres. */
const FINALE_HEIGHT_RANGE = 25;
/** Seconds between the lane fountains the neighbours light during the finale, as a base and a random extra. */
const FOUNTAIN_GAP_MIN = 1.2;
const FOUNTAIN_GAP_RANGE = 1.5;
const TAU = Math.PI * 2;
/** Shared zero vector used as the spawn point for hand-held sparklers, which are attached to the hand at once. */
const ORIGIN = new THREE.Vector3();

/** A far-off bang waiting for its sound's travel time before it plays. */
interface FarBang {
  /** Seconds until the bang is heard. */
  remaining: number;
  /** Where the bang happened. */
  pos: THREE.Vector3;
}

/**
 * The whole game. The constructor builds the village and every system; start() begins the render loop. Clicking
 * the intro card starts the walk-in, after which keys, clicks and the pointer lock drive play.
 */
export class Game {
  private readonly engine: Engine;
  private readonly world: CollisionWorld;
  private readonly input: Input;
  private readonly player: FirstPersonController;
  private readonly hands: Hands;
  private readonly photo: PhotoMode;
  private readonly audio: AudioEngine;
  private readonly fx: FxContext;
  private readonly sky: Sky;
  private readonly crackers: CrackerManager;
  private readonly inventory: Inventory;
  private readonly agarbatti: Agarbatti;
  private readonly props: PropsResult;
  private readonly interactables: Interactable[] = [];
  /** Every object the crosshair can aim at, mapped to the interactable it stands for. */
  private readonly aimTargets = new WeakMap<THREE.Object3D, Interactable>();
  /** Scratch list of the objects the aim ray is cast against this frame. */
  private readonly aimRoots: THREE.Object3D[] = [];
  /** Scratch list of this frame's raycast hits, in the form pickAimed reads. */
  private readonly aimHits: AimHit[] = [];
  private readonly aimer = new THREE.Raycaster();
  private readonly aimCentre = new THREE.Vector2(0, 0);
  private readonly crosshair: Crosshair;
  private readonly highlighter = new Highlighter();
  private readonly state: PlayerState = {
    visitedStall: false,
    selectedName: '',
    selectedCount: 0,
    totalCount: 0,
    placedUnlit: 0,
    burstCount: 0,
    diyasLit: 0,
    selectedHindi: '',
    selectedHandheld: false,
    selectedLantern: false,
    heldName: '',
    heldUnlit: false,
  };
  private readonly farQueue: FarBang[] = [];
  private readonly finaleCounter = new FinaleCounter();
  private readonly intro: Intro;
  private readonly prompt: Prompt;
  /** Corner controls legend, open for the first minute then a toggleable H chip. */
  private readonly legend: ControlsLegend;
  private readonly pause: Pause;
  private readonly finale: Finale;
  private readonly toast: Toast;
  /** The row of unlit diyas the player lights with the agarbatti. */
  private readonly diyaRow: DiyaRow;
  /** Top-centre pill that counts the diyas, then the drone-show countdown, then LIVE. */
  private readonly droneBanner: DroneBanner;
  /** The drone show that lighting every diya unlocks. */
  private readonly droneShow = new DroneShow();
  /** Sky lanterns released with F, rising into the night. */
  private readonly lanterns = new SkyLanterns();
  private readonly hotbar: Hotbar;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  /** Scratch point where a sky lantern is held up before it is released. */
  private readonly lanternSpot = new THREE.Vector3();
  private readonly finaleAt = new THREE.Vector3();
  /** Scratch point for a lane fountain, and the seconds until the next one is lit. */
  private readonly fountainAt = new THREE.Vector3();
  private nextFountainIn = 0;
  /** Style and palette of the last neighbour burst, so the next one differs. */
  private lastStyle: BurstStyle | undefined;
  private lastPalette: number[] | undefined;
  /** Plays a far bang once its delay has passed; a field so the per-frame drain does not allocate a closure. */
  private readonly playFar = (e: FarBang): void => {
    this.audio.play('farBoom', e.pos);
  };
  /** The hand-held sparkler currently in the left hand, or null. */
  private leftHeld: HandHeld | null = null;
  /** The interactable under the crosshair this frame, or null. */
  private focus: Interactable | null = null;
  /** True once a pack has been taken from the stall; retires the first prompt. */
  private visitedStall = false;
  private started = false;
  private lockSeen = false;
  private paused = false;
  /** True while the walk through the gate runs after the intro is dismissed. */
  private introWalking = false;
  /** Seconds elapsed in the walk through the gate. */
  private introElapsed = 0;
  /** Horizontal direction of the gate walk, fixed when the intro is dismissed. */
  private readonly walkDir = new THREE.Vector3();
  /** Time (in engine seconds) until which the "Step back!" prompt is shown. */
  private stepBackUntil = -1;
  /** Engine time of the current frame, so aim-target actions can stamp timers without being passed it. */
  private clockTime = 0;
  /** Seconds left of the neighbours' sky-show; zero when no finale is running. */
  private finaleTime = 0;
  /** Seconds until the next neighbour burst during the finale. */
  private nextShowIn = 0;

  /** Builds the village, the systems and the UI inside the two containers; nothing runs until start(). */
  constructor(appEl: HTMLElement, uiEl: HTMLElement) {
    this.engine = new Engine(appEl);
    const scene = this.engine.scene;
    // The camera must be in the scene so the hands parented to it are drawn.
    scene.add(this.engine.camera);

    const world = new CollisionWorld();
    this.world = world;
    const tex = makeTextures();
    const aangan = buildAangan(scene, world, tex);
    const house = buildHouse(scene, world, tex);
    this.props = buildProps(scene, world, tex, house);

    buildLighting(scene);
    this.sky = new Sky(scene);
    this.engine.add(this.sky);
    this.engine.add(new Festoons(scene));
    // The neighbouring village beyond the low boundary wall: houses, lanes, lamps and eave lights.
    this.engine.add(new Village(scene, world));
    // Crackers may be set down anywhere in the walkable village, nudged clear of houses, walls and the kund.
    setPlacementArea(villageBounds(), (x, z, r) => world.resolve(x, z, r), undefined, (ax, az, bx, bz) => world.firstHit(ax, az, bx, bz));
    // Distant lit hills, temple and clouds ringing the horizon.
    this.engine.add(new Hills(scene));
    // Paper akash kandils hang under the verandah eave and glow through the bloom pass.
    this.engine.add(new Kandils(scene, [...verandahKandilSpots(POST_X), ...wallKandilSpots()]));

    // Five real lit lamps: the tulsi diya (decoration only now), two at the door and two in the aangan niches.
    const tulsi = new Diya(this.props.tulsiDiyaPos, { light: true });
    const litPositions: THREE.Vector3[] = [
      new THREE.Vector3(house.doorPosition.x - 1.25, 0.3, -8.2),
      new THREE.Vector3(house.doorPosition.x + 1.25, 0.3, -8.2),
      ...LIT_NICHES.map((i) => aangan.diyaSpots[i]),
    ];
    for (const d of [tulsi, ...litPositions.map((pos) => new Diya(pos, { light: true }))]) {
      scene.add(d.object);
      this.engine.add(d);
    }
    // Decorative lamps: every spot not taken by a lit lamp, batched into one field (about 100 lamps).
    const decorative = [
      ...aangan.diyaSpots.filter((_, i) => !LIT_NICHES.includes(i)),
      ...house.diyaSpots,
      ...extraDiyaSpots(),
    ];
    this.engine.add(new DiyaField(scene, decorative));

    this.input = new Input(this.engine.renderer.domElement);
    this.player = new FirstPersonController(this.engine.camera, this.input, world);
    this.engine.add(this.player);
    this.hands = new Hands(this.engine.camera);
    this.engine.add(this.hands);
    this.photo = new PhotoMode(this.engine, this.input, uiEl, [this.hands.right, this.hands.left]);

    // Shared effects that every cracker uses: pooled sparks, smoke, flash lights and camera shake.
    const shake = new CameraShake();
    this.audio = new AudioEngine();
    this.fx = {
      scene,
      camera: this.engine.camera,
      sparks: new SparkSystem(scene),
      smoke: new SmokeSystem(scene),
      flashes: new FlashLights(scene, 6),
      shake,
      audio: this.audio,
    };
    this.engine.add(this.fx.sparks);
    this.engine.add(this.fx.smoke);
    this.engine.add(this.fx.flashes);

    this.crackers = new CrackerManager(scene);
    this.engine.add(this.crackers);
    this.inventory = new Inventory();
    for (const [kind, n] of STARTER_PACK) this.inventory.add(kind, n);
    this.agarbatti = new Agarbatti(this.fx);
    this.engine.add(this.agarbatti);
    // The player starts with a lit agarbatti in the right hand, ready to touch to any fuse.
    this.hands.holdRight(this.agarbatti.object);
    this.agarbatti.light();

    // Sky bursts report their bangs here; the bang plays after the sound's travel time (see frame()).
    this.sky.onFarBurst = (pos, delaySec) => {
      this.farQueue.push({ remaining: delaySec, pos });
    };
    // Every counted burst feeds the finale; a burst's power decides whether it counts.
    events.on('burst', (p) => {
      if (countsTowardFinale(p.power)) this.countBurst();
    });

    this.toast = new Toast(uiEl);
    this.hotbar = new Hotbar(uiEl);
    this.prompt = new Prompt(uiEl);
    this.legend = new ControlsLegend(uiEl);
    this.crosshair = new Crosshair(uiEl);
    // Diya row: lit one by one with the agarbatti; the last one sets off a golden celebration and a greeting.
    this.droneBanner = new DroneBanner(uiEl);
    scene.add(this.droneShow.object);
    this.engine.add(this.droneShow);
    this.diyaRow = new DiyaRow(this.fx);
    scene.add(this.diyaRow.object);
    this.engine.add(this.diyaRow);
    scene.add(this.lanterns.object);
    this.engine.add(this.lanterns);
    // The drone show starts its countdown once the last diya is lit.
    this.diyaRow.onLit = (lit, total) => this.droneShow.notifyLit(lit, total);
    this.diyaRow.onComplete = () => this.toast.show('शुभ दीपावली · Shubh Deepavali', 6);
    this.finale = new Finale(uiEl);
    this.pause = new Pause(uiEl, {
      onResume: () => this.input.requestLock(),
      onToggleSound: () => this.toggleSound(),
      isSoundOn: () => !this.audio.muted,
    });
    // Added last so the opening card sits above everything else until it fades.
    this.intro = new Intro(uiEl, () => this.begin());

    this.buildInteractables();

    // Clicking the canvas after the intro captures the pointer again, so the view turns with the mouse.
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.started) this.input.requestLock();
    });

    this.engine.add({ update: (dt, t) => this.frame(dt, t) });
    // Registered after the controller so the shake offset lands on the rotation it just wrote.
    this.engine.add({ update: (dt, t) => shake.apply(this.engine.camera, dt, t) });
    // Keeps the listener on the camera after the shake offset is applied, so panning matches what is on screen.
    this.engine.add({
      update: () => this.audio.updateListener(this.engine.camera),
    });
    // Photo mode reads P and K before the input state is cleared.
    this.engine.add(this.photo);
    // Registered last so per-frame input state is cleared only after every system read it.
    this.engine.add({ update: () => this.input.endFrame() });

    // Automated tests only: with ?debug in the URL, the page exposes window.__diwali (see debugHook.ts).
    if (debugRequested(location.search)) {
      installDebugHook({
        place: (kind) => this.debugPlace(kind),
        lightAll: () => this.debugLightAll(),
        lightDiyas: (n) => this.debugLightDiyas(n),
        droneShow: () => this.droneShow.force(),
        droneState: () => this.droneShow.state,
        releaseLantern: () => this.releaseLantern(),
        teleport: (x, z, yaw, pitch) => this.debugTeleport(x, z, yaw, pitch),
        state: () => ({ ...this.state }),
        heldShot: () => this.debugHeldShot(),
        skyShow: (yaw) => this.debugSkyShow(yaw),
        advance: (seconds) => this.engine.advance(seconds),
        skyBursting: () => this.sky.burstingCount(),
        crackers: () => this.crackers.list.map((c) => ({ kind: c.kind, phase: c.timer.phase })),
        focusId: () => this.focus?.id ?? null,
        click: () => this.onClick(this.clockTime),
      });
    }
  }

  /** Starts the render loop. The intro card waits for the first click before anything else happens. */
  start(): void {
    this.engine.start();
  }

  /**
   * Creates every interactable: the stall boxes, each of which buys a pack. They are the only way to restock, so
   * their label names the pack that E will add.
   */
  private buildInteractables(): void {
    // Each unlit diya can be aimed at while the agarbatti is lit; E or a click touches the flame to its wick.
    this.diyaRow.roots.forEach((root, i) => {
      this.addInteractable({
        id: `diya-${i}`,
        root,
        label: () => (!this.diyaRow.isLit(i) && this.agarbatti.lit ? 'Click — light the diya' : null),
        act: () => {
          this.hands.poke();
          this.diyaRow.light(i);
        },
      });
    });
    for (const box of this.props.stallBoxes) {
      const info = CRACKERS[box.kind];
      const label = `E — Take ${info.pack} ${info.label}`;
      this.addInteractable({
        id: `box-${box.kind}`,
        root: box.object,
        label: () => label,
        act: () => this.buyPack(box.kind, box.position),
      });
    }
  }

  /** Adds an interactable to the list and registers its root as an aim target. */
  private addInteractable(it: Interactable): void {
    this.interactables.push(it);
    this.aimTargets.set(it.root, it);
  }

  /** Dismisses the intro: starts audio, captures the pointer and begins the walk through the gate. */
  private begin(): void {
    this.started = true;
    this.audio.init();
    this.audio.startAmbience();
    this.input.requestLock();
    this.intro.fadeOut(INTRO_SECONDS);
    this.player.forward(this.walkDir);
    this.introElapsed = 0;
    this.introWalking = true;
  }

  /**
   * Adds one pack of the given kind to the inventory when a stall box is used, confirms it with a toast in both
   * scripts and plays the paper-rustle sound at the box.
   */
  private buyPack(kind: CrackerKind, at: THREE.Vector3): void {
    const info = CRACKERS[kind];
    this.inventory.add(kind, info.pack);
    this.visitedStall = true;
    this.audio.play('place', at);
    this.toast.show(`+${info.pack} ${info.label} · ${info.hindi}`);
  }

  /** One frame of game logic, run after the player and hands have moved and before the camera shake is applied. */
  private frame(dt: number, t: number): void {
    this.clockTime = t;
    aerialBurstTick(dt);
    neighbourShowTick(this.fx, dt);
    drainQueue(this.farQueue, dt, this.playFar);
    this.syncPause();
    this.stepIntroWalk(dt);
    this.syncState();
    this.focus = this.started && !this.paused ? this.findFocus() : null;
    this.updateAim();
    this.readActions(t);
    this.updateFinale(dt);
    this.updatePrompt(t);
  }

  /**
   * Walks the player forward through the gate over the intro's duration. The speed eases out, starting fast and
   * slowing to a stop, so the walk settles rather than halting. Each step goes through the collision world, so the
   * player stops at a wall instead of passing through it. The direction is fixed when the walk starts.
   */
  private stepIntroWalk(dt: number): void {
    if (!this.introWalking) return;
    const remaining = INTRO_SECONDS - this.introElapsed;
    const step = Math.min(dt, remaining);
    // Speed 2D/T * (1 - u) integrates to exactly D over T, where u runs from 0 to 1 across the walk.
    const u = this.introElapsed / INTRO_SECONDS;
    const dist = ((2 * INTRO_WALK_METRES) / INTRO_SECONDS) * (1 - u) * step;
    this.introElapsed += step;
    if (this.introElapsed >= INTRO_SECONDS) this.introWalking = false;
    const p = this.player.position;
    const r = this.world.resolve(p.x + this.walkDir.x * dist, p.z + this.walkDir.z * dist, PLAYER_RADIUS);
    p.x = r.x;
    p.z = r.z;
  }

  /** Opens the pause panel when the pointer lock is lost after the intro, and closes it when the lock returns. */
  private syncPause(): void {
    const locked = this.input.locked;
    // Pause only after the lock has been held once, so a refused first request does not flash the panel.
    if (locked) this.lockSeen = true;
    const want = this.started && this.lockSeen && !locked;
    if (want !== this.paused) {
      this.paused = want;
      this.pause.setOpen(want);
    }
  }

  /** Copies the gameplay facts the prompts and hints depend on into the shared state object. */
  private syncState(): void {
    const s = this.state;
    const sel = this.inventory.selected;
    s.visitedStall = this.visitedStall;
    s.selectedName = CRACKERS[sel].label;
    s.selectedCount = this.inventory.count(sel);
    s.totalCount = this.inventory.total;
    s.placedUnlit = this.crackers.unlitCount;
    s.burstCount = this.finaleCounter.count;
    s.diyasLit = this.diyaRow.lit;
    s.selectedHindi = CRACKERS[sel].hindi;
    s.selectedHandheld = CRACKERS[sel].handheld;
    s.selectedLantern = sel === 'kandil';
    s.heldName = this.leftHeld ? CRACKERS[this.leftHeld.kind].label : '';
    s.heldUnlit = this.leftHeld !== null && this.leftHeld.timer.phase === 'idle';
    this.hotbar.update(this.inventory);
  }

  /**
   * Casts the aim ray from the screen centre against every target that can act right now and returns the nearest one
   * within reach, or null. A ground cracker is a target only while the agarbatti is lit, since only then can it be lit.
   */
  private findFocus(): Interactable | null {
    const roots = this.aimRoots;
    roots.length = 0;
    for (const it of this.interactables) {
      if (it.label(this.state) !== null) roots.push(it.root);
    }
    for (const c of this.crackers.list) {
      const it = this.aimTargets.get(c.object);
      if (it && it.label(this.state) !== null) roots.push(c.object);
    }
    if (roots.length === 0) return null;
    this.aimer.setFromCamera(this.aimCentre, this.engine.camera);
    this.aimer.far = AIM_MAX;
    const hits = this.aimer.intersectObjects(roots, true);
    this.aimHits.length = 0;
    for (const h of hits) this.aimHits.push({ object: h.object, distance: h.distance });
    return pickAimed(this.aimHits, this.aimTargets, AIM_MAX);
  }

  /** Shows the crosshair and the target highlight for this frame's focus, and hides them while play is not live. */
  private updateAim(): void {
    this.crosshair.show(this.started && !this.paused);
    this.legend.show(this.started && !this.paused);
    this.legend.update(this.clockTime, this.finaleCounter.count);
    this.droneBanner.update(this.started && !this.paused, this.droneShow.state, this.diyaRow.lit, DIYA_COUNT, this.droneShow.countdown);
    this.highlighter.set(this.focus ? this.focus.root : null);
    this.crosshair.setTarget(this.focus ? this.focus.label(this.state) : null);
  }

  /**
   * Sets a ground cracker of `kind` down at `spot` and registers it as an aim target. Its label reads "Click" only while
   * the agarbatti is lit and its fuse is still unlit.
   */
  private addGround(kind: CrackerKind, spot: THREE.Vector3): void {
    const c = createCracker(kind, this.fx, spot, this.player.yaw);
    // An invisible box around it, so tiny or spread-out crackers (saanp goli, ladi) are easy to aim at.
    addPickProxy(c.object);
    this.crackers.add(c);
    this.aimTargets.set(c.object, {
      id: `cracker-${kind}`,
      root: c.object,
      label: () => (this.agarbatti.lit && c.timer.phase === 'idle' ? 'Click — light the fuse' : null),
      // Aiming at the cracker and clicking lights it — the crosshair label promises exactly this.
      act: () => this.lightGround(c),
    });
  }

  /** Lights a ground cracker's fuse with the agarbatti (a poke of the hand) and nudges the player to step back. */
  private lightGround(c: { timer: { phase: string }; light(): void }): void {
    if (!this.agarbatti.lit || c.timer.phase !== 'idle') return;
    this.hands.poke();
    c.light();
    this.stepBackUntil = this.clockTime + STEP_BACK_SECONDS;
  }

  /** Writes the full 3D view direction (yaw and pitch) into `out`. */
  private lookDir(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.player.pitch);
    return out.set(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp,
    );
  }

  /** Handles this frame's key presses and the click, but only while the pointer is captured and play has started. */
  private readActions(t: number): void {
    if (!this.started || this.paused || !this.input.locked) return;
    const m = this.input.mouseDelta();
    this.hands.sway(m.x, m.y);

    if (this.input.pressed('KeyE') && this.focus) this.focus.act();
    if (this.input.pressed('KeyF')) this.onPlace();
    // Digits pick a hotbar slot directly; Q and the wheel step through the slots one at a time.
    for (const code of HOTBAR_KEYS) {
      const slot = slotIndexForKey(code);
      if (slot !== null && this.input.pressed(code)) this.inventory.select(slot);
    }
    if (this.input.pressed('KeyQ')) this.inventory.cycle(1);
    const wheel = this.input.wheel();
    if (wheel !== 0) this.inventory.cycle(wheel > 0 ? 1 : -1);
    if (this.input.pressed('KeyM')) this.toggleSound();
    if (this.input.pressed('KeyH')) this.legend.toggle();
    if (this.input.clicked()) this.onClick(t);
  }

  /** Lights the sparkler in the left hand, or the cracker on the ground whose fuse the agarbatti tip touches. */
  private onClick(t: number): void {
    if (this.leftHeld && this.leftHeld.timer.phase === 'idle') {
      this.hands.poke();
      this.leftHeld.light();
      return;
    }
    // A click on an aimed diya or ground cracker lights it (the same action as E on that target).
    if (this.focus && (this.focus.id.startsWith('diya-') || this.focus.id.startsWith('cracker-'))) {
      this.focus.act();
      return;
    }
    const target = this.crackers.nearestUnlit(this.agarbatti.tipWorld, TIP_REACH);
    if (!target) return;
    this.hands.poke();
    target.light();
    this.stepBackUntil = t + STEP_BACK_SECONDS;
  }

  /**
   * F places the selected cracker. Nothing happens when the selected kind is used up. A hand-held kind (phuljhadi,
   * pencil) goes into the left hand and consumes one; any other kind is set down on the ground where the crosshair
   * lands within reach, or 1.2 m ahead when it does not.
   */
  private onPlace(): void {
    const kind = this.inventory.selected;
    if (this.inventory.count(kind) <= 0) return;

    if (CRACKERS[kind].handheld) {
      if (this.leftHeld) return;
      this.inventory.take(kind);
      const c = createCracker(kind, this.fx, ORIGIN, this.player.yaw);
      // Added to the manager first: adding to the scene would otherwise pull the object back out of the hand.
      this.crackers.add(c);
      if (c instanceof HandHeld) {
        c.onBurnOut = () => this.onSparklerOut(c);
        this.hands.holdLeft(c.object);
        this.leftHeld = c;
      }
      return;
    }

    // A sky lantern is lit in front of the player and lets go to rise, rather than standing on the ground.
    if (kind === 'kandil') {
      this.inventory.take(kind);
      this.releaseLantern();
      return;
    }

    this.inventory.take(kind);
    this.player.forward(this.tmpForward);
    const spot = placementFor(this.engine.camera.position, this.lookDir(this.tmpDir), this.tmpForward);
    this.addGround(kind, spot);
  }

  /**
   * Lights an Akash Kandil held up in front of the player. It hangs there while its flame catches, then rises on a
   * breeze blowing toward the east and the far side of the village; a toast invites a wish.
   */
  private releaseLantern(): void {
    this.player.forward(this.tmpForward);
    const spot = heldLanternSpot(this.engine.camera.position, this.tmpForward, this.lanternSpot);
    this.lanterns.release(spot, LANTERN_BREEZE_HEADING + (Math.random() - 0.5) * LANTERN_BREEZE_SPREAD);
    this.audio.play('chime', spot, { pitch: 0.75, volume: 0.6 });
    this.toast.show('Make a wish · मनोकामना', 4);
  }

  /** Clears the left hand when a sparkler burns out and counts it toward the finale. */
  private onSparklerOut(c: HandHeld): void {
    if (this.leftHeld === c) {
      this.leftHeld = null;
      this.hands.holdLeft(null);
    }
    this.countBurst();
  }

  /** Flips the mute state and confirms it on screen. */
  private toggleSound(): void {
    this.audio.setMuted(!this.audio.muted);
    this.toast.show(this.audio.muted ? 'Sound off' : 'Sound on', 1.6);
    this.pause.refresh();
  }

  /** Counts one burst toward the finale, and starts the finale on the call that reaches the target. */
  private countBurst(): void {
    if (this.finaleCounter.record()) this.startFinale();
  }

  /** Starts the neighbours' sky-show and the greeting. Called once per session. */
  private startFinale(): void {
    this.finaleTime = FINALE_SECONDS;
    this.nextShowIn = 0;
    this.finale.show();
    events.emit('finale', {});
  }

  /** Fires the neighbours' bursts while the finale runs, at random intervals and places. */
  private updateFinale(dt: number): void {
    if (this.finaleTime <= 0) return;
    this.finaleTime -= dt;
    this.nextShowIn -= dt;
    this.nextFountainIn -= dt;
    // Now and then a neighbour lights an anar fountain on a lane, so the street is alive too.
    if (this.nextFountainIn <= 0) {
      startFountain(this.fx, pickLanePoint(Math.random, this.fountainAt));
      this.nextFountainIn = FOUNTAIN_GAP_MIN + Math.random() * FOUNTAIN_GAP_RANGE;
    }
    if (this.nextShowIn <= 0) {
      this.neighbourBurst();
      this.nextShowIn = FINALE_GAP_MIN + Math.random() * FINALE_GAP_RANGE;
    }
  }

  /** One neighbour's burst: a random point 50 to 90 m out and 30 to 45 m up, in a random palette and shape. */
  private neighbourBurst(): void {
    const a = Math.random() * TAU;
    const dist = FINALE_NEAR + Math.random() * FINALE_SPREAD;
    const height = FINALE_HEIGHT_MIN + Math.random() * FINALE_HEIGHT_RANGE;
    this.finaleAt.set(Math.sin(a) * dist, height, -Math.cos(a) * dist);
    const palette = pickNeighbourPalette(Math.random, this.lastPalette);
    const style = pickBurstStyle(Math.random, this.lastStyle);
    this.lastPalette = palette;
    this.lastStyle = style;
    // The shell climbs as a gold comet before it breaks.
    launchShell(this.fx, this.finaleAt, style, palette, { scale: 1.4, multiBreak: Math.random() < 0.35 });
  }

  /**
   * Debug hook: sets a ground cracker down DEBUG_PLACE_REACH metres ahead of the player, far enough that a view tilted
   * down a little (or up, for a rocket) shows it.
   */
  private debugPlace(kind: CrackerKind): void {
    if (CRACKERS[kind].handheld) throw new Error(`debug place: ${kind} is hand-held`);
    this.player.forward(this.tmpForward);
    this.addGround(kind, placementPoint(this.player.position, this.tmpForward, DEBUG_PLACE_REACH));
  }

  /**
   * Debug hook: selects the first hotbar slot and places it, so a screenshot shows a phuljhadi held in the left hand
   * beside the lit agarbatti the player already holds in the right.
   */
  private debugHeldShot(): void {
    this.inventory.select(0);
    this.onPlace();
  }

  /**
   * Debug hook: fires a salvo around the yaw and fast-forwards past the climb, so the shells are already bursting
   * for the next frame. Software WebGL draws about one frame a second, so a real climb would take half a minute.
   */
  private debugSkyShow(yaw: number): void {
    this.sky.salvo(yaw);
    this.engine.advance(DEBUG_SKY_LEAD_SECONDS);
  }

  /** Debug hook: lights the first `n` diyas of the row (all of them when n is omitted). */
  private debugLightDiyas(n = DIYA_COUNT): void {
    for (let i = 0; i < n; i++) this.diyaRow.light(i);
  }

  /** Debug hook: lights every ground cracker that is still unlit. */
  private debugLightAll(): void {
    for (const c of this.crackers.list) c.light();
  }

  /** Debug hook: moves the player to (x, z), turns them to the given yaw and tilts the view to the given pitch. */
  private debugTeleport(x: number, z: number, yaw: number, pitch = 0): void {
    this.player.position.x = x;
    this.player.position.z = z;
    this.player.yaw = yaw;
    this.player.pitch = pitch;
  }

  /**
   * Chooses the pill above the hotbar. An aimed target wins (its label already starts with its key, e.g.
   * "Click — light the fuse"); otherwise the contextual prompt gives the key for the selected cracker.
   */
  private updatePrompt(t: number): void {
    if (!this.started || this.paused) {
      this.prompt.set(null);
      return;
    }
    const aimed = this.focus ? this.focus.label(this.state) : null;
    this.prompt.set(aimed ? parsePrompt(aimed) : contextPrompt(this.state, t < this.stepBackUntil));
  }
}
