// Akash Kandil, the sky lantern. It appears in front of the player, its flame catches and glows for a moment, then it
// rises slowly on the night air, swaying as a breeze carries it sideways, up to about 80 m, shrinking until it is only
// a twinkling warm star. The paper drum is emissive and an additive flame and halo sit inside and around it, so the
// bloom pass makes it glow with no point lights. Spent lanterns are removed and their materials disposed.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { flameTexture } from '../items/Diya';
import { haloTexture } from './DiyaRow';

/** Seconds the lantern hangs in front of the player while its flame catches, before it lets go. */
export const HOLD_SECONDS = 1.6;
/** Seconds the climb takes to reach full speed, so the lantern lifts off gently. */
const LIFT_SECONDS = 4;
/** Climb speed once lifted, in metres per second. */
const RISE_SPEED = 1.9;
/** Height above the release point at which the lantern is gone, in metres. */
export const MAX_HEIGHT = 80;
/** Seconds the lantern takes to fade out after it reaches MAX_HEIGHT. */
const FADE_SECONDS = 3;
/** Breeze speed that carries the lantern sideways, in metres per second. */
const BREEZE_SPEED = 0.9;
/** Side-to-side sway amplitude in metres. */
const SWAY_AMPLITUDE = 1.3;
/** Most lanterns alive at once; the oldest is removed when a new one is released beyond this. */
const MAX_LANTERNS = 8;
/** Metres in front of the eye where the lantern is held up, and below the eye. */
const HOLD_FORWARD = 1.0;
const HOLD_DROP = 0.3;
/** Paper drum size in metres. */
const BODY_HEIGHT = 0.4;
const BODY_TOP_R = 0.16;
const BODY_BOTTOM_R = 0.11;
/** Warm paper tones, flame and halo colours. */
const PAPER_EMISSIVE = 0xff7a20;
const FLAME_COLOR = new THREE.Color().setRGB(2.4, 1.5, 0.5);
const HALO_COLOR = new THREE.Color().setRGB(2.4, 1.45, 0.15);
const CORE_COLOR = new THREE.Color().setRGB(3.2, 2.1, 0.9);

/**
 * Height above the release point after `age` seconds: zero while the flame catches, then a gentle ease into a steady
 * climb, capped at MAX_HEIGHT.
 */
export function lanternHeight(age: number): number {
  const t = age - HOLD_SECONDS;
  if (t <= 0) return 0;
  const h = t < LIFT_SECONDS ? (0.5 * RISE_SPEED * t * t) / LIFT_SECONDS : 0.5 * RISE_SPEED * LIFT_SECONDS + RISE_SPEED * (t - LIFT_SECONDS);
  return Math.min(MAX_HEIGHT, h);
}

/**
 * Sideways displacement from the release point after `age` seconds, as [x, z]: a steady drift along `heading` radians
 * (the breeze) plus a slow sway across it that builds as the lantern leaves the hand. `seed` varies the sway phase.
 */
export function lanternDrift(age: number, heading: number, seed: number): [number, number] {
  const t = Math.max(0, age - HOLD_SECONDS);
  const along = BREEZE_SPEED * t;
  const across = SWAY_AMPLITUDE * Math.sin(t * 0.55 + seed) * Math.min(1, t / 6);
  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  // Across-direction is the heading turned a quarter turn.
  return [dx * along - dz * across, dz * along + dx * across];
}

/** Seconds from release until a lantern is gone: hold, climb to MAX_HEIGHT, fade. */
export function lanternLife(): number {
  const climb = LIFT_SECONDS / 2 + (MAX_HEIGHT - 0.5 * RISE_SPEED * LIFT_SECONDS) / RISE_SPEED + LIFT_SECONDS / 2;
  return HOLD_SECONDS + climb + FADE_SECONDS;
}

/** Body scale as the lantern climbs: full size in the hand, shrinking to 20 per cent by the top. */
export function bodyScale(height: number): number {
  const u = Math.min(1, height / MAX_HEIGHT);
  return 1 - 0.7 * u;
}

/** One lantern in flight. */
interface Lantern {
  root: THREE.Group;
  body: THREE.Group;
  paper: THREE.MeshStandardMaterial;
  flame: THREE.Sprite;
  halo: THREE.Sprite;
  core: THREE.Sprite;
  origin: THREE.Vector3;
  heading: number;
  seed: number;
  age: number;
}

let paperTex: THREE.CanvasTexture | null = null;

/** Paper emissive map: brighter at the base where the flame heats it, with faint vertical ribs, drawn once. */
function paperTexture(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#ffd9a0');
    grad.addColorStop(1, '#c98a4a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = 'rgba(120,50,10,0.35)';
    for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 64);
  }
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

/** Releases and animates sky lanterns. */
export class SkyLanterns implements Updatable {
  /** Holds every lantern in flight; the caller adds it to the scene. */
  readonly object = new THREE.Group();

  private readonly lanterns: Lantern[] = [];
  private readonly bodyGeo = new THREE.CylinderGeometry(BODY_TOP_R, BODY_BOTTOM_R, BODY_HEIGHT, 16, 1, true);
  private readonly capGeo = new THREE.TorusGeometry(BODY_BOTTOM_R, 0.008, 6, 20);
  private readonly capMat = new THREE.MeshStandardMaterial({ color: 0xc8a46a, roughness: 0.8 });

  /** How many lanterns are in the air or being held. */
  get count(): number {
    return this.lanterns.length;
  }

  /**
   * Releases a lantern at `from` (the held position) drifting along `heading` radians on the breeze. The oldest
   * lantern is removed first when too many are alive.
   */
  release(from: THREE.Vector3, heading: number): void {
    if (this.lanterns.length >= MAX_LANTERNS) this.remove(0);
    const root = new THREE.Group();
    root.position.copy(from);
    const body = new THREE.Group();
    const paper = new THREE.MeshStandardMaterial({
      color: 0xf4c890,
      emissive: PAPER_EMISSIVE,
      emissiveMap: paperTexture(),
      emissiveIntensity: 0,
      roughness: 0.85,
      side: THREE.DoubleSide,
      fog: false,
      transparent: true,
    });
    const drum = new THREE.Mesh(this.bodyGeo, paper);
    drum.position.y = BODY_HEIGHT / 2;
    // Bamboo ring at the open base.
    const ring = new THREE.Mesh(this.capGeo, this.capMat);
    ring.rotation.x = Math.PI / 2;
    body.add(drum, ring);

    // Flame inside the drum and a wide soft halo around it, both additive so they bloom.
    const flame = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flameTexture(), color: FLAME_COLOR, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    );
    flame.position.y = 0.12;
    flame.scale.set(0.1, 0.2, 1);
    body.add(flame);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color: HALO_COLOR, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    );
    halo.position.y = BODY_HEIGHT * 0.45;
    // Small bright core that stays when the paper has shrunk away: the point of the star.
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color: CORE_COLOR, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    );
    core.position.y = BODY_HEIGHT * 0.45;
    root.add(body, halo, core);
    this.object.add(root);
    this.lanterns.push({ root, body, paper, flame, halo, core, origin: from.clone(), heading, seed: Math.random() * 6.28, age: 0 });
  }

  /** Moves, sways, shrinks and fades every lantern, and removes the ones that have finished. */
  update(dt: number, t: number): void {
    for (let i = this.lanterns.length - 1; i >= 0; i--) {
      const l = this.lanterns[i];
      l.age += dt;
      if (l.age >= lanternLife()) {
        this.remove(i);
        continue;
      }
      this.pose(l, t);
    }
  }

  /** Writes one lantern's position, scale, glow and twinkle for its current age. */
  private pose(l: Lantern, t: number): void {
    const h = lanternHeight(l.age);
    const [dx, dz] = lanternDrift(l.age, l.heading, l.seed);
    // A slow bob rides on the climb so the flight is never perfectly steady.
    l.root.position.set(l.origin.x + dx, l.origin.y + h + 0.06 * Math.sin(t * 1.3 + l.seed), l.origin.z + dz);
    const k = bodyScale(h);
    l.body.scale.setScalar(k);
    l.body.rotation.y = l.seed + l.age * 0.12;
    l.body.rotation.z = 0.08 * Math.sin(t * 0.7 + l.seed);

    // Flame catches over the hold, then burns steady; the fade at the top takes it to nothing.
    const lit = Math.min(1, l.age / HOLD_SECONDS);
    const fade = Math.min(1, Math.max(0, (lanternLife() - l.age) / FADE_SECONDS));
    // Twinkle grows as the paper shrinks to a point: a lantern up close burns steady, a star shimmers.
    const height01 = Math.min(1, h / MAX_HEIGHT);
    const twinkle = 1 + 0.35 * height01 * Math.sin(t * 7 + l.seed) * Math.sin(t * 3.1 + l.seed * 2);
    l.paper.emissiveIntensity = 1.0 * lit * twinkle;
    l.paper.opacity = fade;
    const flameMat = l.flame.material as THREE.SpriteMaterial;
    flameMat.opacity = 0.95 * lit * fade;
    // Halo is sized in the world, growing as the body shrinks so a distant lantern still reads as a glowing star.
    const haloSize = (0.6 + 3.0 * height01) * lit * twinkle;
    l.halo.scale.setScalar(haloSize);
    // The core grows from nothing in the hand to a bright pinpoint up high, and is what twinkles most.
    l.core.scale.setScalar((0.06 + 0.3 * height01) * lit * twinkle);
    (l.core.material as THREE.SpriteMaterial).opacity = (0.3 + 0.5 * height01) * lit * fade;
    (l.halo.material as THREE.SpriteMaterial).opacity = (0.95 + 0.05 * height01) * lit * fade;
  }

  /** Removes lantern `i` from the scene and disposes what it owns. */
  private remove(i: number): void {
    const l = this.lanterns[i];
    this.object.remove(l.root);
    l.paper.dispose();
    (l.flame.material as THREE.SpriteMaterial).dispose();
    (l.halo.material as THREE.SpriteMaterial).dispose();
    (l.core.material as THREE.SpriteMaterial).dispose();
    this.lanterns.splice(i, 1);
  }
}

/** Where a lantern is held when released: just ahead of and below the eye, along the view's flat direction. */
export function heldLanternSpot(eye: THREE.Vector3, forward: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(eye.x + forward.x * HOLD_FORWARD, eye.y - HOLD_DROP, eye.z + forward.z * HOLD_FORWARD);
}
