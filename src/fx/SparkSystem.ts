// GPU-drawn firework and cracker sparks: one THREE.Points draw with a pooled, CPU-integrated particle set.
// Sparks start white-hot, cool to their colour and then to dark ember, bounce on the ground and lose speed.
// All per-particle data lives in preallocated typed arrays that are uploaded as attribute sub-ranges.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { viewport } from '../core/viewport';
import { SparkPool } from './SparkPool';

/** Parameters for one burst of sparks; ranges are [min, max] and are sampled per spark. */
export interface EmitOptions {
  /** World-space origin of the burst. */
  position: THREE.Vector3;
  /** Axis the cone opens along; defaults to straight up. */
  direction?: THREE.Vector3;
  /** Launch speed in m/s. */
  speed: number | [number, number];
  /** Cone half-angle in radians; Math.PI emits over the whole sphere. */
  spread: number;
  /** Number of sparks to emit. */
  count: number;
  /** Candidate colours as hex numbers; each spark picks one at random. */
  colors: number[];
  /** Lifetime in seconds. */
  life: [number, number];
  /** World-space sprite size in metres. */
  size: number | [number, number];
  /** Downward acceleration in m/s²; defaults to 9.8. */
  gravity?: number;
  /** Linear air drag per second; defaults to 0.6. */
  drag?: number;
  /** Adds a random brightness flicker, as for crackling cracker sparks. */
  crackle?: boolean;
  /**
   * Leaves a fading tail behind every spark: each one drops a small short-lived spark of its own colour every
   * TRAIL_INTERVAL seconds. The value is the tail spark's size as a fraction of the parent's (0 or absent: no tail).
   */
  trail?: number;
}

const DEFAULT_CAPACITY = 40000;
const DEFAULT_GRAVITY = 9.8;
const DEFAULT_DRAG = 0.6;
const GROUND_BOUNCE = 0.25;
/** Fraction of horizontal speed kept on each ground contact. */
const GROUND_GRIP = 0.6;
/** Largest sprite in pixels; big enough for the burst flash sprites seen from the courtyard. */
const MAX_POINT_PX = 256;
/** Seconds between the tail sparks a trailing spark drops, and how long each tail spark lives. */
const TRAIL_INTERVAL = 0.022;
const TRAIL_LIFE = 0.38;
const FALLBACK_COLOR = 0xffb347;
/** World up, used as the default burst direction. */
const UP_AXIS = new THREE.Vector3(0, 1, 0);

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aT;
  attribute float aCrackle;
  attribute float aSeed;
  uniform float uPxPerMetre;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBoost;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float t = clamp(aT, 0.0, 1.0);
    // White-hot at birth, then the emission colour, then cooling to a dark ember.
    vec3 c = mix(vec3(1.0, 0.97, 0.88), aColor, smoothstep(0.0, 0.07, t));
    c = mix(c, c * vec3(0.45, 0.22, 0.12), smoothstep(0.4, 1.0, t));
    float flicker = 1.0;
    if (aCrackle > 0.5) {
      flicker = 0.55 + 0.45 * sin(uTime * 37.0 + aSeed * 61.0) * sin(uTime * 23.0 + aSeed * 17.0);
    }
    vColor = c * flicker;
    // Fat stars (aerial bursts) overlap and bloom, so their white-hot core boost is eased off to keep their colour.
    vBoost = mix(1.0, 0.3, smoothstep(0.1, 0.4, aSize));
    vColor *= mix(1.0, 0.8, smoothstep(0.1, 0.4, aSize));
    vAlpha = pow(1.0 - t, 1.3);
    // Size is in metres; projecting by pxPerMetre / depth keeps sparks the same size on screen at any resolution.
    gl_PointSize = min(aSize * uPxPerMetre / max(-mv.z, 0.1), ${MAX_POINT_PX.toFixed(1)});
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBoost;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float soft = 1.0 - d;
    // A hot core over a soft halo: each spark reads as a distinct bright point rather than a blur.
    float core = 1.0 - smoothstep(0.0, 0.3, d);
    gl_FragColor = vec4(vColor * (1.0 + core * vBoost), vAlpha * (soft * soft * 0.5 + core));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Picks a value from a scalar or a [min, max] range using the given unit random number. */
function pick(v: number | [number, number], u: number): number {
  return typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * u;
}

/** Pooled GPU spark particles; emit() starts bursts and update() integrates and uploads them. */
export class SparkSystem implements Updatable {
  private readonly pool: SparkPool;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly t: Float32Array;
  private readonly crackle: Float32Array;
  private readonly seed: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  /** Per spark: tail size as a fraction of its own size (0 for none), and seconds since it last dropped a tail. */
  private readonly trail: Float32Array;
  private readonly trailAcc: Float32Array;
  private readonly attrs: THREE.BufferAttribute[] = [];

  /** One past the highest slot index ever used; bounds the per-frame loop and the upload. */
  private highWater = 0;

  private readonly tmpColor = new THREE.Color();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpU = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  private readonly helperAxis = new THREE.Vector3();

  /** Creates the particle buffers and adds the points object to the scene. */
  constructor(scene: THREE.Scene, capacity = DEFAULT_CAPACITY) {
    this.pool = new SparkPool(capacity);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.t = new Float32Array(capacity);
    this.crackle = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.trail = new Float32Array(capacity);
    this.trailAcc = new Float32Array(capacity);

    const bind = (name: string, array: Float32Array, itemSize: number): void => {
      const attr = new THREE.BufferAttribute(array, itemSize);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attr);
      this.attrs.push(attr);
    };
    bind('position', this.pos, 3);
    bind('aColor', this.color, 3);
    bind('aSize', this.size, 1);
    bind('aT', this.t, 1);
    bind('aCrackle', this.crackle, 1);
    bind('aSeed', this.seed, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPxPerMetre: { value: viewport.pxPerMetre },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // Bounds were computed from the empty buffer, so culling would wrongly hide live bursts.
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Starts a burst of sparks at the given origin; when the pool is full the oldest sparks are recycled. */
  emit(o: EmitOptions): void {
    const dir = this.tmpDir.copy(o.direction ?? UP_AXIS).normalize();
    // Build an orthonormal basis around the cone axis, using a helper axis that is never parallel to it.
    this.helperAxis.set(Math.abs(dir.y) < 0.99 ? 0 : 1, Math.abs(dir.y) < 0.99 ? 1 : 0, 0);
    this.tmpU.crossVectors(this.helperAxis, dir).normalize();
    this.tmpV.crossVectors(dir, this.tmpU);

    const cosMin = Math.cos(o.spread);
    const colors = o.colors.length > 0 ? o.colors : [FALLBACK_COLOR];
    const gravity = o.gravity ?? DEFAULT_GRAVITY;
    const drag = o.drag ?? DEFAULT_DRAG;

    for (let n = 0; n < o.count; n++) {
      const i = this.pool.alloc();
      // Uniform direction inside the cone: cos(theta) is uniform between cosMin and 1.
      const cosT = cosMin + (1 - cosMin) * Math.random();
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = Math.random() * Math.PI * 2;
      const sx = sinT * Math.cos(phi);
      const sy = sinT * Math.sin(phi);
      const dx = sx * this.tmpU.x + sy * this.tmpV.x + cosT * dir.x;
      const dy = sx * this.tmpU.y + sy * this.tmpV.y + cosT * dir.y;
      const dz = sx * this.tmpU.z + sy * this.tmpV.z + cosT * dir.z;
      const speed = pick(o.speed, Math.random());

      const p = i * 3;
      this.pos[p] = o.position.x;
      this.pos[p + 1] = o.position.y;
      this.pos[p + 2] = o.position.z;
      this.vel[p] = dx * speed;
      this.vel[p + 1] = dy * speed;
      this.vel[p + 2] = dz * speed;

      this.tmpColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
      this.color[p] = this.tmpColor.r;
      this.color[p + 1] = this.tmpColor.g;
      this.color[p + 2] = this.tmpColor.b;

      this.size[i] = pick(o.size, Math.random());
      this.life[i] = pick(o.life, Math.random());
      this.age[i] = 0;
      this.t[i] = 0;
      this.crackle[i] = o.crackle ? 1 : 0;
      this.seed[i] = Math.random();
      this.gravity[i] = gravity;
      this.drag[i] = drag;
      this.trail[i] = o.trail ?? 0;
      this.trailAcc[i] = Math.random() * TRAIL_INTERVAL;
      if (i + 1 > this.highWater) this.highWater = i + 1;
    }
  }

  /** Drops one tail spark at spark `i`'s position, in its colour, hanging nearly still with a little jitter. */
  private dropTail(i: number): void {
    const j = this.pool.alloc();
    const p = i * 3;
    const q = j * 3;
    this.pos[q] = this.pos[p];
    this.pos[q + 1] = this.pos[p + 1];
    this.pos[q + 2] = this.pos[p + 2];
    // The tail keeps a sliver of the parent's velocity, so it drifts with the star before it hangs and sinks.
    this.vel[q] = this.vel[p] * 0.08 + (Math.random() - 0.5) * 0.5;
    this.vel[q + 1] = this.vel[p + 1] * 0.08 + (Math.random() - 0.5) * 0.5;
    this.vel[q + 2] = this.vel[p + 2] * 0.08 + (Math.random() - 0.5) * 0.5;
    this.color[q] = this.color[p];
    this.color[q + 1] = this.color[p + 1];
    this.color[q + 2] = this.color[p + 2];
    this.size[j] = this.size[i] * this.trail[i];
    this.life[j] = TRAIL_LIFE * (0.8 + Math.random() * 0.4);
    this.age[j] = 0;
    this.t[j] = 0;
    this.crackle[j] = this.crackle[i];
    this.seed[j] = Math.random();
    this.gravity[j] = 1.5;
    this.drag[j] = 3;
    this.trail[j] = 0;
    this.trailAcc[j] = 0;
    if (j + 1 > this.highWater) this.highWater = j + 1;
  }

  /** Integrates live sparks, bounces them off the ground, retires expired ones and uploads changed ranges. */
  update(dt: number, t: number): void {
    const hw = this.highWater;
    for (let i = 0; i < hw; i++) {
      if (!this.pool.isInUse(i)) continue;
      const age = this.age[i] + dt;
      if (age >= this.life[i]) {
        this.pool.release(i);
        this.size[i] = 0;
        this.t[i] = 1;
        this.age[i] = age;
        continue;
      }
      this.age[i] = age;
      const p = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[p] *= k;
      this.vel[p + 1] = this.vel[p + 1] * k - this.gravity[i] * dt;
      this.vel[p + 2] *= k;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;

      if (this.pos[p + 1] < 0) {
        this.pos[p + 1] = 0;
        if (this.vel[p + 1] < 0) this.vel[p + 1] = -this.vel[p + 1] * GROUND_BOUNCE;
        this.vel[p] *= GROUND_GRIP;
        this.vel[p + 2] *= GROUND_GRIP;
      }
      this.t[i] = age / this.life[i];

      // A trailing spark drops a small, slowly sinking copy of itself behind it, so its path reads as a streak.
      if (this.trail[i] > 0) {
        this.trailAcc[i] += dt;
        if (this.trailAcc[i] >= TRAIL_INTERVAL) {
          this.trailAcc[i] = 0;
          this.dropTail(i);
        }
      }
    }

    if (this.pool.alive === 0) this.highWater = 0;
    this.geometry.setDrawRange(0, this.highWater);
    this.material.uniforms.uPxPerMetre.value = viewport.pxPerMetre;
    this.material.uniforms.uTime.value = t;
    if (this.highWater > 0) {
      for (const attr of this.attrs) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, this.highWater * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
  }
}
