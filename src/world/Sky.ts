// Night sky and horizon: a gradient dome, twinkling stars, a glowing moon, dusky fields, and a festival sky of distant fireworks.
// Each rocket climbs from the fields with a glowing trail, bursts high over the village in a peony, willow
// or ring shape, and sometimes fires in pairs. Bursts use their own small pool, separate from the main spark
// system, and report each one through `onFarBurst` (at the moment it opens) so audio can be scheduled with the
// sound's travel delay.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { viewport } from '../core/viewport';
import { rng } from './textures';
import { MOON_DIRECTION } from './Lighting';

const DOME_R = 340;
const STAR_R = 330;
const STAR_COUNT = 1500;
const MOON_R = 320;
const SOUND_SPEED = 343;
/** Rockets that can be climbing or bursting at the same time. */
/** Shells that can be climbing or bursting at the same time; a salvo of six needs room for all of them. */
const BURST_SLOTS = 8;
/** Most particles one burst can have. */
const BURST_MAX = 240;
/** Glowing trail particles behind each rising rocket. */
const TRAIL = 14;
/** Seconds between the trail samples, so the trail is about TRAIL * TRAIL_STEP long in time. */
const TRAIL_STEP = 0.03;
/** Particles per rocket slot: the trail first, then the burst. */
const SLOT_SIZE = TRAIL + BURST_MAX;
/** Particles in the shared buffers for the whole pool. */
const PARTICLES = BURST_SLOTS * SLOT_SIZE;
/** Launch sites lie this far (metres) from the village centre, on the fields around it. */
const LAUNCH_NEAR = 90;
const LAUNCH_FAR = 170;
/** Brightness of each burst particle relative to its colour; keeps hundreds of additive sparks from saturating to white. */
const BURST_GAIN = 0.6;
/** Half-width, in radians, of the arc a salvo's launch fields are spread across around its aim. */
const SALVO_SPREAD = 0.45;
/** Lowest burst height and the spread above it, in metres. */
const APEX_MIN = 40;
const APEX_RANGE = 30;
/** Seconds a rocket takes to climb, and the spread above the minimum. */
const RISE_MIN = 0.9;
const RISE_RANGE = 0.4;
/** Game time of the first launch, so the village is seen before the show starts. */
const FIRST_SHOW_AT = 2.5;
/** Seconds between launch cues, from the first to the last. */
const CUE_MIN = 2.2;
const CUE_RANGE = 2.8;
/** Chance that a cue fires a second rocket at once, for a pair. */
const SALVO_CHANCE = 0.3;
/** Dome gradient stops: a magenta-rose horizon, a violet middle and a deep blue zenith. */
const HORIZON = 0xd2557e;
const MID = 0x5b2fa0;
const ZENITH = 0x0c1f66;
/** Colour of the warm glow band that lies low on the horizon, where the whole village lamplight rises. */
const GLOW = 0xffa050;
/** Burst colours: gold, saffron, red, green and white, muted so distant bursts read as far away, not neon. */
const FIREWORK_COLORS = [0xf2c14e, 0xffd27a, 0xff8a1a, 0xd8443a, 0x6fb070, 0xf4ecdc].map((hex) => new THREE.Color(hex));
/** Willow bursts use only the golds, which read as the drooping gold of a willow. */
const GOLD_COLORS = [0xf2c14e, 0xffd27a].map((hex) => new THREE.Color(hex));
/** Head of a rising rocket: bright warm white, pushed above 1 so the bloom catches it. */
const HEAD_COLOR = new THREE.Color(2.2, 2.0, 1.5);
/** Shape of a burst: how many particles, how fast they leave, how long they hang and how they fall. */
type FireworkShape = 'peony' | 'willow' | 'ring';
interface ShapeSpec {
  count: [number, number];
  speed: [number, number];
  life: [number, number];
  gravity: number;
  drag: number;
}
const SHAPES: Record<FireworkShape, ShapeSpec> = {
  peony: { count: [180, 230], speed: [8, 13], life: [2.6, 3.0], gravity: 3, drag: 0.6 },
  willow: { count: [150, 200], speed: [4, 8], life: [4.0, 4.6], gravity: 2.2, drag: 1.1 },
  ring: { count: [130, 160], speed: [9, 10], life: [2.4, 2.7], gravity: 3, drag: 0.6 },
};
const SHAPE_NAMES: FireworkShape[] = ['peony', 'willow', 'ring'];

/** A uniform random number in [lo, hi). */
function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** A random element of a non-empty array. */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** A uniformly random direction on the unit sphere. */
function randomDirection(): THREE.Vector3 {
  const cosPhi = Math.random() * 2 - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  const theta = Math.random() * Math.PI * 2;
  return new THREE.Vector3(sinPhi * Math.cos(theta), cosPhi, sinPhi * Math.sin(theta));
}

/** Dome shader: horizon haze blends up to the zenith; drawn first so every other sky object is in front. */
const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOME_FRAG = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uMid;
  uniform vec3 uZenith;
  uniform vec3 uGlow;
  varying vec3 vDir;
  void main() {
    float y = max(vDir.y, 0.0);
    // Three stops: saffron-rose at the horizon, indigo mid-sky, then the dark zenith.
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, y));
    col = mix(col, uZenith, smoothstep(0.25, 0.7, y));
    // A warm band low on the horizon, so the whole village reads as lamp-lit under the sky.
    col += uGlow * 0.4 * exp(-y * y * 40.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Star shader: each star twinkles at its own phase; the point is a soft round dot. */
const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vBright = 0.65 + 0.35 * sin(uTime * (1.1 + aPhase * 0.3) + aPhase);
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vBright;
  void main() {
    float a = smoothstep(0.5, 0.0, length(gl_PointCoord - vec2(0.5)));
    gl_FragColor = vec4(vColor * vBright, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * One rocket slot in the firework pool. Its particles live in the shared buffers from index * SLOT_SIZE: the first
 * TRAIL are the rising trail, the rest are the burst. A slot climbs from `start` to `apex` over `rise` seconds, then
 * bursts and fades over `life` seconds.
 */
interface Rocket {
  index: number;
  active: boolean;
  /** True while the rocket climbs; false once it has burst. */
  rising: boolean;
  /** Seconds since launch while climbing, then seconds since the burst. */
  age: number;
  /** Seconds of climb before the burst. */
  rise: number;
  /** Seconds the burst lasts once open. */
  life: number;
  /** Particles in the burst. */
  count: number;
  shape: FireworkShape;
  /** Ground point the rocket launched from. */
  start: THREE.Vector3;
  /** Point where the burst opens; the sound is timed from here. */
  apex: THREE.Vector3;
}

/** Soft radial moon with a hazy halo, drawn once on canvas. */
function moonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(246,242,228,1)');
    g.addColorStop(0.1, 'rgba(240,236,220,1)');
    g.addColorStop(0.13, 'rgba(236,230,210,0.95)');
    g.addColorStop(0.22, 'rgba(220,214,200,0.25)');
    g.addColorStop(0.5, 'rgba(200,190,180,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * A soft round sprite for the burst particles: a bright core fading to nothing at the edge, so each spark reads as a
 * point of light rather than a square.
 */
function sparkSprite(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Night sky, horizon silhouettes and the festival firework show; add once and register with the engine. */
export class Sky implements Updatable {
  /** Called once per distant burst, when it opens, with its world position and sound delay (distance / 343 m/s). */
  onFarBurst: ((pos: THREE.Vector3, delaySec: number) => void) | null = null;

  private readonly stars: THREE.ShaderMaterial;
  private readonly rockets: Rocket[] = [];
  private readonly burstPos = new Float32Array(PARTICLES * 3);
  private readonly burstVel = new Float32Array(PARTICLES * 3);
  private readonly burstBase = new Float32Array(PARTICLES * 3);
  private readonly burstCol = new Float32Array(PARTICLES * 3);
  private readonly burstPosAttr: THREE.BufferAttribute;
  private readonly burstColAttr: THREE.BufferAttribute;
  private nextCueAt = FIRST_SHOW_AT;

  /** Builds every sky object into the scene: dome, stars, moon, silhouettes, horizon and firework pool. */
  constructor(scene: THREE.Scene) {
    // Dome: an inverted sphere with the gradient shader; depth writes off so it never hides anything.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 48, 24),
      new THREE.ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        uniforms: {
          uHorizon: { value: new THREE.Color(HORIZON) },
          uMid: { value: new THREE.Color(MID) },
          uZenith: { value: new THREE.Color(ZENITH) },
          uGlow: { value: new THREE.Color(GLOW) },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);

    this.stars = this.buildStars(scene);
    this.buildMoon(scene);
    this.buildFields(scene);
    this.burstPosAttr = new THREE.BufferAttribute(this.burstPos, 3);
    this.burstColAttr = new THREE.BufferAttribute(this.burstCol, 3);
    this.burstPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.burstColAttr.setUsage(THREE.DynamicDrawUsage);
    this.buildRockets(scene);
  }

  /** Twinkles the stars, fires launch cues through the show and advances the rockets and bursts. */
  update(dt: number, t: number): void {
    this.stars.uniforms.uTime.value = t;
    this.stars.uniforms.uPixelRatio.value = viewport.pixelRatio;
    if (t >= this.nextCueAt) {
      this.cue();
      this.nextCueAt = t + between(CUE_MIN, CUE_MIN + CUE_RANGE);
    }
    this.stepRockets(dt);
  }

  /** Fires one cue: a rocket from a free slot, and sometimes a second one at the same moment for a pair. */
  private cue(): void {
    const first = this.rockets.find((r) => !r.active);
    if (first) this.launch(first);
    if (Math.random() < SALVO_CHANCE) {
      const second = this.rockets.find((r) => !r.active);
      if (second) this.launch(second);
    }
  }

  /** Scatters ~1500 stars over the upper hemisphere with per-star colour, size and twinkle phase. */
  private buildStars(scene: THREE.Scene): THREE.ShaderMaterial {
    const r = rng(4242);
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const phase = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Rejection-sample a direction on the sphere, keeping only directions above the horizon.
      let x = 0;
      let y = 0;
      let z = 0;
      let len2 = 0;
      do {
        x = r() * 2 - 1;
        y = r() * 2 - 1;
        z = r() * 2 - 1;
        len2 = x * x + y * y + z * z;
      } while (len2 > 1 || len2 < 0.01 || y < 0.03);
      const len = Math.sqrt(len2);
      pos.set([(x / len) * STAR_R, (y / len) * STAR_R, (z / len) * STAR_R], i * 3);
      // Most stars are cool white; a minority lean warm like the village lamps.
      const warm = r() < 0.2 ? 1 : 0;
      const k = 0.75 + 0.5 * r();
      col.set([k, k * (warm ? 0.85 : 0.94), k * (warm ? 0.6 : 1)], i * 3);
      size[i] = 0.9 + r() * 1.4;
      phase[i] = r() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: viewport.pixelRatio } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    scene.add(stars);
    return mat;
  }

  /** Low, partly hazy moon sprite placed along MOON_DIRECTION so the key light and disc agree. */
  private buildMoon(scene: THREE.Scene): void {
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
        fog: false,
      }),
    );
    moon.position.copy(MOON_DIRECTION).multiplyScalar(MOON_R);
    moon.scale.set(30, 30, 1);
    scene.add(moon);
  }

  /** Flat dark fields past the village edge: one large ground disc with a few darker plots. */
  private buildFields(scene: THREE.Scene): void {
    const r = rng(9001);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(300, 48),
      new THREE.MeshBasicMaterial({ color: 0x2b2440, fog: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    scene.add(ground);

    // Plots sit just above the disc so their depth does not fight it at distance.
    const plotColors = [0x30283f, 0x2a2a34];
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2;
      const dist = 40 + r() * 110;
      const plot = new THREE.Mesh(
        new THREE.PlaneGeometry(12 + r() * 18, 8 + r() * 12),
        new THREE.MeshBasicMaterial({ color: plotColors[i % 2], fog: false }),
      );
      plot.rotation.x = -Math.PI / 2;
      plot.rotation.z = r() * Math.PI;
      plot.position.set(Math.sin(a) * dist, -0.015, -Math.cos(a) * dist);
      scene.add(plot);
    }
  }

  /** Allocates the rocket pool and its point cloud; all particles start dark so nothing shows until launched. */
  private buildRockets(scene: THREE.Scene): void {
    for (let i = 0; i < BURST_SLOTS; i++) {
      this.rockets.push({
        index: i,
        active: false,
        rising: false,
        age: 0,
        rise: 1,
        life: 1,
        count: 0,
        shape: 'peony',
        start: new THREE.Vector3(),
        apex: new THREE.Vector3(),
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.burstPosAttr);
    geo.setAttribute('color', this.burstColAttr);
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        vertexColors: true,
        map: sparkSprite(),
        size: 4.2,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    points.frustumCulled = false;
    scene.add(points);
  }

  /**
   * Fires a salvo of six shells at once, a mix of peony, willow and ring, from six free slots. The launch fields are
   * spread about the given yaw (radians, 0 is straight ahead down -z), so the shells fall inside a view turned that way.
   */
  salvo(aim: number): void {
    const shapes: FireworkShape[] = ['peony', 'willow', 'ring', 'peony', 'ring', 'willow'];
    for (const shape of shapes) {
      const slot = this.rockets.find((r) => !r.active);
      if (slot) this.launch(slot, shape, aim);
    }
  }

  /** How many shells are bursting right now, that is, opened and not yet faded; used to time a capture. */
  burstingCount(): number {
    return this.rockets.filter((r) => r.active && !r.rising).length;
  }

  /** Starts a rocket from a field 90 to 170 m out, climbing to a burst 40 to 70 m up over the village. */
  private launch(b: Rocket, shape?: FireworkShape, aim?: number): void {
    const a = aim === undefined ? Math.random() * Math.PI * 2 : aim + between(-SALVO_SPREAD, SALVO_SPREAD);
    const dist = between(LAUNCH_NEAR, LAUNCH_FAR);
    b.start.set(Math.sin(a) * dist, 0, -Math.cos(a) * dist);
    // The burst opens a little off the launch line, so the rockets do not all rise on one column.
    b.apex.set(b.start.x + between(-6, 6), between(APEX_MIN, APEX_MIN + APEX_RANGE), b.start.z + between(-6, 6));
    b.rise = between(RISE_MIN, RISE_MIN + RISE_RANGE);
    b.shape = shape ?? pick(SHAPE_NAMES);
    b.age = 0;
    b.rising = true;
    b.active = true;
  }

  /** Opens a rocket's burst at its apex: a sphere, a ring or a willow, with particles that share two colours. */
  private explode(b: Rocket): void {
    const spec = SHAPES[b.shape];
    b.rising = false;
    b.age = 0;
    b.count = Math.floor(between(spec.count[0], spec.count[1] + 1));
    b.life = between(spec.life[0], spec.life[1]);
    const base = b.index * SLOT_SIZE;
    // The trail goes dark as the head opens, so only the burst is left.
    for (let k = 0; k < TRAIL; k++) {
      const p = (base + k) * 3;
      this.burstCol[p] = 0;
      this.burstCol[p + 1] = 0;
      this.burstCol[p + 2] = 0;
    }

    const palette = b.shape === 'willow' ? GOLD_COLORS : FIREWORK_COLORS;
    const first = pick(palette);
    const second = pick(palette);
    // Ring bursts lie in a random plane: two orthogonal axes span it, and the particles sweep round them.
    const normal = randomDirection();
    const helper = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ringU = new THREE.Vector3().crossVectors(normal, helper).normalize();
    const ringV = new THREE.Vector3().crossVectors(normal, ringU);

    for (let j = 0; j < BURST_MAX; j++) {
      const p = (base + TRAIL + j) * 3;
      this.burstPos[p] = b.apex.x;
      this.burstPos[p + 1] = b.apex.y;
      this.burstPos[p + 2] = b.apex.z;
      if (j >= b.count) {
        this.setParticle(p, 0, 0, 0, 0, 0, 0);
        continue;
      }
      let dir: THREE.Vector3;
      if (b.shape === 'ring') {
        const theta = (j / b.count) * Math.PI * 2;
        dir = new THREE.Vector3().addScaledVector(ringU, Math.cos(theta)).addScaledVector(ringV, Math.sin(theta));
      } else {
        dir = randomDirection();
      }
      const speed = between(spec.speed[0], spec.speed[1]);
      const c = Math.random() < 0.65 ? first : second;
      this.setParticle(p, dir.x * speed, dir.y * speed, dir.z * speed, c.r, c.g, c.b);
    }
    this.burstPosAttr.needsUpdate = true;
    this.onFarBurst?.(b.apex.clone(), b.apex.length() / SOUND_SPEED);
  }

  /** Writes one particle's velocity and base colour; zeros hide it under additive blending. */
  private setParticle(
    p: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
  ): void {
    this.burstVel[p] = vx;
    this.burstVel[p + 1] = vy;
    this.burstVel[p + 2] = vz;
    this.burstBase[p] = r;
    this.burstBase[p + 1] = g;
    this.burstBase[p + 2] = b;
    this.burstCol[p] = this.burstBase[p];
    this.burstCol[p + 1] = this.burstBase[p + 1];
    this.burstCol[p + 2] = this.burstBase[p + 2];
  }

  /**
   * Draws a climbing rocket: the head at its current height, and a trail of samples behind it that fade with age.
   * Samples earlier than the launch are hidden.
   */
  private drawRocket(b: Rocket): void {
    const base = b.index * SLOT_SIZE;
    const climb = Math.min(1, b.age / b.rise);
    for (let k = 0; k < TRAIL; k++) {
      const p = (base + k) * 3;
      const sample = Math.min(1, Math.max(0, (b.age - k * TRAIL_STEP) / b.rise));
      if (b.age - k * TRAIL_STEP < 0) {
        this.burstCol[p] = 0;
        this.burstCol[p + 1] = 0;
        this.burstCol[p + 2] = 0;
        continue;
      }
      this.burstPos[p] = b.start.x + (b.apex.x - b.start.x) * sample;
      this.burstPos[p + 1] = b.start.y + (b.apex.y - b.start.y) * sample;
      this.burstPos[p + 2] = b.start.z + (b.apex.z - b.start.z) * sample;
      const fade = k === 0 ? 1 : 0.55 * (1 - k / TRAIL);
      const c = k === 0 ? HEAD_COLOR : FIREWORK_COLORS[0];
      // The head burns brightest; the trail takes the warm gold of the lamplight.
      this.burstCol[p] = c.r * fade * climb;
      this.burstCol[p + 1] = c.g * fade * climb;
      this.burstCol[p + 2] = c.b * fade * climb;
    }
    this.burstPosAttr.needsUpdate = true;
    this.burstColAttr.needsUpdate = true;
  }

  /**
   * Advances every active rocket: climbs and draws the trail, opens the burst at the apex, and moves the burst
   * particles under the shape's gravity and drag, fading them out as the burst ages.
   */
  private stepRockets(dt: number): void {
    let dirty = false;
    for (const b of this.rockets) {
      if (!b.active) continue;
      b.age += dt;
      dirty = true;
      if (b.rising) {
        this.drawRocket(b);
        if (b.age >= b.rise) this.explode(b);
        continue;
      }
      const spec = SHAPES[b.shape];
      const fade = Math.max(0, 1 - b.age / b.life);
      const f = fade * fade;
      const drag = Math.max(0, 1 - spec.drag * dt);
      for (let j = 0; j < b.count; j++) {
        const p = (b.index * SLOT_SIZE + TRAIL + j) * 3;
        this.burstVel[p + 1] -= spec.gravity * dt;
        this.burstVel[p] *= drag;
        this.burstVel[p + 1] *= drag;
        this.burstVel[p + 2] *= drag;
        this.burstPos[p] += this.burstVel[p] * dt;
        this.burstPos[p + 1] += this.burstVel[p + 1] * dt;
        this.burstPos[p + 2] += this.burstVel[p + 2] * dt;
        this.burstCol[p] = this.burstBase[p] * f * BURST_GAIN;
        this.burstCol[p + 1] = this.burstBase[p + 1] * f * BURST_GAIN;
        this.burstCol[p + 2] = this.burstBase[p + 2] * f * BURST_GAIN;
      }
      if (b.age >= b.life) {
        // Clear the colours so the dead particles vanish under additive blending.
        b.active = false;
        for (let j = 0; j < b.count; j++) {
          const p = (b.index * SLOT_SIZE + TRAIL + j) * 3;
          this.burstCol[p] = 0;
          this.burstCol[p + 1] = 0;
          this.burstCol[p + 2] = 0;
        }
      }
    }
    if (dirty) {
      this.burstPosAttr.needsUpdate = true;
      this.burstColAttr.needsUpdate = true;
    }
  }
}
