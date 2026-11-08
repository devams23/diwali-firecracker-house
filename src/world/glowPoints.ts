// A cloud of soft glowing dots, one draw call: used for far village lights on the hills, fairy lights on the
// neighbouring houses and lamps on the lane. Each dot has its own colour, size (in metres) and twinkle phase, and is
// drawn additively, unlit and without fog, so no real light is needed and the bloom pass makes it glow.
import * as THREE from 'three';
import type { Updatable } from '../core/Engine';
import { viewport } from '../core/viewport';

/** One dot of a glow cloud. */
export interface GlowDot {
  pos: THREE.Vector3;
  /** Colour; channels above 1 push the dot into the bloom. */
  color: THREE.Color;
  /** World size in metres (diameter of the soft dot). */
  size: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPxPerMetre;
  uniform float uTwinkle;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Twinkle between 55% and 100% at a rate that differs per dot.
    float tw = 1.0 - uTwinkle * (0.45 + 0.45 * sin(uTime * (1.3 + aPhase * 0.35) + aPhase * 6.0));
    vColor = aColor * tw;
    gl_PointSize = clamp(aSize * uPxPerMetre / max(-mv.z, 0.1), 1.5, 64.0);
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.6);
    gl_FragColor = vec4(vColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A twinkling cloud of glow dots; add `points` to the scene and register the object with the engine. */
export class GlowField implements Updatable {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  /** Builds the cloud from its dots; `twinkle` is the depth of the flicker, 0 (steady) to 1 (deep). */
  constructor(dots: GlowDot[], twinkle = 0.6) {
    const n = dots.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    dots.forEach((d, i) => {
      pos.set([d.pos.x, d.pos.y, d.pos.z], i * 3);
      col.set([d.color.r, d.color.g, d.color.b], i * 3);
      size[i] = d.size;
      // A fixed pseudo-random phase per dot, so the twinkle is the same on every load.
      phase[i] = (Math.sin(i * 12.9898 + d.pos.x * 0.37 + d.pos.z * 0.11) * 43758.5453) % 1;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPxPerMetre: { value: viewport.pxPerMetre },
        uTwinkle: { value: twinkle },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  /** Advances the twinkle clock and keeps the dot size matched to the current resolution. */
  update(_dt: number, t: number): void {
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uPxPerMetre.value = viewport.pxPerMetre;
  }
}
