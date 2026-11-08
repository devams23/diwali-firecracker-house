// Ladi (string of crackers): a braided fuse laid on the ground with red paper tubes standing on it. Once lit, it pops
// 60 times along the laid curve from the lit end, at a randomised 15 to 25 pops a second with the occasional double
// pop. Each pop is a crack with a burst of 20 to 40 gold sparks, a hot white point, 5 to 10 red paper bits, a flash
// every third pop and a small smoke puff. The tubes vanish as the pops pass them and the braid burns away behind the
// pops. The chain jumps a little on each pop, the camera shakes a touch within 4 m, and the end sometimes flicks round.
import * as THREE from 'three';
import { Cracker } from './Cracker';
import type { FxContext } from '../fx/FxContext';
import { LADI_BRAID_NAME, LADI_BRAID_SEGMENTS, ladiPoint } from '../items/crackerModels';

/** Total pops along the ladi. */
export const LADI_POPS = 60;
/** Slowest and fastest pop rate in pops per second; each gap between pops is drawn from this band. */
const POP_RATE_MIN = 15;
const POP_RATE_MAX = 25;
/** Chance that a pop is followed almost at once by a second pop, and the gap range of that double, in seconds. */
const DOUBLE_CHANCE = 0.15;
const DOUBLE_GAP: [number, number] = [0.012, 0.02];
/** Every this-many pops gets a tiny flash of light, which keeps the light pool within its budget. */
const FLASH_EVERY = 3;
/** Every this-many pops (offset by one) leaves a small smoke puff. */
const SMOKE_EVERY = 3;
/** Height above the braid where a pop happens, in metres, which is the top of a tube. */
const POP_LIFT = 0.02;
/** Camera shake trauma added by each pop when the player is close: tiny, but present. */
const POP_SHAKE = 0.02;
/** Distance within which pops shake the camera, in metres. */
const SHAKE_RANGE = 4;
/** Chain jump on each pop, in metres, and how fast it settles back. */
const JUMP_HEIGHT = 0.012;
const JUMP_DECAY = 25;
/** Chance the final pop flicks the chain round, and the spin speed range of that flick in rad/s. */
const FLICK_CHANCE = 0.6;
const FLICK_SPEED: [number, number] = [4, 6];
/** Rate at which the flick slows down, per second. */
const FLICK_DECAY = 5;
/** Red paper shades for the bits thrown by each pop. */
const PAPER_RED = [0x9c3b22, 0x7a1c14];
/** Gold spark colours for the burst of each pop. */
const GOLD_SPARKS = [0xffc24a, 0xfff0c0, 0xffe08a];
/** Hot white-gold point of each pop: a single very bright, very short spark. */
const HOT_COLOR = [0xfff8e0];
/** Smoke colour of each pop's puff. */
const SMOKE_GREY = 0x9a948c;

/**
 * Pop times in seconds from ignition, one per pop, in the order the pops walk along the string. The first pop is at
 * zero. Each gap is a random 15 to 25 pops a second, and some pops are followed by a close second pop. `random`
 * supplies unit random numbers, so a test can pass a fixed sequence.
 */
export function buildPopTimes(random: () => number = Math.random): number[] {
  const times: number[] = [];
  let t = 0;
  while (times.length < LADI_POPS) {
    times.push(t);
    if (times.length < LADI_POPS && random() < DOUBLE_CHANCE) {
      times.push(t + DOUBLE_GAP[0] + random() * (DOUBLE_GAP[1] - DOUBLE_GAP[0]));
    }
    t += 1 / (POP_RATE_MIN + random() * (POP_RATE_MAX - POP_RATE_MIN));
  }
  return times;
}

/**
 * How many pops should have fired by `seconds` after ignition: the count of pop times at or before that moment.
 * Negative times have no pops yet.
 */
export function popsDueBy(times: readonly number[], seconds: number): number {
  let n = 0;
  while (n < times.length && times[n] <= seconds) n++;
  return n;
}

/** Ladi: a laid string of crackers that pops along the ground, with the tubes and braid disappearing as it goes. */
export class Ladi extends Cracker {
  /** The red tubes in the order they sit along the fuse; each is hidden when its pop passes it. */
  private readonly tubes: THREE.Object3D[];
  /** The braided fuse mesh, whose draw range is trimmed as the pops burn along it, or null if the model lacks it. */
  private readonly braid: THREE.Mesh | null;
  /** When each pop fires, in seconds after ignition, set at ignition. */
  private times: number[] = [];
  /** Number of pops that have fired so far. */
  private popped = 0;
  /** Number of tubes already hidden, counted from the lit end. */
  private tubesHidden = 0;
  /** The chain's starting height and yaw, captured at ignition after the factory has placed it. */
  private baseY = 0;
  private baseYaw = 0;
  /** Current upward kick of the chain from the last pop, in metres, which settles back over time. */
  private kick = 0;
  /** Current angular velocity of the end flick, in rad/s, and the angle it has turned so far. */
  private flickSpeed = 0;
  private flickAngle = 0;
  /** Scratch vector for the pop point in the model's local space. */
  private readonly local = new THREE.Vector3();
  /** Scratch vector for the pop point in world space, reused by every pop. */
  private readonly at = new THREE.Vector3();
  /** Scratch vector for the camera position, used by the shake check. */
  private readonly eye = new THREE.Vector3();
  /** Reused one-element colour lists, so the pops do not allocate per spark. */
  private readonly hotColors: number[] = HOT_COLOR;

  /** Builds the ladi around its model; the pops start when the fuse runs out. */
  constructor(fx: FxContext, model: THREE.Group) {
    super('ladi', fx, model);
    // The builder tags each tube, and the tubes are the first children in lit-end order.
    this.tubes = model.children.filter((c) => c.userData.ladiTube === true);
    const braid = model.getObjectByName(LADI_BRAID_NAME);
    this.braid = braid instanceof THREE.Mesh ? braid : null;
  }

  /** Puts the opening burst at the lit end of the string, and draws the pop schedule for this string. */
  protected onIgnite(): void {
    this.times = buildPopTimes();
    this.baseY = this.object.position.y;
    this.baseYaw = this.object.rotation.y;
    this.burst(0.6);
  }

  /** Fires every pop that has come due, eases the chain's jump and flick back, then ends once all of it has settled. */
  protected onActive(dt: number): boolean {
    // Pops are placed by local-to-world, which needs the matrix to be current.
    this.object.updateWorldMatrix(true, false);
    while (this.popped < LADI_POPS && this.times[this.popped] <= this.activeTime) {
      this.pop(this.popped);
      this.popped++;
    }

    this.kick *= Math.exp(-JUMP_DECAY * dt);
    this.object.position.y = this.baseY + this.kick;
    if (this.flickSpeed !== 0) {
      this.flickAngle += this.flickSpeed * dt;
      this.flickSpeed *= Math.exp(-FLICK_DECAY * dt);
      if (Math.abs(this.flickSpeed) < 0.01) this.flickSpeed = 0;
      this.object.rotation.y = this.baseYaw + this.flickAngle;
    }

    const settled = Math.abs(this.kick) < 1e-4 && this.flickSpeed === 0;
    return this.popped >= LADI_POPS && settled;
  }

  /** Fires pop number `k`: the crack, sparks, paper, light, smoke and shake, then hides or burns what it has passed. */
  private pop(k: number): void {
    const s = k / (LADI_POPS - 1);
    ladiPoint(s, this.local);
    this.local.y += POP_LIFT;
    this.at.copy(this.local);
    this.object.localToWorld(this.at);

    this.fx.audio.play('crack', this.at, { volume: 0.6 });

    // The burst: 20 to 40 gold sparks flung up and out, with the crackle flicker.
    this.fx.sparks.emit({
      position: this.at,
      speed: [1.5, 3],
      spread: Math.PI / 2,
      count: 20 + Math.floor(Math.random() * 21),
      colors: GOLD_SPARKS,
      life: [0.3, 0.6],
      size: [0.018, 0.028],
      crackle: true,
    });
    // A single very hot white point, the sharp bright centre of the pop.
    this.fx.sparks.emit({
      position: this.at,
      speed: 0,
      spread: 0,
      count: 1,
      colors: this.hotColors,
      life: [0.05, 0.08],
      size: [0.07, 0.09],
    });
    // Five to ten red paper bits, heavier, which fall and tumble.
    this.fx.sparks.emit({
      position: this.at,
      speed: [0.8, 1.8],
      spread: Math.PI / 2,
      count: 5 + Math.floor(Math.random() * 6),
      colors: PAPER_RED,
      life: [0.6, 1.0],
      size: [0.012, 0.018],
      gravity: 4,
      drag: 2,
    });

    if (k % FLASH_EVERY === 0) this.fx.flashes.flash(this.at, 0xffe39a, 1.6, 3, 0.07);
    if (k % SMOKE_EVERY === 1) this.fx.smoke.puff(this.at, { count: 1, size: 0.3, life: 2.5, rise: 0.25, color: SMOKE_GREY });

    // Only a player standing near the string feels the pops.
    this.fx.camera.getWorldPosition(this.eye);
    if (this.eye.distanceTo(this.at) < SHAKE_RANGE) this.fx.shake.add(POP_SHAKE);

    // The chain jumps a little on every pop.
    this.kick = Math.max(this.kick, JUMP_HEIGHT);

    // The last pop sometimes flicks the end of the chain round.
    if (k === LADI_POPS - 1 && Math.random() < FLICK_CHANCE) {
      const speed = FLICK_SPEED[0] + Math.random() * (FLICK_SPEED[1] - FLICK_SPEED[0]);
      this.flickSpeed = Math.random() < 0.5 ? -speed : speed;
    }

    this.hideTubesBehind(s);
    this.burnBraid(s);
  }

  /** Hides each tube whose position along the string the pop front has reached. */
  private hideTubesBehind(s: number): void {
    const last = this.tubes.length - 1;
    while (this.tubesHidden < this.tubes.length && (this.tubesHidden / last) <= s + 1e-9) {
      this.tubes[this.tubesHidden].visible = false;
      this.tubesHidden++;
    }
  }

  /**
   * Trims the braid from the lit end up to the pop front by moving the start of its draw range. The braid's index
   * is built one block per curve segment, so a segment count gives the index offset directly.
   */
  private burnBraid(s: number): void {
    const index = this.braid?.geometry.index;
    if (!this.braid || !index) return;
    const perSegment = index.count / LADI_BRAID_SEGMENTS;
    const start = Math.min(index.count, Math.round(s * LADI_BRAID_SEGMENTS) * perSegment);
    // The count must stop at the end of the index buffer, so it is what is left after the start.
    this.braid.geometry.setDrawRange(start, index.count - start);
  }
}
