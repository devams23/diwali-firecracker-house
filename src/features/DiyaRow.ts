// A row of unlit clay diyas along the foot of the verandah. The player touches the lit agarbatti to each one: a flame
// grows on the wick, a small brass chime rings and a soft glow blooms around it. The glow is an emissive bowl plus
// additive sprites that the bloom pass lifts, so no point lights are added. When the last diya is lit the row
// celebrates with a bell, a shankh and a shimmer of golden sparks rising from every lamp.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import type { FxContext } from '../fx/FxContext';
import { PALETTE } from '../core/palette';
import { CLAY, bowlGeometry, flameTexture, flicker } from '../items/Diya';

/** Number of diyas in the row. */
export const DIYA_COUNT = 11;
/** Half the length of the row, in metres: the first and last diya sit this far either side of the centre. */
const ROW_HALF_SPAN = 4.6;
/** Depth (z) of the row: just in front of the verandah plinth, whose front edge is at z = -7. */
const ROW_Z = -6.82;
/** Height of the bowl base above the courtyard floor, in metres. */
const ROW_Y = 0.02;
/** Visual scale of each lamp; larger than life so the flame reads from the courtyard and the aim ray can find it. */
const DIYA_SCALE = 1.6;
/** Seconds a flame takes to grow from nothing to full size. */
const GROW_SECONDS = 1.1;
/** Radius of the invisible aim proxy in unscaled metres, generous so a tiny lamp is easy to aim at. */
const HIT_RADIUS = 0.11;
/** Flame base height above the bowl origin, in unscaled metres (matches the lamp model). */
const FLAME_BASE = 0.05;
/** Warm emissive colour a lit bowl glows with at full strength. */
const BOWL_GLOW = 0x7a3a12;
/** Seconds the celebration shimmer keeps rising after the last diya is lit. */
const SHIMMER_SECONDS = 4.5;
/** Seconds between shimmer puffs, each from a random lamp. */
const SHIMMER_GAP = 0.07;
/** Gold shades the shimmer sparks draw from. */
const SHIMMER_COLORS = [0xffd27a, 0xffb347, 0xfff0c0, 0xe8c06a];

/** X positions of `count` evenly spaced diyas, centred on x = 0 and spanning `halfSpan` either side. */
export function diyaRowXs(count: number, halfSpan: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => -halfSpan + (2 * halfSpan * i) / (count - 1));
}

/** Flame growth from 0 to 1 over `GROW_SECONDS`, eased out so the flame catches quickly and then settles. */
export function flameGrowth(age: number): number {
  const u = Math.min(1, Math.max(0, age / GROW_SECONDS));
  return 1 - (1 - u) * (1 - u);
}

/** Peak opacity of an unlit lamp's beckoning glint: enough to catch the eye, far below a real flame's 0.55 halo. */
const BECKON_OPACITY = 0.3;
/** Size (metres) of the beckoning glint at mid-breath, about half a lit lamp's halo. */
const BECKON_SIZE = 0.13;
/** Breathing speed of the glint, in radians per second (one breath about every 2.6 s). */
const BECKON_RATE = 2.4;
/** Phase step between neighbouring lamps, so the glint travels along the row instead of pulsing all at once. */
const BECKON_STAGGER = 0.55;

/** One lamp of the row and its light-up state. */
interface RowDiya {
  /** Root group: bowl, wick, flame, halo and the aim proxy. */
  group: THREE.Group;
  /** The clay material, whose emissive rises as the lamp is lit. */
  bowlMat: THREE.MeshStandardMaterial;
  /** The hot flame sprite. */
  flame: THREE.Sprite;
  /** The wide soft halo sprite behind the flame. */
  halo: THREE.Sprite;
  /** Seconds since lit, or -1 while the lamp is still dark. */
  age: number;
  /** Flicker phase, so no two flames move together. */
  phase: number;
}

let haloTex: THREE.CanvasTexture | null = null;

/** Soft round radial glow, drawn once on canvas and shared by every halo. */
export function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,200,110,0.9)');
    g.addColorStop(0.35, 'rgba(255,160,60,0.35)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

/** The row of diyas: owns the meshes, the light-up animation and the celebration. */
export class DiyaRow implements Updatable {
  /** Holds every lamp; the caller adds it to the scene. */
  readonly object = new THREE.Group();
  /** Fires after each lamp is lit with the number now lit and the total. */
  onLit: ((lit: number, total: number) => void) | null = null;
  /** Fires once, when the last lamp has been lit. */
  onComplete: (() => void) | null = null;

  private readonly diyas: RowDiya[] = [];
  private readonly shared = bowlGeometry();
  private readonly proxyGeo = new THREE.SphereGeometry(HIT_RADIUS, 8, 6);
  private readonly proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  private readonly wickGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.014, 6);
  private readonly wickMat = new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 1 });
  private readonly spot = new THREE.Vector3();
  private shimmerLeft = 0;
  private shimmerClock = 0;
  private litCount = 0;

  private readonly fx: FxContext;

  constructor(fx: FxContext) {
    this.fx = fx;
    diyaRowXs(DIYA_COUNT, ROW_HALF_SPAN).forEach((x, i) => this.build(x, i));
  }

  /** How many lamps are lit. */
  get lit(): number {
    return this.litCount;
  }

  /** The lamp roots, in row order, for registering as aim targets. */
  get roots(): THREE.Object3D[] {
    return this.diyas.map((d) => d.group);
  }

  /** True when lamp `i` is already lit. */
  isLit(i: number): boolean {
    return this.diyas[i].age >= 0;
  }

  /** World position of lamp `i`'s flame, for sparks and sound. */
  flamePos(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.diyas[i].group.position).setY(ROW_Y + FLAME_BASE * DIYA_SCALE);
  }

  /** Lights lamp `i`: starts its flame, rings a chime and, on the last lamp, begins the celebration. */
  light(i: number): void {
    const d = this.diyas[i];
    if (!d || d.age >= 0) return;
    d.age = 0;
    this.litCount++;
    // Each chime is pitched a little differently so the row sounds like a tune rather than one repeated note.
    this.fx.audio.play('chime', this.flamePos(i, this.spot), { pitch: 0.9 + 0.06 * (i % 6), volume: 0.8 });
    this.fx.sparks.emit({
      position: this.flamePos(i, this.spot),
      speed: [0.2, 0.7],
      spread: 0.9,
      count: 10,
      colors: SHIMMER_COLORS,
      life: [0.5, 1],
      size: 0.03,
      gravity: -0.4,
      drag: 1.2,
    });
    this.onLit?.(this.litCount, this.diyas.length);
    if (this.litCount === this.diyas.length) this.celebrate();
  }

  /** Lights every lamp that is still dark; used by the debug hook. */
  lightAll(): void {
    for (let i = 0; i < this.diyas.length; i++) this.light(i);
  }

  /** Animates the flames and the glow, and runs the golden shimmer while the celebration lasts. */
  update(dt: number, t: number): void {
    this.diyas.forEach((d, i) => {
      if (d.age < 0) {
        this.beckon(d, i, t);
        return;
      }
      d.age += dt;
      const g = flameGrowth(d.age);
      const f = flicker(t, d.phase);
      d.flame.scale.set(0.07 * g * f, 0.12 * g * f, 1);
      d.halo.scale.setScalar(0.28 * g * (0.94 + 0.06 * f));
      (d.halo.material as THREE.SpriteMaterial).opacity = 0.55 * g;
      d.bowlMat.emissive.setHex(BOWL_GLOW).multiplyScalar(g);
    });
    if (this.shimmerLeft > 0) this.stepShimmer(dt);
  }

  /**
   * An unlit lamp breathes a faint glint at its wick, and the glints ripple along the row from one end to the other,
   * so a newcomer sees at a glance that these lamps are waiting for the agarbatti.
   */
  private beckon(d: RowDiya, i: number, t: number): void {
    const w = 0.5 + 0.5 * Math.sin(t * BECKON_RATE - i * BECKON_STAGGER);
    d.halo.scale.setScalar(BECKON_SIZE * (0.75 + 0.5 * w));
    (d.halo.material as THREE.SpriteMaterial).opacity = BECKON_OPACITY * w;
  }

  /** Bell and shankh together, then the shimmer begins. */
  private celebrate(): void {
    const centre = this.spot.set(0, 1, ROW_Z);
    this.fx.audio.play('bell', centre, { volume: 0.9 });
    this.fx.audio.play('shankh', centre, { volume: 0.7 });
    this.shimmerLeft = SHIMMER_SECONDS;
    this.shimmerClock = 0;
    this.onComplete?.();
  }

  /** Puffs a few rising gold sparks from random lamps at a steady rate. */
  private stepShimmer(dt: number): void {
    this.shimmerLeft -= dt;
    this.shimmerClock += dt;
    while (this.shimmerClock >= SHIMMER_GAP) {
      this.shimmerClock -= SHIMMER_GAP;
      const i = Math.floor(Math.random() * this.diyas.length);
      this.fx.sparks.emit({
        position: this.flamePos(i, this.spot),
        speed: [0.5, 1.6],
        spread: 0.5,
        count: 6,
        colors: SHIMMER_COLORS,
        life: [1.6, 2.8],
        size: [0.03, 0.055],
        gravity: -0.5,
        drag: 0.9,
      });
    }
  }

  /** Builds one lamp at row position x: bowl, wick, flame and halo sprites (both start invisible) and the aim proxy. */
  private build(x: number, i: number): void {
    const group = new THREE.Group();
    group.position.set(x, ROW_Y, ROW_Z);
    group.scale.setScalar(DIYA_SCALE);
    const bowlMat = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.9, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(this.shared, bowlMat));
    const wick = new THREE.Mesh(this.wickGeo, this.wickMat);
    wick.position.y = FLAME_BASE - 0.005;
    group.add(wick);

    // Halo behind, flame in front; both additive and depth-free like the other diya flames.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.position.y = FLAME_BASE + 0.035;
    halo.scale.setScalar(0.001);
    const flame = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flameTexture(), color: PALETTE.flame, opacity: 0.95, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    flame.position.y = FLAME_BASE + 0.04;
    flame.scale.set(0.001, 0.001, 1);
    group.add(halo, flame);

    // Invisible sphere that widens the aim target; raycasts still hit it though it never draws.
    const proxy = new THREE.Mesh(this.proxyGeo, this.proxyMat);
    proxy.position.y = 0.05;
    group.add(proxy);

    this.object.add(group);
    this.diyas.push({ group, bowlMat, flame, halo, age: -1, phase: i * 1.7 });
  }
}
