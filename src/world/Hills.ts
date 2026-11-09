// The distant scenery: a ring of layered procedural hills in three depths that fade from deep indigo up front to a
// hazy rose-violet at the back, hundreds of twinkling village lights scattered on their slopes, a floodlit temple with
// a lit shikhara on one hill, and soft clouds lit from below by the festival glow. Everything is unlit and fog-free,
// so it needs no lights; the glow dots go through the bloom pass. The hills stay under about 18 degrees of elevation,
// which leaves the sky above them open for fireworks bursting 50 to 70 m up.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { GlowField, type GlowDot } from './glowPoints';
import { rng } from './textures';

const TAU = Math.PI * 2;
/** Segments around each ring; fine enough that the ridge reads as a smooth skyline. */
const SEGMENTS = 720;
/** Depth below ground where the hills' lower edge sits, hidden under the fields disc. */
const FOOT_Y = -6;

/** One layer of hills: its distance, how tall it stands, its two colours and how many village lights it carries. */
interface Layer {
  radius: number;
  /** Mean height of the ridge above ground in metres, and how far it swings either way. */
  base: number;
  swing: number;
  /** Colour at the crest and at the foot; the foot melts into the horizon haze. */
  top: number;
  bottom: number;
  /** Village lights on this layer, in clusters. */
  lights: number;
  seed: number;
}

/** Back to front: the far layer is the palest and tallest, so each nearer ridge reads darker against it. */
const LAYERS: Layer[] = [
  { radius: 245, base: 46, swing: 20, top: 0x8a60b8, bottom: 0x8a4c86, lights: 160, seed: 11 },
  { radius: 200, base: 34, swing: 15, top: 0x5a3c9c, bottom: 0x7a4890, lights: 220, seed: 23 },
  { radius: 158, base: 22, swing: 11, top: 0x32267c, bottom: 0x56388c, lights: 260, seed: 37 },
];
/** Azimuth of the temple, radians from north toward east: left of the aangan's first view, beside the moon. */
const TEMPLE_AZIMUTH = -0.42;
/** Index in LAYERS of the hill that carries the temple. */
const TEMPLE_LAYER = 1;
/** Warm light colours for the slope villages, above 1 so the brightest reach the bloom. */
const SLOPE_LIGHTS = [
  new THREE.Color(2.0, 1.5, 0.7),
  new THREE.Color(2.0, 1.1, 0.5),
  new THREE.Color(1.8, 1.7, 1.4),
  new THREE.Color(1.4, 1.6, 2.0),
];

/** Ridge height at azimuth `a` for a layer: a sum of a few periodic sines, so the ring closes without a seam. */
function ridgeHeight(l: Layer, a: number): number {
  const r = rng(l.seed);
  let h = 0;
  let norm = 0;
  // Low lumps for the big hills, then finer ones for the jagged skyline; amplitude falls as frequency rises.
  for (const [freq, amp] of [[2, 1], [3, 0.8], [5, 0.55], [9, 0.3], [17, 0.15], [31, 0.07]] as const) {
    h += amp * Math.sin(a * freq + r() * TAU);
    norm += amp;
  }
  return l.base + (h / norm) * l.swing * 1.6;
}

/** Colour channels of a hex value, as linear floats. */
function rgb(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** The ring mesh of one layer: a strip whose top follows the ridge and whose colour fades from crest to foot. */
function ringMesh(l: Layer): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const top = rgb(l.top);
  const bottom = rgb(l.bottom);
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * TAU;
    const x = Math.sin(a) * l.radius;
    const z = -Math.cos(a) * l.radius;
    const h = ridgeHeight(l, a);
    pos.push(x, h, z, x, FOOT_Y, z);
    // The crest keeps the layer colour; lower down the slope shades toward the haze colour.
    col.push(...top, ...bottom);
    if (i < SEGMENTS) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  mesh.frustumCulled = false;
  return mesh;
}

/** Village lights on one layer's slopes, in clusters of a few dozen, each a small town on the hillside. */
function slopeLights(l: Layer, dots: GlowDot[]): void {
  const r = rng(l.seed * 7 + 1);
  const clusters = Math.max(6, Math.floor(l.lights / 28));
  for (let c = 0; c < clusters; c++) {
    const centre = r() * TAU;
    const per = Math.floor(l.lights / clusters);
    for (let k = 0; k < per; k++) {
      const a = centre + (r() - 0.5) * 0.09;
      // Heights run from low on the slope up to just below the crest, so the lights sit on the hill, not in the sky.
      const y = Math.max(1, (ridgeHeight(l, a) - FOOT_Y) * (0.08 + 0.7 * r()) + FOOT_Y);
      const rad = l.radius - 1;
      dots.push({
        pos: new THREE.Vector3(Math.sin(a) * rad, y, -Math.cos(a) * rad),
        color: SLOPE_LIGHTS[Math.floor(r() * (r() < 0.8 ? 3 : 4))],
        size: 1.8 + r() * 2.2,
      });
    }
  }
}

/** Radius of the temple spire at height y, for a spire `height` metres tall. */
function spireRadius(y: number, height: number): number {
  const f = 1 - y / height;
  return 3.4 * Math.pow(f, 1.7) + 0.35;
}

/**
 * A floodlit temple on the hill at the given layer and azimuth: a plinth, a mandapa hall and a curved shikhara with a
 * kalash and a flag, in warm lit stone, ringed with lamp dots so its outline glows against the violet hills.
 */
function buildTemple(scene: THREE.Scene, layer: Layer, azimuth: number, dots: GlowDot[]): void {
  const group = new THREE.Group();
  const baseY = ridgeHeight(layer, azimuth);
  group.position.set(Math.sin(azimuth) * (layer.radius - 4), baseY - 0.5, -Math.cos(azimuth) * (layer.radius - 4));
  // Face the temple toward the courtyard, so its front reads from the aangan.
  group.rotation.y = azimuth;
  const stone = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.05, 0.62), fog: false });
  const shade = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.72, 0.45), fog: false });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 14), shade);
  plinth.position.y = -2.5;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 9), stone);
  hall.position.set(0, 3.75, 3);
  const SHIKHARA_H = 15;
  const profile: THREE.Vector2[] = [];
  for (let k = 0; k <= 14; k++) {
    const y = (SHIKHARA_H * k) / 14;
    profile.push(new THREE.Vector2(spireRadius(y, SHIKHARA_H), y));
  }
  profile.push(new THREE.Vector2(0.3, SHIKHARA_H + 0.8), new THREE.Vector2(0, SHIKHARA_H + 1.6));
  const spire = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), stone);
  spire.position.set(0, 6, -1.5);
  const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1), fog: false }));
  kalash.position.set(0, 6 + SHIKHARA_H + 2, -1.5);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.2), side: THREE.DoubleSide, fog: false }),
  );
  flag.position.set(1.2, 6 + SHIKHARA_H + 4.4, -1.5);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 5), shade);
  pole.position.set(0, 6 + SHIKHARA_H + 3.4, -1.5);
  group.add(plinth, hall, spire, kalash, pole, flag);
  scene.add(group);

  // Lamp dots in the temple's own frame, then moved to world space: a ring of lamps up the spire, along the plinth
  // edge and the hall roofline, and a wide soft halo behind it for the floodlit haze.
  const toWorld = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(group.matrixWorld);
  group.updateMatrixWorld(true);
  const gold = new THREE.Color(2.4, 1.8, 0.8);
  for (let y = 1; y <= SHIKHARA_H - 1; y += 1.6) {
    const rad = spireRadius(y, SHIKHARA_H) + 0.25;
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * TAU;
      dots.push({ pos: toWorld(Math.cos(t) * rad, 6 + y, -1.5 + Math.sin(t) * rad), color: gold, size: 0.55 });
    }
  }
  for (let x = -8; x <= 8; x += 1.3) {
    dots.push({ pos: toWorld(x, 1.6, 7.2), color: gold, size: 0.7 });
    dots.push({ pos: toWorld(x * 0.55, 6.2, 7.6), color: gold, size: 0.6 });
  }
  dots.push({ pos: toWorld(0, 14, 1), color: new THREE.Color(0.55, 0.32, 0.14), size: 60 });
}

/** A soft cloud on canvas: overlapping puffs, shaded from violet on top to warm rose-orange underneath where lamplight lights it. */
function cloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = rng(77);
    for (let i = 0; i < 26; i++) {
      const x = 60 + r() * 392;
      const y = 70 + r() * 70 - Math.abs(x - 256) * 0.1;
      const rad = 28 + r() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Colour only where the puffs are: violet at the top, hot rose-orange at the underside.
    ctx.globalCompositeOperation = 'source-atop';
    const shade = ctx.createLinearGradient(0, 40, 0, 170);
    shade.addColorStop(0, 'rgb(150,110,210)');
    shade.addColorStop(0.55, 'rgb(210,125,160)');
    shade.addColorStop(1, 'rgb(255,170,90)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 512, 192);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft clouds hung low over the hills, each a sprite on the far side of the ring. */
function buildClouds(scene: THREE.Scene): void {
  const r = rng(909);
  const map = cloudTexture();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + (r() - 0.5) * 0.3;
    const elev = 0.1 + r() * 0.3;
    const dist = 290;
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, transparent: true, opacity: 0.5 + r() * 0.3, depthWrite: false, fog: false }),
    );
    cloud.position.set(Math.sin(a) * dist * Math.cos(elev), Math.sin(elev) * dist, -Math.cos(a) * dist * Math.cos(elev));
    const w = 110 + r() * 90;
    cloud.scale.set(w, w * 0.34, 1);
    scene.add(cloud);
  }
}

/** The hill ring, its lights, the temple and the clouds; add once. */
export class Hills implements Updatable {
  private readonly glow: GlowField;

  /** Builds the three hill layers, the temple, the slope lights and the clouds into the scene. */
  constructor(scene: THREE.Scene) {
    const dots: GlowDot[] = [];
    LAYERS.forEach((l, i) => {
      const mesh = ringMesh(l);
      // Far layers draw first, so a nearer ridge always covers the one behind without relying on depth alone.
      mesh.renderOrder = -5 + i;
      scene.add(mesh);
      slopeLights(l, dots);
    });
    buildTemple(scene, LAYERS[TEMPLE_LAYER], TEMPLE_AZIMUTH, dots);
    buildClouds(scene);
    this.glow = new GlowField(dots, 0.7);
    scene.add(this.glow.points);
  }

  /** Twinkles the slope lights. */
  update(dt: number, t: number): void {
    this.glow.update(dt, t);
  }
}
