// Night sky and horizon: a gradient dome, twinkling stars, a hazy moon, neighbouring house silhouettes
// with warm windows, a distant shikhara with one lamp, dark fields, and far-off firework bursts. The
// bursts use their own small pool, separate from the main spark system, and report each one through
// `onFarBurst` so audio can be scheduled with the sound's travel delay.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { PALETTE } from '../core/palette';
import { viewport } from '../core/viewport';
import { rng } from './textures';
import { MOON_DIRECTION } from './Lighting';

const DOME_R = 340;
const STAR_R = 330;
const STAR_COUNT = 1500;
const MOON_R = 320;
const HOUSE_COUNT = 14;
/** Half-angle of the open southern approach, in radians, where no neighbour houses are placed. */
const SOUTH_GAP = 0.5;
const SHIKHARA_DIST = 80;
const SHIKHARA_H = 30;
/** Spire radius at height y above its base; the lathe profile and the lamp placement both use it. */
function spireRadius(y: number): number {
  const f = 1 - y / SHIKHARA_H;
  return 5.5 * Math.pow(f, 1.7) + 0.5;
}
const SOUND_SPEED = 343;
const BURST_SLOTS = 2;
const BURST_MAX = 120;
const BURST_GRAVITY = 3;
const BURST_DRAG = 0.6;
/** Dome gradient stops: a saffron-rose horizon, a deep indigo middle and a dark indigo zenith. */
const HORIZON = 0x5a3550;
const MID = 0x3a2a5a;
const ZENITH = 0x0b1030;
/** Colour of the warm glow band that lies low on the horizon, where the whole village lamplight rises. */
const GLOW = 0xffa050;
/** Burst colours: gold, red, green, white; muted so distant bursts read as far away, not neon. */
const BURST_COLORS = [0xf2c14e, 0xc8483a, 0x6fb070, 0xf4ecdc].map((hex) => new THREE.Color(hex));

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
  }
`;

/** One firework slot in the far-burst pool: its particles live in the shared buffers at index * BURST_MAX. */
interface Burst {
  index: number;
  active: boolean;
  age: number;
  life: number;
  count: number;
  origin: THREE.Vector3;
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

/** Triangular-section roof with its ridge along z, used for the silhouette houses. */
function gableRoof(w: number, h: number, d: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const v = [
    // Two sloped pitches, each a quad as two triangles.
    -hw, 0, -hd, -hw, 0, hd, 0, h, hd,
    -hw, 0, -hd, 0, h, hd, 0, h, -hd,
    hw, 0, -hd, 0, h, -hd, 0, h, hd,
    hw, 0, -hd, 0, h, hd, hw, 0, hd,
    // Gable ends at each z face.
    -hw, 0, hd, hw, 0, hd, 0, h, hd,
    -hw, 0, -hd, 0, h, -hd, hw, 0, -hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Night sky, horizon silhouettes and distant bursts; add once and register with the engine. */
export class Sky implements Updatable {
  /** Called once per distant burst with its world position and sound delay (distance / 343 m/s). */
  onFarBurst: ((pos: THREE.Vector3, delaySec: number) => void) | null = null;

  private readonly stars: THREE.ShaderMaterial;
  private readonly bursts: Burst[] = [];
  private readonly burstPos = new Float32Array(BURST_SLOTS * BURST_MAX * 3);
  private readonly burstVel = new Float32Array(BURST_SLOTS * BURST_MAX * 3);
  private readonly burstBase = new Float32Array(BURST_SLOTS * BURST_MAX * 3);
  private readonly burstCol = new Float32Array(BURST_SLOTS * BURST_MAX * 3);
  private readonly burstPosAttr: THREE.BufferAttribute;
  private readonly burstColAttr: THREE.BufferAttribute;
  private nextBurstAt = 3;

  /** Builds every sky object into the scene: dome, stars, moon, silhouettes, horizon and burst pool. */
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
    this.buildHorizon(scene);
    this.buildShikhara(scene);
    this.buildFields(scene);
    this.burstPosAttr = new THREE.BufferAttribute(this.burstPos, 3);
    this.burstColAttr = new THREE.BufferAttribute(this.burstCol, 3);
    this.burstPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.burstColAttr.setUsage(THREE.DynamicDrawUsage);
    this.buildBursts(scene);
  }

  /** Twinkles the stars and advances the far-burst pool, scheduling a new burst every 4 to 9 seconds. */
  update(dt: number, t: number): void {
    this.stars.uniforms.uTime.value = t;
    this.stars.uniforms.uPixelRatio.value = viewport.pixelRatio;
    if (t >= this.nextBurstAt) {
      const free = this.bursts.find((b) => !b.active);
      if (free) this.launch(free);
      this.nextBurstAt = t + 4 + Math.random() * 5;
    }
    this.stepBursts(dt);
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

  /** Dark neighbouring houses at 25 to 60 m, with a few warm windows each facing the courtyard. */
  private buildHorizon(scene: THREE.Scene): void {
    const r = rng(777);
    const silhouette = new THREE.MeshBasicMaterial({
      color: 0x15121d,
      side: THREE.DoubleSide,
      fog: false,
    });
    const windowPos: number[] = [];
    for (let i = 0; i < HOUSE_COUNT; i++) {
      const a = (i / HOUSE_COUNT) * Math.PI * 2 + (r() - 0.5) * 0.35;
      // Leave the southern approach open: the gate looks out onto fields, not houses.
      if (-Math.cos(a) > Math.cos(SOUTH_GAP)) continue;
      const dist = 25 + r() * 35;
      // Outward unit vector: a = 0 is north (-z), a = PI/2 is east (+x).
      const ux = Math.sin(a);
      const uz = -Math.cos(a);
      const w = 6 + r() * 3;
      const d = 5 + r() * 2;
      const wallH = 3 + r() * 1.5;
      const roofH = 1.8 + r() * 0.6;
      const cx = ux * dist;
      const cz = uz * dist;

      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), silhouette);
      walls.position.set(cx, wallH / 2, cz);
      scene.add(walls);
      const roof = new THREE.Mesh(gableRoof(w, roofH, d), silhouette);
      roof.position.set(cx, wallH, cz);
      scene.add(roof);

      // Windows sit on the face nearest the courtyard, the axis that points most toward the origin.
      const windows = 2 + Math.floor(r() * 3);
      for (let k = 0; k < windows; k++) {
        const t = r() * 2 - 1;
        const y = wallH * (0.3 + 0.5 * r());
        if (Math.abs(ux) > Math.abs(uz)) {
          windowPos.push(cx - Math.sign(ux) * (w / 2 + 0.02), y, cz + t * d * 0.4);
        } else {
          windowPos.push(cx + t * w * 0.4, y, cz - Math.sign(uz) * (d / 2 + 0.02));
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(windowPos, 3));
    scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: PALETTE.flame,
          size: 0.28,
          sizeAttenuation: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      ),
    );
  }

  /** A temple shikhara on a plinth at 80 m north-east, with one lamp in its niche. */
  private buildShikhara(scene: THREE.Scene): void {
    const a = Math.PI / 4;
    const cx = Math.sin(a) * SHIKHARA_DIST;
    const cz = -Math.cos(a) * SHIKHARA_DIST;
    const mat = new THREE.MeshBasicMaterial({ color: 0x17151f, fog: false });

    // Plinth, then the tapering spire revolved from a curved profile.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 14), mat);
    plinth.position.set(cx, 2, cz);
    scene.add(plinth);

    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 12; k++) {
      const y = (SHIKHARA_H * k) / 12;
      profile.push(new THREE.Vector2(spireRadius(y), y));
    }
    profile.push(new THREE.Vector2(0.35, SHIKHARA_H + 1.2), new THREE.Vector2(0, SHIKHARA_H + 2.4));
    const spire = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), mat);
    spire.position.set(cx, 4, cz);
    scene.add(spire);

    // The lone lamp sits on the spire surface facing the village, pushed out from the axis by the spire
    // radius at its height plus a margin, so the opaque spire does not hide it from the aangan.
    const lampY = 14;
    const lampR = spireRadius(lampY) + 0.3;
    const dist = Math.hypot(cx, cz);
    const lx = cx - (cx / dist) * lampR;
    const lz = cz - (cz / dist) * lampR;
    const lamp = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([lx, 4 + lampY, lz], 3),
      ),
      new THREE.PointsMaterial({
        color: PALETTE.flame,
        size: 1.0,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    scene.add(lamp);
  }

  /** Flat dark fields past the village edge: one large ground disc with a few darker plots. */
  private buildFields(scene: THREE.Scene): void {
    const r = rng(9001);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(300, 48),
      new THREE.MeshBasicMaterial({ color: 0x0c0e0b, fog: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    scene.add(ground);

    // Plots sit just above the disc so their depth does not fight it at distance.
    const plotColors = [0x111710, 0x16130c];
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

  /** Allocates the burst pool's point cloud; all particles start dark so nothing shows until launched. */
  private buildBursts(scene: THREE.Scene): void {
    for (let i = 0; i < BURST_SLOTS; i++) {
      this.bursts.push({
        index: i,
        active: false,
        age: 0,
        life: 1,
        count: 0,
        origin: new THREE.Vector3(),
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.burstPosAttr);
    geo.setAttribute('color', this.burstColAttr);
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.9,
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

  /** Starts a burst 60 to 120 m out and 15 to 35 m up, in a random direction around the village. */
  private launch(b: Burst): void {
    const a = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 60;
    const height = 15 + Math.random() * 20;
    b.origin.set(Math.sin(a) * dist, height, -Math.cos(a) * dist);
    b.age = 0;
    b.life = 2.2 + Math.random() * 0.8;
    b.count = 60 + Math.floor(Math.random() * 61);
    b.active = true;

    for (let j = 0; j < BURST_MAX; j++) {
      const p = (b.index * BURST_MAX + j) * 3;
      this.burstPos[p] = b.origin.x;
      this.burstPos[p + 1] = b.origin.y;
      this.burstPos[p + 2] = b.origin.z;
      if (j >= b.count) {
        this.setParticle(p, 0, 0, 0, 0, 0, 0);
        continue;
      }
      // Uniform direction on the sphere, with a speed spread so the burst looks round, not hollow.
      const cosPhi = Math.random() * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const theta = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 4;
      const c = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
      this.setParticle(
        p,
        sinPhi * Math.cos(theta) * speed,
        cosPhi * speed,
        sinPhi * Math.sin(theta) * speed,
        c.r,
        c.g,
        c.b,
      );
    }
    this.burstPosAttr.needsUpdate = true;
    this.onFarBurst?.(b.origin.clone(), b.origin.length() / SOUND_SPEED);
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

  /** Moves live particles under gravity and drag, fading them out as each burst ages. */
  private stepBursts(dt: number): void {
    let dirty = false;
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.age += dt;
      dirty = true;
      const fade = Math.max(0, 1 - b.age / b.life);
      const f = fade * fade;
      const drag = Math.max(0, 1 - BURST_DRAG * dt);
      for (let j = 0; j < b.count; j++) {
        const p = (b.index * BURST_MAX + j) * 3;
        this.burstVel[p + 1] -= BURST_GRAVITY * dt;
        this.burstVel[p] *= drag;
        this.burstVel[p + 1] *= drag;
        this.burstVel[p + 2] *= drag;
        this.burstPos[p] += this.burstVel[p] * dt;
        this.burstPos[p + 1] += this.burstVel[p + 1] * dt;
        this.burstPos[p + 2] += this.burstVel[p + 2] * dt;
        this.burstCol[p] = this.burstBase[p] * f;
        this.burstCol[p + 1] = this.burstBase[p + 1] * f;
        this.burstCol[p + 2] = this.burstBase[p + 2] * f;
      }
      if (b.age >= b.life) {
        // Clear the colours so the dead particles vanish under additive blending.
        b.active = false;
        for (let j = 0; j < b.count; j++) {
          const p = (b.index * BURST_MAX + j) * 3;
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
