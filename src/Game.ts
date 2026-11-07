// The game: builds the village, the player, the cracker systems and the Diwali UI, then runs one per-frame loop that
// reads keys and clicks, handles the thaali and the sparklers, schedules far-off bangs and runs the finale.
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
import { pickInteractable, type Interactable } from './player/Interaction';
import { nextHint, type PlayerState } from './player/PlayerState';
import { makeTextures } from './world/textures';
import { buildAangan } from './world/Aangan';
import { buildHouse } from './world/House';
import { buildProps, extraDiyaSpots, type PropsResult } from './world/props';
import { buildLighting } from './world/Lighting';
import { Sky } from './world/Sky';
import { Festoons } from './world/Festoons';
import { Diya, DiyaField } from './items/Diya';
import { Thaali } from './items/Thaali';
import { Agarbatti } from './items/Agarbatti';
import { SparkSystem } from './fx/SparkSystem';
import { SmokeSystem } from './fx/SmokeSystem';
import { FlashLights } from './fx/FlashLights';
import { CameraShake } from './fx/CameraShake';
import type { FxContext } from './fx/FxContext';
import { aerialBurst, aerialBurstTick, drainQueue, SKY_PALETTES, type BurstStyle } from './fx/aerialBurst';
import { AudioEngine } from './audio/AudioEngine';
import { CrackerManager } from './crackers/CrackerManager';
import { createCracker } from './crackers/factory';
import { HandHeld } from './crackers/HandHeld';
import type { Cracker } from './crackers/Cracker';
import { CRACKERS, type CrackerKind } from './crackers/catalog';
import { placementPoint } from './crackers/placement';
import { Intro } from './ui/Intro';
import { spawnVillagers, inCheerRange, CHEER_MIN_POWER, CHEER_MAX_DELAY } from './people/villagers';
import type { Villager } from './people/Villager';
import { Prompt } from './ui/Prompt';
import { ThaaliStrip } from './ui/ThaaliStrip';
import { Pause } from './ui/Pause';
import { Finale, FinaleCounter, countsTowardFinale } from './ui/Finale';
import { Toast } from './ui/Toast';
import { debugRequested, installDebugHook } from './debugHook';

/** Niche indices (into the aangan diya spots) that hold a real lit lamp instead of a decorative one. */
const LIT_NICHES = [2, 5, 9];
/** Seconds the intro card takes to fade out, during which the player walks through the gate. */
const INTRO_SECONDS = 2.5;
/** Metres the player walks forward through the gate after the intro is dismissed. */
const INTRO_WALK_METRES = 1;
/** Collision radius of the player; matches FirstPersonController so the gate walk stops at the same walls. */
const PLAYER_RADIUS = 0.3;
/** Height of the brass cup above the stand's origin, where the agarbatti's base sits. */
const STAND_CUP_HEIGHT = 0.042;
/** Metres within which a dropped thaali is picked up again when a sparkler burns out. */
const THAALI_RECATCH_REACH = 2;
/** Seconds the "Step back!" prompt stays after a cracker is lit on the ground. */
const STEP_BACK_SECONDS = 2;
/** Reach, in metres, of the look-direction fallback for lighting a cracker on the ground. */
const LOOK_FALLBACK_REACH = 1.6;
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
const FINALE_HEIGHT_MIN = 30;
/** Extra random height added to FINALE_HEIGHT_MIN, in metres. */
const FINALE_HEIGHT_RANGE = 15;
/** Burst shapes the finale draws from. */
const FINALE_STYLES: BurstStyle[] = ['peony', 'willow', 'crackle', 'ring'];
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

/** A villager's cheer waiting for its random delay to pass before it starts. */
interface PendingCheer {
  /** Seconds until the villager starts to cheer. */
  remaining: number;
  /** The villager who cheers. */
  villager: Villager;
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
  private readonly audio: AudioEngine;
  private readonly fx: FxContext;
  private readonly sky: Sky;
  private readonly crackers: CrackerManager;
  private readonly thaali: Thaali;
  private readonly agarbatti: Agarbatti;
  private readonly props: PropsResult;
  private readonly interactables: Interactable[] = [];
  private readonly candidates: Interactable[] = [];
  private readonly state: PlayerState = {
    thaali: 'charpai',
    hasAgarbatti: false,
    agarbattiLit: false,
    leftHand: 'empty',
    thaaliCount: 0,
    placedUnlit: 0,
    burstCount: 0,
  };
  private readonly farQueue: FarBang[] = [];
  /** The villagers of the aangan, who cheer at big bursts. */
  private readonly villagers: Villager[];
  /** Cheers waiting out their random delay; drained every frame by the game loop. */
  private readonly cheerQueue: PendingCheer[] = [];
  private readonly finaleCounter = new FinaleCounter();
  private readonly intro: Intro;
  private readonly prompt: Prompt;
  private readonly strip: ThaaliStrip;
  private readonly pause: Pause;
  private readonly finale: Finale;
  private readonly toast: Toast;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpPoint = new THREE.Vector3();
  private readonly finaleAt = new THREE.Vector3();
  /** Plays a far bang once its delay has passed; a field so the per-frame drain does not allocate a closure. */
  private readonly playFar = (e: FarBang): void => {
    this.audio.play('farBoom', e.pos);
  };
  /** Starts a villager's cheer once its delay has passed; a field so the per-frame drain does not allocate a closure. */
  private readonly fireCheer = (e: PendingCheer): void => {
    e.villager.cheer();
  };
  /** The hand-held sparkler currently in the left hand, or null. */
  private leftHeld: HandHeld | null = null;
  /** The interactable under the crosshair this frame, or null. */
  private focus: Interactable | null = null;
  private hasAgarbatti = false;
  private agarbattiLit = false;
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

    // Six real lit lamps: the tulsi diya, two at the door and three in the aangan niches.
    const litPositions: THREE.Vector3[] = [
      this.props.tulsiDiyaPos,
      new THREE.Vector3(house.doorPosition.x - 1.25, 0.3, -8.2),
      new THREE.Vector3(house.doorPosition.x + 1.25, 0.3, -8.2),
      ...LIT_NICHES.map((i) => aangan.diyaSpots[i]),
    ];
    for (const pos of litPositions) {
      const d = new Diya(pos, { light: true });
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

    // Shared effects that every cracker uses: pooled sparks, smoke, flash lights and camera shake.
    const shake = new CameraShake();
    this.audio = new AudioEngine();
    this.fx = {
      scene,
      camera: this.engine.camera,
      sparks: new SparkSystem(scene),
      smoke: new SmokeSystem(scene),
      flashes: new FlashLights(scene),
      shake,
      audio: this.audio,
    };
    this.engine.add(this.fx.sparks);
    this.engine.add(this.fx.smoke);
    this.engine.add(this.fx.flashes);

    this.crackers = new CrackerManager(scene);
    this.engine.add(this.crackers);
    this.thaali = new Thaali();
    this.thaali.placeAt(this.props.charpaiThaaliPos);
    this.thaali.location = 'charpai';
    scene.add(this.thaali.object);
    this.agarbatti = new Agarbatti(this.fx);
    this.engine.add(this.agarbatti);
    // The agarbatti stands upright in the brass cup from the start; taking it reparents it to the right hand.
    const standPos = this.props.agarbattiStandPos;
    this.agarbatti.object.position.set(standPos.x, standPos.y + STAND_CUP_HEIGHT, standPos.z);
    scene.add(this.agarbatti.object);

    // The villagers are solid to the player and the kids steer clear of them; they all get the live player position.
    this.villagers = spawnVillagers(scene, this.fx, this.engine, world);
    for (const v of this.villagers) v.setPlayer(this.player.position);

    // Sky bursts report their bangs here; the bang plays after the sound's travel time (see frame()).
    this.sky.onFarBurst = (pos, delaySec) => {
      this.farQueue.push({ remaining: delaySec, pos });
    };
    // Every counted burst feeds the finale; a burst's power decides whether it counts.
    events.on('burst', (p) => {
      if (countsTowardFinale(p.power)) this.countBurst();
    });
    // Villagers near a big burst cheer, each after its own short random delay.
    events.on('burst', (p) => this.queueCheers(p));

    this.toast = new Toast(uiEl);
    this.prompt = new Prompt(uiEl);
    this.strip = new ThaaliStrip(uiEl);
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
    // Registered last so per-frame input state is cleared only after every system read it.
    this.engine.add({ update: () => this.input.endFrame() });

    // Automated tests only: with ?debug in the URL, the page exposes window.__diwali (see debugHook.ts).
    if (debugRequested(location.search)) {
      installDebugHook({
        place: (kind) => this.debugPlace(kind),
        lightAll: () => this.debugLightAll(),
        teleport: (x, z, yaw, pitch) => this.debugTeleport(x, z, yaw, pitch),
        state: () => ({ ...this.state }),
      });
    }
  }

  /** Starts the render loop. The intro card waits for the first click before anything else happens. */
  start(): void {
    this.engine.start();
  }

  /** Creates every interactable: the thaali, the ten takht boxes, the agarbatti stand and the tulsi diya. */
  private buildInteractables(): void {
    this.interactables.push({
      id: 'thaali',
      position: this.thaali.object.position,
      radius: 0.25,
      label: () => {
        if (this.leftHeld) return null;
        if (this.thaali.location === 'charpai') return 'E — Pick up the thaali (plate)';
        if (this.thaali.location === 'ground') return 'E — Pick up your thaali';
        return null;
      },
      act: () => this.pickUpThaali(),
    });

    for (const box of this.props.takhtBoxes) {
      const putLabel = `E — Put a ${CRACKERS[box.kind].label} on the thaali`;
      this.interactables.push({
        id: `box-${box.kind}`,
        position: box.position,
        radius: 0.3,
        label: () => {
          if (this.thaali.location !== 'hand') return 'Pick up your thaali first';
          if (this.thaali.inventory.full) return 'The thaali is full';
          return putLabel;
        },
        act: () => {
          if (this.thaali.location !== 'hand') return;
          if (!this.thaali.inventory.add(box.kind)) return;
          this.thaali.refresh();
          this.refreshStrip();
        },
      });
    }

    this.interactables.push({
      id: 'agarbatti-stand',
      position: this.props.agarbattiStandPos,
      radius: 0.2,
      label: () => (this.hasAgarbatti ? null : 'E — Take the agarbatti'),
      act: () => {
        this.hasAgarbatti = true;
        this.hands.holdRight(this.agarbatti.object);
      },
    });

    this.interactables.push({
      id: 'tulsi-diya',
      position: this.props.tulsiDiyaPos,
      radius: 0.2,
      label: () => (this.hasAgarbatti && !this.agarbattiLit ? 'E — Light the agarbatti at the diya' : null),
      act: () => {
        this.agarbattiLit = true;
        this.agarbatti.light();
        this.audio.play('ignite', this.props.tulsiDiyaPos);
        events.emit('lit', { kind: 'agarbatti' });
      },
    });
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
    this.refreshStrip();
  }

  /** One frame of game logic, run after the player and hands have moved and before the camera shake is applied. */
  private frame(dt: number, t: number): void {
    aerialBurstTick(dt);
    drainQueue(this.farQueue, dt, this.playFar);
    drainQueue(this.cheerQueue, dt, this.fireCheer);
    this.syncPause();
    this.stepIntroWalk(dt);
    this.syncState();
    this.focus = this.started && !this.paused ? this.findFocus() : null;
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
    s.thaali = this.thaali.location;
    s.hasAgarbatti = this.hasAgarbatti;
    s.agarbattiLit = this.agarbattiLit;
    if (this.leftHeld) s.leftHand = 'cracker';
    else if (this.thaali.location === 'hand') s.leftHand = 'thaali';
    else s.leftHand = 'empty';
    s.thaaliCount = this.thaali.inventory.items.length;
    s.placedUnlit = this.crackers.unlitCount;
    s.burstCount = this.finaleCounter.count;
  }

  /** Returns the interactable best in the crosshair among those whose label is currently shown, or null. */
  private findFocus(): Interactable | null {
    this.candidates.length = 0;
    for (const it of this.interactables) {
      if (it.label(this.state) !== null) this.candidates.push(it);
    }
    if (this.candidates.length === 0) return null;
    return pickInteractable(this.player.position, this.lookDir(this.tmpDir), this.candidates);
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
    if (this.input.pressed('KeyG')) this.toggleThaali();
    if (this.input.pressed('KeyQ')) this.cycleSelection(1);
    const wheel = this.input.wheel();
    if (wheel !== 0) this.cycleSelection(wheel > 0 ? 1 : -1);
    if (this.input.pressed('KeyM')) this.toggleSound();
    if (this.input.clicked()) this.onClick(t);
  }

  /** Lights the sparkler in the left hand, or the cracker on the ground whose fuse the agarbatti tip touches. */
  private onClick(t: number): void {
    if (this.leftHeld && this.agarbattiLit && this.leftHeld.timer.phase === 'idle') {
      this.hands.poke();
      this.leftHeld.light();
      return;
    }
    if (!this.agarbattiLit) return;
    const target = this.crackers.nearestUnlit(this.agarbatti.tipWorld, TIP_REACH) ?? this.nearestAhead();
    if (!target) return;
    this.hands.poke();
    target.light();
    this.stepBackUntil = t + STEP_BACK_SECONDS;
  }

  /**
   * Fallback for lighting: the nearest unlit cracker within LOOK_FALLBACK_REACH metres of the player, in front of
   * them, so the player need not crouch to the tip. Scratch vectors keep this allocation-free.
   */
  private nearestAhead(): Cracker | null {
    this.player.forward(this.tmpForward);
    const px = this.player.position.x;
    const pz = this.player.position.z;
    let best: Cracker | null = null;
    let bestDist = LOOK_FALLBACK_REACH;
    for (const c of this.crackers.list) {
      if (c.timer.phase !== 'idle') continue;
      c.fuseWorld(this.tmpPoint);
      const dx = this.tmpPoint.x - px;
      const dz = this.tmpPoint.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > bestDist) continue;
      if (dx * this.tmpForward.x + dz * this.tmpForward.z <= 0) continue;
      bestDist = d;
      best = c;
    }
    return best;
  }

  /**
   * F places the selected cracker. A ground cracker is set down in front of the player; a hand-held one puts the
   * thaali down at the player's feet and takes the sparkler into the left hand.
   */
  private onPlace(): void {
    if (this.thaali.location !== 'hand') return;
    const kind = this.thaali.inventory.selectedKind;
    if (kind === null) return;

    if (CRACKERS[kind].handheld) {
      if (this.leftHeld) return;
      this.thaali.inventory.takeSelected();
      this.putDownThaali();
      const c = createCracker(kind, this.fx, ORIGIN, this.player.yaw);
      // Added to the manager first: adding to the scene would otherwise pull the object back out of the hand.
      this.crackers.add(c);
      if (c instanceof HandHeld) {
        c.onBurnOut = () => this.onSparklerOut(c);
        c.attach(this.hands.leftHold);
        this.leftHeld = c;
      }
      return;
    }

    this.thaali.inventory.takeSelected();
    this.thaali.refresh();
    this.player.forward(this.tmpForward);
    const spot = placementPoint(this.player.position, this.tmpForward);
    this.crackers.add(createCracker(kind, this.fx, spot, this.player.yaw));
    this.refreshStrip();
  }

  /** Clears the left hand when a sparkler burns out and counts it toward the finale. */
  private onSparklerOut(c: HandHeld): void {
    if (this.leftHeld === c) {
      this.leftHeld = null;
      this.hands.holdLeft(null);
    }
    this.countBurst();
    // The plate was set down to free the hand; if it is still close, it goes straight back into the hand.
    if (this.thaali.location === 'ground') {
      const tp = this.thaali.object.position;
      const dx = tp.x - this.player.position.x;
      const dz = tp.z - this.player.position.z;
      if (dx * dx + dz * dz <= THAALI_RECATCH_REACH * THAALI_RECATCH_REACH) this.pickUpThaali();
    }
  }

  /** G moves the thaali between the hand and the ground. */
  private toggleThaali(): void {
    if (this.thaali.location === 'hand') this.putDownThaali();
    else if (!this.leftHeld) this.pickUpThaali();
  }

  /** Puts the thaali in the left hand. */
  private pickUpThaali(): void {
    this.thaali.location = 'hand';
    this.hands.holdLeft(this.thaali.object);
    this.refreshStrip();
  }

  /** Sets the thaali down on the ground in front of the player and shows a short confirmation. */
  private putDownThaali(): void {
    this.player.forward(this.tmpForward);
    const spot = placementPoint(this.player.position, this.tmpForward);
    this.hands.holdLeft(null);
    this.thaali.object.rotation.set(0, 0, 0);
    this.thaali.placeAt(spot);
    this.engine.scene.add(this.thaali.object);
    this.thaali.location = 'ground';
    this.refreshStrip();
    this.toast.show('Thaali set down beside you');
  }

  /** Moves the selection on the thaali by one, in the direction given, and rebuilds the plate's ring. */
  private cycleSelection(dir: 1 | -1): void {
    if (this.thaali.location !== 'hand') return;
    this.thaali.inventory.cycle(dir);
    this.thaali.refresh();
    this.refreshStrip();
  }

  /** Flips the mute state and confirms it on screen. */
  private toggleSound(): void {
    this.audio.setMuted(!this.audio.muted);
    this.toast.show(this.audio.muted ? 'Sound off' : 'Sound on', 1.6);
    this.pause.refresh();
  }

  /** Shows the thaali strip, or hides it when the plate is not in hand. */
  private refreshStrip(): void {
    this.strip.set(this.thaali.inventory.items, this.thaali.inventory.selected, this.thaali.location === 'hand');
  }

  /** Counts one burst toward the finale, and starts the finale on the call that reaches the target. */
  private countBurst(): void {
    if (this.finaleCounter.record()) this.startFinale();
  }

  /**
   * Queues a cheer for each villager within range of a burst that is big enough. Each gets its own random delay,
   * which the game loop counts down, so a crowd does not cheer in unison. The burst is always at a position, so
   * the range is measured from it.
   */
  private queueCheers(p: { x: number; z: number; power: number }): void {
    if (p.power < CHEER_MIN_POWER) return;
    for (const v of this.villagers) {
      const pos = v.object.position;
      if (!inCheerRange(pos.x, pos.z, p.x, p.z)) continue;
      this.cheerQueue.push({ remaining: Math.random() * CHEER_MAX_DELAY, villager: v });
    }
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
    const palette = SKY_PALETTES[Math.floor(Math.random() * SKY_PALETTES.length)];
    const style = FINALE_STYLES[Math.floor(Math.random() * FINALE_STYLES.length)];
    aerialBurst(this.fx, this.finaleAt, style, palette);
  }

  /**
   * Debug hook: sets a ground cracker down DEBUG_PLACE_REACH metres ahead of the player, far enough that a view tilted
   * down a little (or up, for a rocket) shows it.
   */
  private debugPlace(kind: CrackerKind): void {
    if (CRACKERS[kind].handheld) throw new Error(`debug place: ${kind} is hand-held`);
    this.player.forward(this.tmpForward);
    const spot = placementPoint(this.player.position, this.tmpForward, DEBUG_PLACE_REACH);
    this.crackers.add(createCracker(kind, this.fx, spot, this.player.yaw));
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

  /** Chooses the prompt: the "Step back!" warning, the focused object's label, or the next onboarding hint. */
  private updatePrompt(t: number): void {
    let text = '';
    if (this.started && !this.paused) {
      if (t < this.stepBackUntil) text = 'Step back!';
      else if (this.focus) text = this.focus.label(this.state) ?? '';
      else text = nextHint(this.state);
    }
    this.prompt.set(text);
  }
}
