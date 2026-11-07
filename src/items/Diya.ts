// Clay oil lamps (diyas). `Diya` is a single lamp that owns a flickering PointLight for the few
// lamps near the player; `DiyaField` batches the many decorative lamps into one InstancedMesh and one
// Points cloud, with the flicker done in the shader, so they add no lights and no per-lamp draw calls.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { PALETTE } from '../core/palette';
import { viewport } from '../core/viewport';

/** Terracotta of the bowl; not in the shared palette because only clay uses it. */
export const CLAY = 0x9a5a34;
/** Hot wick-core colour for the inner flame sprite. */
const FLAME_CORE = 0xfff0c0;
/** Height of the flame base above the bowl origin, in unscaled metres. */
const FLAME_BASE = 0.05;
const LIGHT_INTENSITY = 2.9;
const LIGHT_DISTANCE = 9;
/** Radius/height profile of the bowl, revolved around the Y axis; the inner wall ends at the oil level. */
const BOWL_PROFILE: [number, number][] = [
  [0, 0],
  [0.035, 0],
  [0.055, 0.012],
  [0.072, 0.03],
  [0.076, 0.046],
  [0.068, 0.054],
  [0.058, 0.044],
  [0.04, 0.034],
  [0, 0.034],
];

/** Small deterministic hash in [0, 1), so instance variation is the same on every load. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** 1D value noise in [0, 1), smooth between integer lattice points. */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash01(i) * (1 - u) + hash01(i + 1) * u;
}

/** Flame brightness/size multiplier around 1.0 (about +-16%); layered sines plus noise so it never looks periodic. */
export function flicker(t: number, phase: number): number {
  const sines = 0.6 * Math.sin(t * 9.7 + phase) + 0.4 * Math.sin(t * 17.3 + phase * 2.1);
  const wobble = noise1(t * 5 + phase) * 2 - 1;
  return 1 + 0.08 * sines + 0.08 * wobble;
}

/** Shared lathe geometry for the bowl at unit scale. */
function bowlGeometry(): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    BOWL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  );
}

let flameTex: THREE.CanvasTexture | null = null;

/** Teardrop flame drawn once on canvas: bright at the wick, fading to transparent at the tip. */
function flameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.bezierCurveTo(56, 50, 52, 96, 32, 128);
    ctx.bezierCurveTo(12, 96, 8, 50, 32, 0);
    ctx.fill();
  }
  flameTex = new THREE.CanvasTexture(canvas);
  return flameTex;
}

/** One clay lamp with an optional flickering warm light; the caller adds `object` to the scene. */
export class Diya implements Updatable {
  /** Root group: bowl, wick, flame sprites and the optional light, positioned at the bowl base. */
  readonly object: THREE.Group;
  /** World position of the flame base, for systems that need to light fuses from it. */
  readonly flameWorldPos: THREE.Vector3;

  private readonly outer: THREE.Sprite;
  private readonly inner: THREE.Sprite;
  private readonly light: THREE.PointLight | null = null;
  private readonly phase: number;

  /** Builds the bowl, wick and two stacked flame sprites; `light` adds the lamp's own PointLight. */
  constructor(position: THREE.Vector3, opts: { light?: boolean; scale?: number } = {}) {
    const scale = opts.scale ?? 1;
    this.object = new THREE.Group();
    this.object.position.copy(position);
    this.object.scale.setScalar(scale);
    // Phase from the position keeps each lamp's flicker distinct but reproducible.
    this.phase = (position.x * 12.9 + position.z * 78.2 + position.y * 3.1) % 50;
    this.flameWorldPos = position.clone().add(new THREE.Vector3(0, FLAME_BASE * scale, 0));

    // Clay bowl, double-sided so the open top shows the inner wall and oil.
    const bowl = new THREE.Mesh(
      bowlGeometry(),
      new THREE.MeshStandardMaterial({
        color: CLAY,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    this.object.add(bowl);

    // Dark cotton wick standing out of the oil.
    const wick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.014, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 1, metalness: 0 }),
    );
    wick.position.y = FLAME_BASE - 0.005;
    this.object.add(wick);

    // Outer flame: warm and translucent; inner flame: hotter, smaller, sits on the wick.
    this.outer = this.flameSprite(PALETTE.flame, 0.8);
    this.outer.position.y = FLAME_BASE + 0.04;
    this.inner = this.flameSprite(FLAME_CORE, 0.9);
    this.inner.position.y = FLAME_BASE + 0.03;
    this.object.add(this.outer, this.inner);

    if (opts.light) {
      this.light = new THREE.PointLight(PALETTE.flame, LIGHT_INTENSITY, LIGHT_DISTANCE, 2);
      this.light.position.y = FLAME_BASE + 0.03;
      this.object.add(this.light);
    }
  }

  /** Flickers the flame sprites and, when lit, the point light. */
  update(_dt: number, t: number): void {
    const f = flicker(t, this.phase);
    const g = flicker(t * 1.3 + 4, this.phase);
    this.outer.scale.set(0.07 * g, 0.12 * f, 1);
    this.inner.scale.set(0.035 * g, 0.06 * f, 1);
    if (this.light) this.light.intensity = LIGHT_INTENSITY * f;
  }

  /** Additive, depth-free flame sprite using the shared teardrop texture. */
  private flameSprite(color: number, opacity: number): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flameTexture(),
        color,
        opacity,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    return sprite;
  }
}

/** Shader-driven flicker for DiyaField: flame size and brightness vary per point, no CPU updates. */
const FIELD_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uPxScale;
  varying float vFlick;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float f = 1.0 + 0.08 * (0.6 * sin(uTime * 9.7 + aPhase) + 0.4 * sin(uTime * 17.3 + aPhase * 2.1))
      + 0.08 * sin(uTime * 5.0 + aPhase * 3.7);
    vFlick = f;
    gl_PointSize = aSize * uPxScale * f / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/** Round soft flame with a hot centre, drawn additively. */
const FIELD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vFlick;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5, 0.42));
    float a = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uColor, vec3(1.0, 0.93, 0.75), a * a);
    gl_FragColor = vec4(col * vFlick, a * 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Batches many small decorative lamps: one InstancedMesh of bowls and one Points cloud of flames. */
export class DiyaField implements Updatable {
  private readonly material: THREE.ShaderMaterial;

  /** Adds the bowls and flames for every position to the scene; no lights are created. */
  constructor(scene: THREE.Scene, positions: THREE.Vector3[]) {
    const n = positions.length;
    const bowls = new THREE.InstancedMesh(
      bowlGeometry(),
      new THREE.MeshStandardMaterial({
        color: CLAY,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      n,
    );
    const flamePos = new Float32Array(n * 3);
    const flameSize = new Float32Array(n);
    const flamePhase = new Float32Array(n);
    const m = new THREE.Matrix4();
    const identity = new THREE.Quaternion();
    const s = new THREE.Vector3();
    positions.forEach((p, i) => {
      // Slight size variation so the courtyard does not read as a copy-paste row.
      const k = 0.85 + 0.3 * hash01(i + 1);
      s.set(k, k, k);
      m.compose(p, identity, s);
      bowls.setMatrixAt(i, m);
      flamePos.set([p.x, p.y + FLAME_BASE * k, p.z], i * 3);
      flameSize[i] = 0.07 * k;
      flamePhase[i] = hash01(i + 101) * Math.PI * 2;
    });
    bowls.instanceMatrix.needsUpdate = true;
    scene.add(bowls);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(flamePos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(flameSize, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(flamePhase, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        // Overwritten each frame from the shared viewport; this is only the value before the first frame.
        uPxScale: { value: viewport.pxPerMetre },
        uColor: { value: new THREE.Color(PALETTE.flame) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(geo, this.material));
  }

  /** Feeds the shared clock and the viewport pixel scale to the flame shader. */
  update(_dt: number, t: number): void {
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uPxScale.value = viewport.pxPerMetre;
  }
}
