// Soft cracker smoke: pooled billboard puffs drawn with normal alpha blending. Each puff grows, rises and
// drifts with a light breeze while its opacity fades, using a noisy canvas sprite so it reads as smoke, not dots.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { viewport } from '../core/viewport';
import { SparkPool } from './SparkPool';

/** Optional per-puff overrides for puff(). */
export interface PuffOptions {
  /** Number of puffs to release at once. */
  count?: number;
  /** Starting sprite size in metres. */
  size?: number;
  /** Lifetime in seconds. */
  life?: number;
  /** Initial upward speed in m/s. */
  rise?: number;
  /** Hex colour of the smoke. */
  color?: number;
}

const DEFAULT_CAPACITY = 1500;
const WIND_X = 0.25;
const DEFAULT_COLOR = 0x6f675e;
const PEAK_ALPHA = 0.32;
const GROWTH = 2.6;
const SPRITE_PX = 128;
const MAX_POINT_PX = 256;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uPxPerMetre;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vAlpha = aAlpha;
    vColor = aColor;
    gl_PointSize = min(aSize * uPxPerMetre / max(-mv.z, 0.1), ${MAX_POINT_PX.toFixed(1)});
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, tex.a * vAlpha);
  }
`;

/** Builds the soft noisy smoke sprite: a radial falloff with per-pixel grain so edges break up. */
function makeSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_PX;
  canvas.height = SPRITE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for smoke sprite');
  const img = ctx.createImageData(SPRITE_PX, SPRITE_PX);
  const half = SPRITE_PX / 2;
  let seed = 1337;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < SPRITE_PX; y++) {
    for (let x = 0; x < SPRITE_PX; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const d = Math.sqrt(dx * dx + dy * dy);
      const falloff = Math.max(0, 1 - d);
      const grain = 0.55 + 0.45 * rand();
      const a = falloff * falloff * grain;
      const idx = (y * SPRITE_PX + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pooled smoke puffs; puff() releases them and update() moves, grows and fades them. */
export class SmokeSystem implements Updatable {
  private readonly pool: SparkPool;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private readonly texture: THREE.CanvasTexture;

  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly alpha: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly attrs: THREE.BufferAttribute[] = [];
  private highWater = 0;

  private readonly tmpColor = new THREE.Color();

  /** Creates the puff buffers and adds the smoke points to the scene. */
  constructor(scene: THREE.Scene, capacity = DEFAULT_CAPACITY) {
    this.pool = new SparkPool(capacity);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);

    const bind = (name: string, array: Float32Array, itemSize: number): void => {
      const attr = new THREE.BufferAttribute(array, itemSize);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attr);
      this.attrs.push(attr);
    };
    bind('position', this.pos, 3);
    bind('aColor', this.color, 3);
    bind('aSize', this.size, 1);
    bind('aAlpha', this.alpha, 1);

    this.texture = makeSmokeTexture();
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: this.texture },
        uPxPerMetre: { value: viewport.pxPerMetre },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // Bounds are fixed from the empty buffer at construction, so culling would hide live puffs.
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Releases puffs at a point, slightly scattered so a burst reads as a cloud. */
  puff(position: THREE.Vector3, o: PuffOptions = {}): void {
    const count = o.count ?? 1;
    const size = o.size ?? 0.35;
    const life = o.life ?? 3.5;
    const rise = o.rise ?? 0.5;
    this.tmpColor.setHex(o.color ?? DEFAULT_COLOR);
    for (let n = 0; n < count; n++) {
      const i = this.pool.alloc();
      const p = i * 3;
      this.pos[p] = position.x + (Math.random() - 0.5) * 0.3;
      this.pos[p + 1] = position.y + Math.random() * 0.1;
      this.pos[p + 2] = position.z + (Math.random() - 0.5) * 0.3;
      this.vel[p] = (Math.random() - 0.5) * 0.1;
      this.vel[p + 1] = rise * (0.7 + Math.random() * 0.6);
      this.vel[p + 2] = (Math.random() - 0.5) * 0.1;
      this.color[p] = this.tmpColor.r;
      this.color[p + 1] = this.tmpColor.g;
      this.color[p + 2] = this.tmpColor.b;
      this.baseSize[i] = size * (0.8 + Math.random() * 0.4);
      this.size[i] = this.baseSize[i];
      this.alpha[i] = 0;
      this.age[i] = 0;
      this.life[i] = life * (0.8 + Math.random() * 0.4);
      if (i + 1 > this.highWater) this.highWater = i + 1;
    }
  }

  /** Moves, grows and fades live puffs, then uploads the used range of each attribute. */
  update(dt: number): void {
    const hw = this.highWater;
    const damp = Math.max(0, 1 - 0.6 * dt);
    for (let i = 0; i < hw; i++) {
      if (!this.pool.isInUse(i)) continue;
      const age = this.age[i] + dt;
      if (age >= this.life[i]) {
        this.pool.release(i);
        this.size[i] = 0;
        this.alpha[i] = 0;
        this.age[i] = age;
        continue;
      }
      this.age[i] = age;
      const p = i * 3;
      // Rise slows as the smoke thins; the breeze carries it sideways along +x.
      this.vel[p + 1] *= damp;
      this.pos[p] += (this.vel[p] + WIND_X) * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;

      const u = age / this.life[i];
      // Smoke expands as it cools; opacity ramps up quickly then fades out over the second half of its life.
      this.size[i] = this.baseSize[i] * (1 + (GROWTH - 1) * u);
      const fadeIn = Math.min(1, u / 0.15);
      const fadeOut = 1 - Math.max(0, (u - 0.5) / 0.5);
      this.alpha[i] = PEAK_ALPHA * fadeIn * fadeOut;
    }

    if (this.pool.alive === 0) this.highWater = 0;
    this.geometry.setDrawRange(0, this.highWater);
    this.material.uniforms.uPxPerMetre.value = viewport.pxPerMetre;
    if (this.highWater > 0) {
      for (const attr of this.attrs) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, this.highWater * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
  }
}
