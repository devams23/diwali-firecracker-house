// Base class for every cracker placed in the village: it owns the model, the fuse state machine and the
// fuse's sound and sparks, and calls subclass hooks when the fuse runs out and while the effect plays.
// Subclasses only describe their own effect; lifecycle, cleanup and the burst event live here.
import * as THREE from 'three';
import { CRACKERS, type CrackerKind } from './catalog';
import { FuseTimer } from './FuseTimer';
import type { FxContext } from '../fx/FxContext';
import type { SoundHandle } from '../audio/AudioEngine';
import type { Updatable } from '../core/Engine';
import { events } from '../core/events';
import { FUSE_NAME } from '../items/crackerModels';

/** Fuse sparks thrown per second while the fuse burns. */
const FUSE_SPARK_RATE = 30;
/** World up, used as the default direction for fuse sparks. */
const UP = new THREE.Vector3(0, 1, 0);
/** Seconds a finished cracker stays in the scene before the manager removes it. */
export const DONE_LINGER_SECONDS = 12;

/** Base for all crackers: fuse timing, fuse sound and sparks, and the burst event, with effects left to subclasses. */
export abstract class Cracker implements Updatable {
  /** Which cracker this is, for lookups and labels. */
  readonly kind: CrackerKind;
  /** Root object of the cracker; the manager adds it to the scene and the factory positions it. */
  readonly object: THREE.Group;
  /** Fuse state machine that decides when the effect starts and ends. */
  readonly timer: FuseTimer;
  /** Seconds since the effect finished, used by the manager to remove the cracker later. */
  age = 0;

  /** Seconds since ignition while active; subclasses read this to time their effects. */
  protected activeTime = 0;
  /** Shared effect systems, sound and camera shake. */
  protected readonly fx: FxContext;

  /** The "fuse" marker inside the model, or null if the model has none. */
  private readonly fuseNode: THREE.Object3D | null;
  /** Looping fuse sound, kept so it can be stopped on ignition or disposal. */
  private fuseSound: SoundHandle | null = null;
  /** Fractional fuse-spark count carried between frames so the rate is exact at any frame time. */
  private fuseSparkAcc = 0;
  /** Scratch vector for world-position queries, so per-frame lookups do not allocate. */
  private readonly tmp = new THREE.Vector3();
  /** Scratch vector for the fuse sound's position updates. */
  private readonly fusePos = new THREE.Vector3();
  /** Set once the effect has been started, so the hook runs exactly once. */
  private ignited = false;

  /** Creates the cracker around a model built by makeCrackerModel and takes its fuse timing from the catalogue. */
  constructor(kind: CrackerKind, fx: FxContext, model: THREE.Group) {
    this.kind = kind;
    this.fx = fx;
    this.object = model;
    this.timer = new FuseTimer(CRACKERS[kind].fuse);
    this.fuseNode = model.getObjectByName(FUSE_NAME) ?? null;
  }

  /** Writes the world position of the fuse tip into `out`, falling back to the cracker origin. */
  fuseWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.fuseNode) {
      this.fuseNode.getWorldPosition(out);
    } else {
      this.object.getWorldPosition(out);
    }
    return out;
  }

  /** Lights the fuse; returns false if it was already lit. Starts the fuse sound and fuse sparks while burning. */
  light(): boolean {
    if (!this.timer.light()) return false;
    if (this.timer.phase === 'fusing') {
      // The fuse sound runs for the whole fuse and stops itself; its position follows the fuse tip each frame.
      this.fuseWorld(this.fusePos);
      this.fuseSound = this.fx.audio.play('fuse', this.fusePos, { duration: CRACKERS[this.kind].fuse });
    } else {
      // Zero-fuse crackers skip straight to active, so the ignition hook must run now.
      this.enterActive();
    }
    return true;
  }

  /** Drives the fuse and, once active, the subclass effect; the burst event is fired by subclasses via burst(). */
  update(dt: number, t: number): void {
    if (this.timer.phase === 'done') {
      this.age += dt;
      return;
    }
    if (this.timer.phase === 'fusing') {
      const next = this.timer.tick(dt);
      this.burnFuse(dt);
      if (next === 'active') this.enterActive();
    }
    if (this.timer.phase === 'active') {
      this.activeTime += dt;
      if (this.onActive(dt, t)) {
        this.timer.finish();
        this.fuseSound?.stop();
        this.fuseSound = null;
      }
    }
  }

  /** Called exactly once when the fuse runs out; starts the effect (sounds, first burst, initial sparks). */
  protected abstract onIgnite(): void;

  /** Called every frame while active; returns true once the effect is over. */
  protected abstract onActive(dt: number, t: number): boolean;

  /** Announces a burst at the cracker's position so lighting and other systems can react. */
  protected burst(power: number): void {
    this.object.getWorldPosition(this.tmp);
    events.emit('burst', { x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, power });
  }

  /** Removes the cracker from the scene, stops its fuse sound and frees the geometry it owns. */
  dispose(): void {
    this.fuseSound?.stop();
    this.fuseSound = null;
    this.object.removeFromParent();
    // Model geometry is built per cracker, so it is ours to free; materials are shared caches and stay.
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }

  /** Starts the effect: stops the fuse sound and calls the subclass ignition hook once. */
  private enterActive(): void {
    if (this.ignited) return;
    this.ignited = true;
    this.fuseSound?.stop();
    this.fuseSound = null;
    this.onIgnite();
  }

  /** Throws fuse sparks from the tip at a steady rate, and keeps the fuse sound attached to the tip. */
  private burnFuse(dt: number): void {
    this.fuseWorld(this.tmp);
    this.fuseSound?.setPosition(this.tmp);
    this.fuseSparkAcc += FUSE_SPARK_RATE * dt;
    const n = Math.floor(this.fuseSparkAcc);
    if (n <= 0) return;
    this.fuseSparkAcc -= n;
    this.fx.sparks.emit({
      position: this.tmp,
      direction: UP,
      speed: [0.4, 1.2],
      spread: 1.0,
      count: n,
      colors: [0xffb347, 0xffe0a0],
      life: [0.2, 0.5],
      size: [0.01, 0.02],
    });
  }
}
